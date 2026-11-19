import { Plugin, MarkdownView, Notice } from 'obsidian';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';

interface MatchResult {
	from: number;
	to: number;
	text: string;
	groups: string[];
}

interface SearchState {
	query: string;
	replaceText: string;
	caseSensitive: boolean;
	wholeWord: boolean;
	useRegex: boolean;
	inSelection: boolean;
	selectionBounds: { from: number; to: number } | null;
	matches: MatchResult[];
	currentIndex: number;
}

// CodeMirror effect to update search highlights
const setHighlightsEffect = StateEffect.define<{
	matches: MatchResult[];
	currentIndex: number;
	scope: { from: number; to: number } | null;
}>();

const highlightField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(highlights, tr) {
		highlights = highlights.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(setHighlightsEffect)) {
				const builder = new RangeSetBuilder<Decoration>();
				const { matches, currentIndex, scope } = e.value;

				// Collect all ranges to decorate in ascending order
				const decos: { from: number; to: number; deco: Decoration }[] = [];

				if (scope && scope.from < scope.to) {
					decos.push({
						from: scope.from,
						to: scope.to,
						deco: Decoration.mark({ class: 'cm-afr-scope' })
					});
				}

				matches.forEach((m, idx) => {
					if (m.from < m.to) {
						decos.push({
							from: m.from,
							to: m.to,
							deco: Decoration.mark({
								class: idx === currentIndex ? 'cm-afr-match cm-afr-match-current' : 'cm-afr-match'
							})
						});
					}
				});

				// RangeSetBuilder requires sorting by `from`
				decos.sort((a, b) => a.from - b.from || a.to - b.to);
				for (const d of decos) {
					builder.add(d.from, d.to, d.deco);
				}
				return builder.finish();
			}
		}
		return highlights;
	},
	provide: (f) => EditorView.decorations.from(f),
});

export default class AdvancedFindReplacePlugin extends Plugin {
	private panelEl: HTMLElement;
	private findInput: HTMLInputElement;
	private replaceInput: HTMLInputElement;
	private counterEl: HTMLElement;
	private btnCase: HTMLButtonElement;
	private btnWord: HTMLButtonElement;
	private btnRegex: HTMLButtonElement;
	private btnSelection: HTMLButtonElement;

	private state: SearchState = {
		query: '',
		replaceText: '',
		caseSensitive: false,
		wholeWord: false,
		useRegex: false,
		inSelection: false,
		selectionBounds: null,
		matches: [],
		currentIndex: -1,
	};

	async onload() {
		this.registerEditorExtension([highlightField]);
		this.createUI();
		this.registerCommands();

		// Re-run search when the document changes
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				if (!this.panelEl.hasClass('afr-hidden')) {
					this.performSearch(false);
				}
			})
		);
	}

	onunload() {
		this.clearHighlights();
		this.panelEl?.remove();
	}

	private getActiveEditorView(): EditorView | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return null;
		// @ts-ignore - internal access to the CodeMirror 6 instance
		return view.editor?.cm as EditorView | null;
	}

	private registerCommands() {
		this.addCommand({
			id: 'open-find-panel',
			name: 'Open Find & Replace',
			callback: () => this.openPanel(false),
		});

		this.addCommand({
			id: 'open-replace-panel',
			name: 'Open Find & Replace (focus Replace)',
			callback: () => this.openPanel(true),
		});

		this.addCommand({
			id: 'find-next',
			name: 'Find next',
			callback: () => this.navigate(1),
		});

		this.addCommand({
			id: 'find-previous',
			name: 'Find previous',
			callback: () => this.navigate(-1),
		});

		this.addCommand({
			id: 'replace-current',
			name: 'Replace current match',
			callback: () => this.replaceCurrent(),
		});

		this.addCommand({
			id: 'replace-all',
			name: 'Replace all matches',
			callback: () => this.replaceAll(),
		});

		this.addCommand({
			id: 'toggle-case-sensitive',
			name: 'Toggle Case Sensitive',
			callback: () => this.toggleOption('caseSensitive'),
		});

		this.addCommand({
			id: 'toggle-whole-word',
			name: 'Toggle Whole Word (Unicode)',
			callback: () => this.toggleOption('wholeWord'),
		});

		this.addCommand({
			id: 'toggle-regex',
			name: 'Toggle Regular Expression (Regex)',
			callback: () => this.toggleOption('useRegex'),
		});

		this.addCommand({
			id: 'toggle-selection-scope',
			name: 'Toggle Selection Scope',
			callback: () => this.toggleOption('inSelection'),
		});
	}

	private createUI() {
		this.panelEl = document.body.createDiv({ cls: 'afr-panel afr-hidden' });

		// Row 1: Find input and search options
		const rowFind = this.panelEl.createDiv({ cls: 'afr-row' });
		this.findInput = rowFind.createEl('input', {
			type: 'text',
			placeholder: 'Find...',
			cls: 'afr-input',
		});

		this.btnCase = rowFind.createEl('button', { text: 'Aa', cls: 'afr-btn', title: 'Match case' });
		this.btnWord = rowFind.createEl('button', { text: 'ab', cls: 'afr-btn', title: 'Whole word (Unicode)' });
		this.btnRegex = rowFind.createEl('button', { text: '.*', cls: 'afr-btn', title: 'Use Regex' });
		this.btnSelection = rowFind.createEl('button', { text: 'Sel', cls: 'afr-btn', title: 'Find in selection' });

		// Row 2: Navigation and match counter
		const rowNav = this.panelEl.createDiv({ cls: 'afr-row' });
		const btnPrev = rowNav.createEl('button', { text: '↑', cls: 'afr-btn', title: 'Previous match' });
		const btnNext = rowNav.createEl('button', { text: '↓', cls: 'afr-btn', title: 'Next match' });
		this.counterEl = rowNav.createDiv({ text: '0 / 0', cls: 'afr-counter' });
		rowNav.createDiv({ attr: { style: 'flex:1' } });
		const btnClose = rowNav.createEl('button', { text: '✕', cls: 'afr-btn', title: 'Close (Esc)' });

		// Row 3: Replace input and actions
		const rowReplace = this.panelEl.createDiv({ cls: 'afr-row' });
		this.replaceInput = rowReplace.createEl('input', {
			type: 'text',
			placeholder: 'Replace with ($1..$99, $&, $$)...',
			cls: 'afr-input',
		});
		const btnReplace = rowReplace.createEl('button', { text: 'Replace', cls: 'afr-btn', title: 'Replace current' });
		const btnReplaceAll = rowReplace.createEl('button', { text: 'All', cls: 'afr-btn', title: 'Replace all' });

		// Event listeners
		this.findInput.addEventListener('input', () => {
			this.state.query = this.findInput.value;
			this.performSearch(true);
		});

		this.replaceInput.addEventListener('input', () => {
			this.state.replaceText = this.replaceInput.value;
		});

		this.findInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.navigate(e.shiftKey ? -1 : 1);
			} else if (e.key === 'Escape') {
				this.closePanel();
			}
		});

		this.replaceInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				if (e.ctrlKey || e.metaKey) this.replaceAll();
				else this.replaceCurrent();
			} else if (e.key === 'Escape') {
				this.closePanel();
			}
		});

		this.btnCase.onclick = () => this.toggleOption('caseSensitive');
		this.btnWord.onclick = () => this.toggleOption('wholeWord');
		this.btnRegex.onclick = () => this.toggleOption('useRegex');
		this.btnSelection.onclick = () => this.toggleOption('inSelection');

		btnPrev.onclick = () => this.navigate(-1);
		btnNext.onclick = () => this.navigate(1);
		btnClose.onclick = () => this.closePanel();
		btnReplace.onclick = () => this.replaceCurrent();
		btnReplaceAll.onclick = () => this.replaceAll();
	}

	private openPanel(focusReplace: boolean) {
		const cm = this.getActiveEditorView();
		if (!cm) return;

		this.panelEl.removeClass('afr-hidden');

		const sel = cm.state.selection.main;
		if (!sel.empty) {
			const selectedText = cm.state.sliceDoc(sel.from, sel.to);
			// Automatically enable selection scope if the selection spans multiple lines
			if (selectedText.includes('\n')) {
				this.state.inSelection = true;
				this.state.selectionBounds = { from: sel.from, to: sel.to };
			} else {
				this.state.inSelection = false;
				this.state.selectionBounds = null;
				this.findInput.value = selectedText;
				this.state.query = selectedText;
			}
		} else {
			this.state.inSelection = false;
			this.state.selectionBounds = null;
		}

		this.updateUIButtons();
		this.performSearch(true);

		if (focusReplace) {
			this.replaceInput.focus();
			this.replaceInput.select();
		} else {
			this.findInput.focus();
			this.findInput.select();
		}
	}

	private closePanel() {
		this.panelEl.addClass('afr-hidden');
		this.clearHighlights();
		const cm = this.getActiveEditorView();
		cm?.focus();
	}

	private toggleOption(option: 'caseSensitive' | 'wholeWord' | 'useRegex' | 'inSelection') {
		this.state[option] = !this.state[option];

		if (option === 'inSelection') {
			const cm = this.getActiveEditorView();
			if (this.state.inSelection && cm) {
				const sel = cm.state.selection.main;
				if (!sel.empty) {
					this.state.selectionBounds = { from: sel.from, to: sel.to };
				} else {
					new Notice('No text selected to limit search scope.');
					this.state.inSelection = false;
					this.state.selectionBounds = null;
				}
			} else {
				this.state.selectionBounds = null;
			}
		}

		this.updateUIButtons();
		this.performSearch(true);
	}

	private updateUIButtons() {
		this.btnCase.toggleClass('afr-active', this.state.caseSensitive);
		this.btnWord.toggleClass('afr-active', this.state.wholeWord);
		this.btnRegex.toggleClass('afr-active', this.state.useRegex);
		this.btnSelection.toggleClass('afr-active', this.state.inSelection);
	}

	/**
	 * Builds the RegExp with Unicode whole-word boundary support
	 */
	private buildRegex(): RegExp | null {
		if (!this.state.query) return null;

		let pattern = this.state.useRegex
			? this.state.query
			: this.state.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		if (this.state.wholeWord) {
			// Lookbehind and Lookahead using Unicode property escapes:
			// \p{L} = any Unicode letter (accented chars, Cyrillic, CJK, etc.)
			// \p{N} = any Unicode number
			// _ = underscore (standard word boundary character)
			pattern = `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`;
		}

		// The 'u' flag is required for \p{...} property escapes and proper Unicode surrogate pair handling
		const flags = this.state.caseSensitive ? 'gu' : 'giu';

		try {
			const regex = new RegExp(pattern, flags);
			this.findInput.removeClass('afr-error');
			return regex;
		} catch (e) {
			this.findInput.addClass('afr-error');
			return null;
		}
	}

	private performSearch(jumpToNearest: boolean) {
		const cm = this.getActiveEditorView();
		if (!cm) return;

		const regex = this.buildRegex();
		if (!regex) {
			this.state.matches = [];
			this.state.currentIndex = -1;
			this.updateCounter();
			this.applyHighlights(cm);
			return;
		}

		const docText = cm.state.doc.toString();
		const startOffset = this.state.inSelection && this.state.selectionBounds ? this.state.selectionBounds.from : 0;
		const endOffset = this.state.inSelection && this.state.selectionBounds ? this.state.selectionBounds.to : docText.length;

		const searchArea = docText.slice(startOffset, endOffset);
		const matches: MatchResult[] = [];

		let match: RegExpExecArray | null;
		while ((match = regex.exec(searchArea)) !== null) {
			// Prevent infinite loops on zero-length matches (e.g. `.*` or `^`)
			if (match[0].length === 0) {
				regex.lastIndex++;
				continue;
			}
			matches.push({
				from: startOffset + match.index,
				to: startOffset + match.index + match[0].length,
				text: match[0],
				groups: match.slice(1),
			});
		}

		this.state.matches = matches;

		if (matches.length === 0) {
			this.state.currentIndex = -1;
		} else if (jumpToNearest) {
			const cursorPos = cm.state.selection.main.from;
			const nearestIdx = matches.findIndex((m) => m.from >= cursorPos);
			this.state.currentIndex = nearestIdx !== -1 ? nearestIdx : 0;
			this.scrollToMatch(cm, matches[this.state.currentIndex]);
		} else {
			if (this.state.currentIndex >= matches.length) {
				this.state.currentIndex = matches.length - 1;
			}
		}

		this.updateCounter();
		this.applyHighlights(cm);
	}

	/**
	 * Forward (1) and backward (-1) navigation with wrap-around
	 */
	private navigate(direction: 1 | -1) {
		if (this.panelEl.hasClass('afr-hidden')) {
			this.openPanel(false);
			return;
		}

		const cm = this.getActiveEditorView();
		const total = this.state.matches.length;
		if (!cm || total === 0) return;

		this.state.currentIndex = (this.state.currentIndex + direction + total) % total;
		const match = this.state.matches[this.state.currentIndex];

		this.scrollToMatch(cm, match);
		this.updateCounter();
		this.applyHighlights(cm);
	}

	private scrollToMatch(cm: EditorView, match: MatchResult) {
		cm.dispatch({
			selection: { anchor: match.from, head: match.to },
			effects: EditorView.scrollIntoView(match.from, { y: 'center' }),
		});
	}

	/**
	 * Expands replacement tokens: $$ -> $, $& -> full match, $1..$99 -> capture groups
	 */
	private expandReplacement(template: string, match: MatchResult): string {
		if (!this.state.useRegex) {
			return template;
		}

		return template.replace(/\$(?:\$|&|([1-9][0-9]?))/g, (token, groupNum) => {
			if (token === '$$') return '$';
			if (token === '$&') return match.text;
			if (groupNum) {
				const idx = parseInt(groupNum, 10) - 1;
				return match.groups[idx] !== undefined ? match.groups[idx] : '';
			}
			return token;
		});
	}

	private replaceCurrent() {
		const cm = this.getActiveEditorView();
		if (!cm || this.state.currentIndex === -1 || this.state.matches.length === 0) return;

		const currentMatch = this.state.matches[this.state.currentIndex];
		const replacement = this.expandReplacement(this.state.replaceText, currentMatch);

		// Update selection scope bounds if active
		if (this.state.inSelection && this.state.selectionBounds) {
			const delta = replacement.length - (currentMatch.to - currentMatch.from);
			this.state.selectionBounds.to += delta;
		}

		cm.dispatch({
			changes: {
				from: currentMatch.from,
				to: currentMatch.to,
				insert: replacement,
			},
			selection: { anchor: currentMatch.from + replacement.length },
		});

		// Re-run search keeping the index on the same slot (which now points to the next match)
		this.performSearch(false);
		if (this.state.matches.length > 0) {
			const nextIdx = this.state.currentIndex % this.state.matches.length;
			this.state.currentIndex = nextIdx;
			this.scrollToMatch(cm, this.state.matches[nextIdx]);
			this.updateCounter();
			this.applyHighlights(cm);
		}
	}

	private replaceAll() {
		const cm = this.getActiveEditorView();
		if (!cm || this.state.matches.length === 0) return;

		const changes = this.state.matches.map((match) => ({
			from: match.from,
			to: match.to,
			insert: this.expandReplacement(this.state.replaceText, match),
		}));

		// Apply all replacements in a single atomic transaction (single Undo step with Ctrl+Z)
		cm.dispatch({ changes });

		if (this.state.inSelection && this.state.selectionBounds) {
			const totalDelta = changes.reduce((acc, c) => acc + (c.insert.length - (c.to - c.from)), 0);
			this.state.selectionBounds.to += totalDelta;
		}

		new Notice(`Replaced ${changes.length} occurrences.`);
		this.performSearch(false);
	}

	private updateCounter() {
		const total = this.state.matches.length;
		const current = total > 0 ? this.state.currentIndex + 1 : 0;
		this.counterEl.setText(`${current} / ${total}`);
	}

	private applyHighlights(cm: EditorView) {
		cm.dispatch({
			effects: setHighlightsEffect.of({
				matches: this.state.matches,
				currentIndex: this.state.currentIndex,
				scope: this.state.inSelection ? this.state.selectionBounds : null,
			}),
		});
	}

	private clearHighlights() {
		const cm = this.getActiveEditorView();
		if (!cm) return;
		cm.dispatch({
			effects: setHighlightsEffect.of({
				matches: [],
				currentIndex: -1,
				scope: null,
			}),
		});
	}
}