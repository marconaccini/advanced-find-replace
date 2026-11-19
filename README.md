# Advanced Find & Replace

An **Obsidian** plugin powered by **CodeMirror 6** for performing advanced find and replace operations in the active note with real-time highlighting and atomic transactions.

## Features

- **Literal or Regex Search (`.*`)**: Switch between plain text and regular expressions with the `u` (Unicode) flag and visual validation for invalid patterns.
- **Case Sensitivity (`Aa`)**: Toggle case-sensitive matching (`i`).
- **Whole Word with Unicode Support (`ab`)**: Uses Unicode property lookarounds (`\p{L}`, `\p{N}`, and `_`) to accurately detect word boundaries across accented characters and non-Latin scripts.
- **Selection-Scoped Search (`Sel`)**: Restricts search and replacement to the range selected upon activation (or automatically when opening the panel with a multi-line selection), dynamically adjusting the upper bound as replacements occur.
- **Wrap-Around Navigation (`↑` / `↓`)**: Cycle forward and backward through matches, wrapping around from the end to the beginning (and vice versa), also accessible via `Enter` and `Shift+Enter` from the search input.
- **Current or Global Replacement (`Sost.` / `Tutti`)**: Replace the active match or all matches in a single atomic CodeMirror transaction (revertible with a single `Ctrl+Z` / `Cmd+Z`).
- **Regex Backreferences & Tokens**: Supports captured groups `$1`–`$99`, full match `$&`, and literal dollar sign `$$` when Regex mode is enabled.
- **Configurable Hotkeys**: All core actions and toggles are exposed in the Command Palette and **Settings → Hotkeys**.

## Build & Installation

1. Create or clone the plugin folder containing `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `styles.css`, and `main.ts`.
2. Install dependencies and build the bundle:

```bash
npm install
npm run build
```

3. Copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugins folder:

```text
<Vault>/.obsidian/plugins/advanced-find-replace/
```

4. Open Obsidian, go to **Settings → Community plugins**, reload the plugin list, and enable **Advanced Find & Replace**.

## Using Selection Scope (`Sel`)

1. Highlight a portion of text in the active note.
2. Open the find panel (if the selection spans multiple lines, selection scope is enabled automatically).
3. Alternatively, toggle the **Sel** button (or its corresponding command) while text is selected to lock the search perimeter to that initial range. During single or global replacements, the scope boundaries automatically adjust to reflect changes in text length.

## Available Commands for Hotkeys

You can assign custom shortcuts under **Settings → Hotkeys** for the following commands:

- **Apri Trova e Sostituisci** *(Open Find & Replace)*
- **Apri Trova e Sostituisci (focus su Sostituisci)** *(Open Find & Replace, focus on Replace)*
- **Trova successivo** *(Find Next)*
- **Trova precedente** *(Find Previous)*
- **Sostituisci occorrenza corrente** *(Replace Current Match)*
- **Sostituisci tutto** *(Replace All)*
- **Attiva/Disattiva Maiuscole/Minuscole** *(Toggle Case Sensitivity)*
- **Attiva/Disattiva Parola Intera (Unicode)** *(Toggle Whole Word - Unicode)*
- **Attiva/Disattiva Espressione Regolare (Regex)** *(Toggle Regular Expression)*
- **Attiva/Disattiva Ambito Selezione** *(Toggle Selection Scope)*

---

*Built with Gemini.*