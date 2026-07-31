# Architecture

## Process boundaries

AXION follows standard Electron security practice: the **renderer**
(`ui/`) never touches the filesystem, environment variables, or the Gemini API
directly. It only calls the narrow, typed API exposed by `src/preload/preload.js`
via `contextBridge` (`window.axion.*`). Those calls become IPC messages
handled in `src/main/ipcHandlers.js`, which delegate to plain Node modules under
`src/`. Those modules have no Electron/IPC awareness at all — they're regular
functions that could be unit tested or reused outside Electron entirely.

```
ui/ (renderer, sandboxed, no Node access)
  → window.axion.*  (src/preload/preload.js, contextBridge)
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

## AXION CORE (Intent-based pipeline, wired into the real edit/generate flow)

`src/core/` is AXION's internal pipeline — ANALYZE → DIRECTOR → PROMPT ENGINE → EXECUTE →
INSPECTOR — and it now runs on every real edit and generation: `src/main/ipcHandlers.js`'s
`IMAGE_EDIT` and `IMAGE_GENERATE` handlers call `axionCore.runEditPipeline()` /
`runGeneratePipeline()` instead of calling `src/gemini/imageEditor.js` directly.

| Module                  | Responsibility (current)                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/core/analyze.js`    | Deterministic local interpretation — still no Gemini call. Classifies `analysis.action` from a closed set of edit/generate actions via regex-based rules (`analyzeHeuristics.js`/`analyzeVocabulary.js`), extracts `targets`/`protect`/`constraints` from the user's own text, and scores `analysis.confidence` (always numeric when it completes; lower when ambiguous or contradictory). Coarse by design — bounded-window phrase capture, not semantic understanding; see the module's own comments for exact rules/limits. |
| `src/core/director.js`   | Deterministic local decision — still no Gemini call. Computes `direction.priorities`/`direction.notes` from `analysis.*`/`protect`/`constraints` using a closed vocabulary (`directorVocabulary.js`/`directorHeuristics.js`): conservative reordering under low confidence or a detected contradiction, `explicit_user_protection` always first when the user protected anything explicitly. Only ever writes `direction`; an invalid Intent is returned unchanged, with no repair attempt. |
| `src/core/inspector.js`  | Stub. Always returns `{ passed: true, score: null, notes: [] }`; logs via `editDebugLogger` only when Developer Mode (`configStore`) is on, never throws. Now receives the full Intent (not separate analysis/direction objects), but doesn't act on it differently. |
| `src/core/axionCore.js`  | Orchestrator. Builds/carries the Intent through ANALYZE → DIRECTOR, calls EXECUTE unchanged, then INSPECTOR. See subsections below for the Intent journey, fallbacks and diagnostic validation. |

### Intent journey

```
ipcHandlers.js (IMAGE_EDIT / IMAGE_GENERATE)
  → axionCore.runEditPipeline() / runGeneratePipeline()
      → ANALYZE   (analyze.js#analyzeRequest)   builds the Intent
      → [diagnostic validation]
      → DIRECTOR  (director.js#decideDirection) normalizes it, fills direction.*
      → [diagnostic validation]
      → EXECUTE   (imageEditor.js, unchanged)   — Intent does NOT reach this stage
      → INSPECTOR (inspector.js#inspectResult)  reads the Intent + resultMeta, decides nothing
```

### Fallbacks (ANALYZE / DIRECTOR)

`safeStage()` wraps ANALYZE and DIRECTOR (never EXECUTE) in try/catch:
- **ANALYZE throws** → falls back to `fallbackIntent()`, a minimal but schema-valid Intent built
  with the same `buildIntent()` normalizer (`operation`/`hasImage`/`request.text`/`request.styleId`,
  `metadata.source: "axionCore@fallback"`).
- **DIRECTOR throws** → falls back to the pre-DIRECTOR Intent unchanged.
- `decideDirection()` also has its own internal gate, independent of `safeStage()`: if the Intent
  it receives fails `validateIntent()`, it returns that Intent completely unchanged (same
  reference) rather than attempting any repair — one more layer beneath the outer try/catch.

### Diagnostic Intent validation

After ANALYZE and after DIRECTOR, `validateIntentForDiagnostics()` calls `validateIntent()`
(`intentSchema.js`). Diagnostics only: never blocks, never throws, never modifies the Intent.
Logs nothing when valid; when invalid, logs stage/error count/sanitized errors — never the Intent,
prompt or image data. Errors pass through `sanitizeValidationError()` first, which drops the
actual offending value (everything from `", got "` onward). If `validateIntent()` itself throws,
that's caught and logged as a generic notice. Unlike INSPECTOR's stub logging, this is **not**
gated on Developer Mode — `editDebugLogger` (temporary/always-on, see
`src/debug/editDebugLogger.js`) logs unconditionally.

### EXECUTE stays decoupled from the Intent

`imageEditor.js` is called with exactly the same arguments `ipcHandlers.js` used to pass it
directly — `prompt`/`currentImage`/`originalImage` or `prompt` — nothing else. Neither the Intent
nor the DIRECTOR-normalized Intent ever reaches these calls.

### What did not change

`src/prompts`/`promptOptimizer.js` (PROMPT ENGINE, still a separate user-triggered IPC call),
`src/gemini/imageEditor.js` (EXECUTE), every renderer module under `ui/`, and
`src/history/historyStore.js` (`historyStore.addEntry()` still called right after the pipeline
call, same `{ prompt: displayPrompt, styleId }` shape) are all unchanged.

`src/core/intentSchema.js` defines the **AXION Intent Schema v1** and is now consumed by
`analyze.js`, `director.js` and `axionCore.js` (not yet by `promptOptimizer.js` or
`imageEditor.js`). See [AXION_INTENT_SCHEMA.md](./AXION_INTENT_SCHEMA.md) for the full field
reference and examples.

## Version history & Undo/Redo

`src/gemini/imageEditor.js` has no memory between calls and keeps no server-side
Gemini chat session — every edit (and every from-scratch creation) is a single,
stateless `generateContent()` call. Continuity across edits ("Conversation
Mode") and Undo/Redo are both handled entirely on the renderer side, in
`ui/scripts/state/appState.js`'s `versionHistory` array + `versionCursor`
index: index 0 is the project's starting point — either an imported file
(`prompt: null`) or a from-scratch creation (`prompt` holds the creation
prompt, see "New vs. Edit" below) — and each successful edit appends a new
version (image + the user's own prompt, in their own language — never the
internal Gemini-optimized one, see DESIGN_PHILOSOPHY.md) and moves the cursor
to it.

- **Undo/Redo** just move `versionCursor` and repaint whichever version it now
  points at — no IPC call, no Gemini request, no tokens spent.
- **Conversation Mode** (the checkbox) decides which image is sent as the source
  for the *next* edit: `versionHistory[versionCursor]` (build on what's currently
  shown) when on, or always `versionHistory[0]` (the original) when off. Either
  way, that image is sent explicitly as inline data on every call — this is what
  makes edits work correctly even after undoing to a past version, which a
  stateful Gemini chat session couldn't support (there's no API to rewind a chat
  to an earlier turn).
- **Editing from a past version** (cursor not at the end) truncates everything
  after the cursor before appending the new version — replace, not branch. Every
  version is still visible in the persisted History sidebar
  (`src/history/historyStore.js`) regardless, since that's a separate,
  chronological, prompt-only log independent of the undo/redo cursor.
- `versionHistory` is **not** persisted to disk or across app restarts — same as
  Undo history in any other image editor, it resets when a new image is dropped
  or "Start new conversation" is clicked.

### New vs. Edit — one shared flow, not two

"File > New..." (`startNewProject()` in `app.js`) doesn't open a dialog — it just
empties `versionHistory` (`[]`, cursor `-1`) and clears both image panels. From
there, the *same* primary action button and the *same* prompt box handle both
cases: `handleEditClick()` checks `versionHistory.length === 0` once, and either
calls `imageEditor.generateImage({ prompt })` (no source image — a plain
text-to-image `generateContent()` call, sharing `extractImageFromResponse` with
`editImage()`) or `imageEditor.editImage({ prompt, currentImage, originalImage })`
as before. Both branches converge on the same `pushVersion()` helper, so **Undo, Redo,
Save, and the History sidebar require zero special-casing** for a created
project versus an imported one — the only place that distinguishes them is
version 0's `prompt` field (`null` for an import, the creation prompt for a
generation), which is what the "Save" button's enabled state at version 0
checks, since a generated image (unlike an imported file) has never touched
disk anywhere yet.

## Fidelity anchor — preventing identity drift across a long edit chain

Generative image models regenerate the *entire* frame on every call — they don't
selectively touch only the requested region the way a clone-stamp tool would.
Left unchecked, this means small deviations from one edit become part of the
input to the next, and compound: by the Nth edit in a chain, elements the user
never asked to change (composition, props, logos, text, background) can have
drifted noticeably from the original. This is a structural property of
iterative image-to-image generation, not a bug in a specific prompt.

Two things work together against it, and neither is a full guarantee on its
own:

1. **`optimizerPromptBuilder.js`'s meta-prompt** reframes the optimizer from "a
   creative expander" to an art director: identify the one element the user
   asked to change, and explicitly instruct the image model to leave everything
   else — composition, framing, every character's identity/pose/expression,
   every object/prop/logo/text, the background, the palette — untouched unless
   the request genuinely requires it. It also weaves in the list of
   already-applied prior prompts (`priorEdits`, sourced straight from
   `versionHistory`) so the model knows what's already deliberately in effect
   and shouldn't be undone.
2. **`imageEditor.js`'s `editImage()`** sends a second reference image —
   `originalImage`, always `versionHistory[0]`, whenever the current version
   isn't already version 0 — labeled explicitly in the request as the fidelity
   ground truth. This is the structural fix for *compounding* drift: the true,
   never-degraded original stays in the model's context on every single edit
   for the life of the project, not just the first one. (Sending two images in
   one request reuses the same multi-image capability
   [`MATRIX_REFERENCE_MODE_DESIGN.md`](./MATRIX_REFERENCE_MODE_DESIGN.md)
   designs for composing several role-tagged sources — here applied to one
   role: "identity reference" rather than "compositional source".)

**What this doesn't guarantee:** pixel-exact preservation of a specific region
(e.g. "the logo must be byte-identical, always") isn't something prompting can
promise — the model is probabilistic, not a masking tool. A true guarantee for
that would need a segmentation mask plus a post-generation compositing step
(paste the original's untouched pixels back in outside the mask) — a real,
buildable feature, but a materially larger one than the two layers above, and
not implemented yet.

### Diagnose before improving — avoiding over-conservative edits

An early version of layer 1 told the model, generically, to "preserve
everything except what's requested." In practice this backfired for vague or
evaluative requests (e.g. "improve this image"): with no concrete target, the
model played it safe and changed almost nothing — trading visible identity
drift for barely-perceptible edits, not an actual balance.

`promptOptimizer.js`'s `optimizePrompt()` now passes the current image
(`currentImage`) to the *same* optimizer call whenever one exists (i.e.
editing, never when creating from scratch — see "New vs. Edit" above), and
`optimizerPromptBuilder.js`'s meta-prompt asks the model to reason in two
phases in that one request: first silently diagnose the image against eight
axes (materials, lighting, atmosphere, depth, micro-detail, contrast,
integration of elements, render quality) — naming concrete strengths (to
preserve *by name*, not generically) and concrete weaknesses (real,
specific improvement candidates) — then write the final instruction using
only that diagnosis. The response is split on a fixed `### DIAGNOSIS` /
`### INSTRUCTION` marker; only the instruction half is ever sent onward or
shown anywhere — the diagnosis is logged for developer mode only
(`editDebugLogger`), never surfaced in the UI (see DESIGN_PHILOSOPHY.md).
One multimodal call, not two: cheaper and simpler than a separate
diagnosis-then-optimize round trip, at the cost of combining both
responsibilities in a single prompt.

**Lesson learned, twice:** stacking restrictive instructions without an
equally explicit instruction for how strongly to apply the requested change
reliably collapses to near-null edits — the safest output relative to a pile
of "don't touch this" rules is barely touching anything. Every preservation
rule in the meta-prompt is now paired with an equally explicit commit-to-the-
change rule, and `editImage()`'s reference-image label was reworded away from
an absolute "must match this image exactly" (which competed directly against
the instruction) to a scoped continuity note.

**Element-vs-element comparison, not abstract judgment:** for broad/evaluative
requests ("improve this", "make it more epic") specifically, the diagnosis
doesn't just judge quality in the abstract — it compares the image's own
distinct elements (e.g. a sword vs. a castle in the same scene) against each
other, and the instruction it composes elevates the weaker element to match
the strongest one already achieved *in that same image*. This came from a
direct observation during testing: "give the castle the same level of realism
as the sword" produced a far better result than "make it more epic" — a
comparison grounded in something the model can actually see outperforms an
invented aesthetic standard. Specific, narrow requests skip this entirely and
are just applied directly, as before.

The renderer shows **"Analizando la imagen…"** during this call when editing
(`status.analyzing`), and **"Interpretando tu petición…"** when creating
(`status.interpreting`, unchanged) — same wait as before, now labeled for
what it actually does.

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
- **Batch editing / multiple images** — `imageEditor.editImage()` takes a single
  `sourceImage`; a batch UI would loop over files/versions and call the existing
  IPC handler once per item (or a new `image:edit-batch` handler doing the same
  loop main-side) — no change needed to the core editing function itself.
- **Multi-role image composition (Matrix + Reference mode)** — a full design proposal (not yet
  implemented) for editing with several role-tagged images at once (a "Matrix" identity anchor
  plus "Reference"/future role images contributing style, lighting, etc.) lives in
  [`MATRIX_REFERENCE_MODE_DESIGN.md`](./MATRIX_REFERENCE_MODE_DESIGN.md). It would extend
  `imageEditor.editImage()`'s single-image `messageParts` array to several inline-data
  parts, and the `#original-gallery`/`.image-gallery` UI seam described above.
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

## Voice commands (Gemini-based transcription)

`ui/scripts/services/speechService.js` no longer uses the browser's native
`webkitSpeechRecognition`. That API routes audio through a Google backend that
requires a proprietary API key baked only into official Google Chrome builds —
Electron ships open-source Chromium, which lacks that key, so every request
fails with a `"network"` error regardless of permissions, CSP, or `webPreferences`
(a platform limitation documented in long-running upstream issues, not a bug in
this app).

Instead, `speechService.js` captures raw mic audio via the Web Audio API
(`getUserMedia` + a `ScriptProcessorNode`), hand-encodes it into a WAV container
(`encodeWav()`, no dependency — the format is simple enough to write by hand),
and sends it over IPC (`channels.VOICE_TRANSCRIBE`) to
`src/gemini/voiceTranscriber.js`, which transcribes it with the same Gemini API
key already configured in Settings (`gemini-flash-latest`, the same fast
text-capable alias `promptOptimizer.js` uses — Flash models are natively
multimodal, so no separate model is needed). WAV was chosen over the
`audio/webm` `MediaRecorder` produces because `webm` isn't one of the MIME types
Gemini accepts for inline audio; recording at 16kHz mono also matches the rate
Gemini downsamples audio to internally.

```
mic (getUserMedia) → ScriptProcessorNode (PCM Float32)
  → encodeWav() → base64
  → window.axion.transcribeAudio()          (preload.js)
    → ipcMain.handle(VOICE_TRANSCRIBE)       (ipcHandlers.js)
      → voiceTranscriber.transcribeAudio()   (Gemini generateContent, audio inline part)
```

`speechService.js`'s public interface (`isSupported()`,
`start({ onResult, onError, onTranscribing, onEnd })`, `stop()`) is unchanged
from before, so `voiceButton.js` and `app.js` don't need to know which STT
backend is behind it. Swapping to a different engine later (a local model, a
different cloud STT API) only means rewriting `voiceTranscriber.js` (and, if the
new engine needs a different audio format, `encodeWav()`) — the IPC channel,
preload bridge, and every renderer component stay untouched.
