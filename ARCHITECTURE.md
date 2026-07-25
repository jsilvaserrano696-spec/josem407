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
      → src/gemini, src/services (incl. src/services/imageImport), src/history, src/prompts, src/styles
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
| `src/services/imageImport` | Format detection + in-memory conversion (e.g. HEIC→PNG) — see [Image Import Pipeline](#image-import-pipeline) below |
| `ui/scripts`       | Renderer: `app.js` orchestrates, `components/*` render + wire specific UI pieces, `state/appState.js` is a tiny observable store |

## Conversation Mode

`src/gemini/imageEditor.js` keeps a `Map<sessionId, Chat>` of active
`@google/genai` chat sessions (`ai.chats.create()`). A chat's `sendMessage()`
resends the full turn history — including the model's own previously generated
image — on every call, so a follow-up instruction only needs to carry new text.
The renderer generates a `sessionId` per "conversation" (`ui/scripts/utils.js`'s
`generateId()`) and calls `startNewSession` (→ `imageEditor.endSession`) whenever
the user drops a new image or clicks "Start new conversation".

## Image Import Pipeline

Every image the app reads from disk — for the Original panel preview, and for the file(s) sent
to Gemini for editing — goes through a single entry point,
`src/services/imageImport/imageImportService.js`'s `importImage(filePath)`, rather than each
caller reading the file itself. This exists because Chromium's `<img>` element (and the Gemini
API) can't render every format a user might drop in — most notably HEIC/HEIF, the default
photo format on iPhone — so format support has to be resolved once, in one place, before the
bytes reach either consumer.

```
image:load IPC handler  ─┐
                          ├─→ imageImportService.importImage(filePath)
Gemini imageEditor.js    ─┘        │
                                    ├─ formatRegistry.getFormatInfo(ext)
                                    │     → { mimeType, nativelyRenderable }
                                    │
                                    ├─ nativelyRenderable? → return raw bytes as base64, untouched
                                    │
                                    └─ not renderable? → converterRegistry.findConverter(ext)
                                          → converter.convertToDisplayable(buffer)
                                          → return converted bytes as base64
```

`importImage()` always returns the same shape —
`{ base64, mimeType, sourceFormat, wasConverted }` — whether or not the source needed
conversion. Callers (the IPC handler, the Gemini editor, the renderer) never branch on the
original format; `sourceFormat`/`wasConverted` are carried through only so the UI can show an
informational "converted from HEIC" status message, not because any code path depends on them.

### Format Registry

`src/services/imageImport/formatRegistry.js` is the single source of truth for which
extensions the app accepts. Each entry is `{ mimeType, nativelyRenderable }`.
`fileService.js`'s "Open Image" dialog filter is generated from this same registry
(`listSupportedExtensions()`), so a format added here is immediately selectable from the file
picker too — there's no second list to keep in sync.

### Converter Registry

`src/services/imageImport/converterRegistry.js` holds an ordered list of converters for
formats where `nativelyRenderable: false`. Each converter is a plain object:
`{ id, canHandle(ext), convertToDisplayable(buffer) }`. Today there's one —
`converters/heicConverter.js`, which decodes HEIC/HEIF via `heic-convert` (a WASM build of
libheif, `libheif-js`, chosen specifically because it needs no native compilation or
per-platform prebuilt binary — unlike e.g. `sharp`, whose default binaries can't read HEIC at
all) and re-encodes to PNG in memory. PNG, not JPEG, so the conversion doesn't stack a second
lossy generation on top of HEIC's own compression.

Conversion failures (corrupt file, unsupported HEIC variant) are wrapped in
`ImageConversionError` (`errors.js`) with a message meant to be shown as-is in the UI; unknown
extensions throw `UnsupportedImageFormatError`. Both are plain `Error` subclasses, so they
cross the IPC boundary as ordinary rejection messages — `dropzone.js`'s existing `onError`
path surfaces them with no special-casing.

### Extension point: adding a new image format

- **Already renderable in Chromium** (e.g. AVIF): add one entry to `formatRegistry.js` with
  `nativelyRenderable: true`. Nothing else changes.
- **Needs conversion** (e.g. TIFF, RAW/DNG): add one entry to `formatRegistry.js` with
  `nativelyRenderable: false`, plus one new file in `converters/` implementing
  `{ canHandle(ext), convertToDisplayable(buffer) }`, registered in `converterRegistry.js`.
  `imageImportService.js`, the IPC handler, the Gemini editor, and every UI component stay
  untouched.

## Extension points for future features

These are real code seams, not just notes, so adding the feature later doesn't
require restructuring:

- **New image formats** — already a plugin point, not just prepared: see
  [Image Import Pipeline](#image-import-pipeline) above. Formats Chromium already renders are
  a one-line `formatRegistry.js` entry; formats needing conversion are one new file under
  `src/services/imageImport/converters/`.
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
