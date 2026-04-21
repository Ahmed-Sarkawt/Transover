# Transover — Claude Guidelines

## Project Overview

**Transover** is a Chrome extension (Manifest V3) that translates text on hover. No clicks, no copying — point and read.

### Architecture

| Layer | Entry Point | Role |
|---|---|---|
| Content script | `src/content/index.ts` | Hover detection, tooltip injection, selection handling |
| Background | `src/background/service-worker.ts` | API proxying, storage coordination |
| Popup | `src/popup/popup.ts` + `index.html` | Settings UI |
| Shared | `src/shared/types.ts` | All shared types, defaults, language list |

**Key source files:**
- `src/content/tooltip.ts` — tooltip rendering and pinning
- `src/content/translator.ts` — engine dispatch and result handling
- `src/content/extractor.ts` — text extraction from DOM nodes
- `src/content/langdetect.ts` — source language detection
- `src/content/posAnalyzer.ts` — grammar overlay (POS color-coding for EN/DE/ES/FR/JA)

### Build

```bash
npm run build        # full build → dist/
npm run dev          # watch mode (content + popup in parallel)
```

Output goes to `dist/`. Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode on).

**Two separate Vite configs:**
- `vite.content.config.ts` — content script bundle
- `vite.popup.config.ts` — popup bundle

### Translation Engines

Supported via `PreferredEngine` type: `chrome` (on-device), `mymemory`, `lingva`, `libretranslate`, `deepl`. Default is `auto` (tries Chrome AI first, falls back down the list).

### Storage

All settings live in `chrome.storage.sync` under the `StorageSchema` interface (`src/shared/types.ts`). Defaults are defined inline alongside each type.

### Permissions

`storage`, `tabs`, `clipboardWrite`. Host permissions for MyMemory and DeepL APIs only — no broad host access.

### Smart Skip

Smart skip (`state.smartSkip`) silently suppresses translation when the hovered text is already in the target language (or a configured known language).

**Detection pipeline** (`detectLangWithFallback`):
1. Chrome AI Language Detector (Chrome 138+, ≥0.80 confidence)
2. Heuristic fallback (`langdetect.ts`): Unicode script → distinctive characters → stop-word scoring → multi-language trigrams (EN/DE/FR/IT)

**Script families** (`SCRIPT_FAMILY` in `langdetect.ts`): Cyrillic (ru/uk/bg/sr/mk/be/kk/tg/ky), CJK (zh/zh-TW), Arabic script (ar/fa/ur/ps). All members of a family count as a match for their representative code.

**UX features:**
- **Force-translate override**: holding the trigger modifier key while hovering skips-eligible text forces a translation through — useful when detection is wrong.
- **Skip indicator**: when smart skip fires, a tiny ghost badge (the detected language code) appears near the cursor for ~900 ms, confirming the suppression.
- **Known languages** (`knownLanguages: string[]`): a user-configurable list of additional languages to skip beyond the target, for polyglots. Exposed as a chip UI under the Smart Skip toggle in the popup.

---

## References

- [Chrome Extension Manifest V3 docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Chrome AI (on-device translation)](https://developer.chrome.com/docs/ai/translator-api)
- `src/shared/types.ts` — canonical source of truth for all config shapes and defaults

---

## Audit Log

Every prompt is automatically logged to `.claude/audit.log` (gitignored).

**Format:**
```
[YYYY-MM-DD HH:MM:SS] duration=Xs | tokens=in:NNNN out:NNNN | files=src/..., src/...
  prompt: <first 200 chars of the prompt>
```

**Fields:**
- `duration` — wall-clock seconds from prompt submission to Stop
- `tokens` — `in` = total input context for last response (fresh + cache); `out` = total output tokens generated across the session
- `files` — source files opened with the Read tool during the session
- `prompt` — first 200 characters of the user's prompt

**How it works:**
- `UserPromptSubmit` hook (`log-start.sh`) — records start timestamp to `/tmp/transover_audit_start.tmp`
- `Stop` hook (`log-stop.sh`) — parses the session transcript JSONL, extracts the above fields, appends one entry to `.claude/audit.log`

---

## Coding Guidelines

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that **your** changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria enable independent looping. Weak criteria ("make it work") require constant clarification.
