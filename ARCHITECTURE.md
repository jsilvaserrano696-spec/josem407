# Architecture

## Process boundaries

Nano Banana Studio follows standard Electron security practice: the **renderer**
(`ui/`) never touches the filesystem, environment variables, or the Gemini API
directly. It only calls the narrow, typed API exposed by `src/preload/preload.js`
via `contextBridge` (`window.nanoBanana.*`). Those calls become IPC messages
handled in `src/main/ipcHandlers.js`, which delegate to plain Node modules under
`src/`. Those modules have no Electron/IPC awareness at all — they're regular
functions that could be unit tested or reused outside Electron entirely.

```
ui/ (renderer, sandboxed, no Node access)
  → window.nanoBanana.*  (src/preload/preload.js, contextBridge)
    → ipcMain.handle(...)  (src/main/ipcHandlers.js)
      → src/gemini, src/services, src/history, src/prompts, src/styles
```

`contextIsolation: true` and `nodeIntegration: false` are set on the
`BrowserWindow` in `src/main/main.js` — these are what actually keep the renderer
away from Node/Electron internals. `sandbox` is left `false` because Electron's
sandboxed preload loader can only `require()` a small whitelist of built-ins, not
local project files like `../shared/ipcChannels`; since preload never executes
page-supplied code, this doesn't weaken the actual security boundary. The Gemini
API key never leaves the main process.

## Module map

| Folder            | Responsibility                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| `src/main`         | App lifecycle, window creation, native menu, IPC registration          |
| `src/preload`      | The one file allowed to bridge renderer ↔ main                        |
| `src/shared`       | IPC channel name constants (imported by main, preload)                |
| `src/gemini`       | All `@google/genai` calls: image editing, conversation sessions, prompt optimization |
| `src/prompts`      | Prompt *engineering*: the optimizer's meta-prompt, template storage    |
| `src/styles`       | The 12 built-in style presets (pure data)                              |
| `src/history`      | JSON-file-backed prompt/edit history, including favorites              |
| `src/services`     | Cross-cutting infrastructure: config/API-key storage, file dialogs/IO  |
| `ui/scripts`       | Renderer: `app.js` orchestrates, `components/*` render + wire specific UI pieces, `state/appState.js` is a tiny observable store |

## Conversation Mode

`src/gemini/imageEditor.js` keeps a `Map<sessionId, Chat>` of active
`@google/genai` chat sessions (`ai.chats.create()`). A chat's `sendMessage()`
resends the full turn history — including the model's own previously generated
image — on every call, so a follow-up instruction only needs to carry new text.
The renderer generates a `sessionId` per "conversation" (`ui/scripts/utils.js`'s
`generateId()`) and calls `startNewSession` (→ `imageEditor.endSession`) whenever
the user drops a new image or clicks "Start new conversation".

## Extension points for future features

These are real code seams, not just notes, so adding the feature later doesn't
require restructuring:

- **Batch editing / multiple images** — `imageEditor.editImage()` already accepts
  `imagePaths: string[]`, not a single path. A batch UI would loop over files and
  call the existing IPC handler per item (or a new `image:edit-batch` handler that
  does the same loop main-side); no change needed to the core editing function.
- **Prompt templates** — `src/prompts/promptTemplates.js` already persists to
  `userData/templates.json` using the exact same read/write pattern as
  `historyStore.js`. A template manager UI (create/edit/delete) would add
  `addTemplate`/`deleteTemplate` functions mirroring `historyStore`'s API.
- **Favorites** — already implemented, not just prepared: `historyStore.js`
  entries carry a `favorite` flag and `toggleFavorite()`, wired to the star icon
  in the history panel.
- **Auto-update** — `package.json` has an `electron-builder` `build` config
  (`appId`, `productName`, Windows NSIS target) so `npm run dist` produces a real
  installer. No publish/update server is configured yet — adding
  `electron-updater` and a `publish` block (e.g. pointing at GitHub Releases or a
  private S3 bucket) is the remaining step once you have somewhere to host builds.
- **Plugins** — every capability is a named IPC channel
  (`src/shared/ipcChannels.js`) backed by one independent service module. A future
  plugin loader could register additional channels/services (e.g. a new style pack,
  a new export format) without touching any existing module.

## Known limitation: voice recognition

`ui/scripts/services/speechService.js` wraps the browser `SpeechRecognition` API
(`webkitSpeechRecognition`), available for free since Electron's renderer is
Chromium. This is routed through a Google web speech service whose availability
can vary by Electron/Chromium build and network policy — an Electron platform
limitation, not something app code fully controls. The service is isolated behind
a small interface specifically so it can be swapped for a cloud STT API call
later without touching any UI component.
