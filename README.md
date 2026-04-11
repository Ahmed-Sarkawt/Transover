# Transover — Hover Translator

A Chrome extension that translates text as you hover over it. No clicking, no copying — just point and read.

## What it does

Hover your mouse over any word or sentence on any webpage and a tooltip instantly shows the translation. Works across all sites, all languages.

## Features

- **Hover to translate** — word or full sentence mode
- **Auto language detection** — detects the source language automatically
- **Two-way translation** — translates in both directions between two languages
- **Smart skip** — ignores numbers, icons, and untranslatable content
- **Grammar overlay** — color-codes words by grammatical role (EN, DE, ES, FR, JA)
- **Show original text** — displays source and translation side by side
- **Translate selection** — select any text and release to translate it
- **Pin tooltip** — keep the tooltip open with `Alt+P`
- **Multiple engines** — Chrome AI (on-device), MyMemory, Lingva, LibreTranslate, DeepL
- **Per-site control** — enable or disable on any specific site
- **Customizable appearance** — font size, max width, hide delay, light/dark theme

## How to install

1. Download or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `dist/` folder

## How to use

| Action | Result |
|---|---|
| Hover over text | Translates the word or sentence |
| Hold `Alt` | On-demand translate (when auto-translate is off) |
| Select text + release | Translates the selection |
| `Alt+P` | Pin / unpin the tooltip |
| `Esc` | Dismiss pinned tooltip |

Click the extension icon to open settings and configure languages, engine, and appearance.
