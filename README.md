# AXION

A professional desktop AI image editor for Windows, built with Electron and
powered by Google's Gemini image models, with an explicit economy-to-Pro
quality selector.

Drag in an image, describe an edit in plain English (or by voice), and get a
result back — with an AI prompt optimizer, a 12-style built-in style library,
multi-turn "Conversation Mode" editing, and prompt history, all in a dark,
minimal interface.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the module map, process-boundary
design, and the extension points prepared for future features (batch editing,
auto-update and plugins).

See [PRIVACY.md](./PRIVACY.md) for the local-storage and Gemini data-flow model.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
   (the account/project must have billing enabled — Gemini's image model isn't
   available on the free tier).

3. Copy `.env.example` to `.env` and add your key — this is only used to seed the
   key on first run:

   ```
   cp .env.example .env
   ```

   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

   You can also add or change the key later from **Settings** (⚙️ in the top-right,
   or `Ctrl+,`) — it's stored encrypted in your user data folder from then on.

## Run

```
npm start
```

## Test

```
npm test
```

Runs AXION's automated unit and pipeline tests with Node's built-in test runner.
Use `npm run check` to run both ESLint and the complete test suite before packaging.

## Build a Windows installer

```
npm run dist
```

The AXION icon is already included at `assets/icons/icon.ico`. Output lands in
`dist/`.

Local builds are not Authenticode-signed unless a Windows code-signing
certificate is configured for `electron-builder`. Unsigned installers may
trigger a Microsoft Defender SmartScreen warning and should not be presented as
a trusted public release.

## Features

- **Drag & drop** an image, or use **Browse files…**
- **Style Library** — 12 built-in styles (Photorealistic, Oil Painting,
  Watercolor, Anime, Cinematic, Fantasy, Medieval, Sci-Fi, Vintage, Metal, Dark,
  Comic) that enrich your prompt when selected
- **Improve Prompt** — expands a short instruction ("make it cooler") into a
  detailed, professional prompt via Gemini, before you commit to an edit
- **Voice commands** — click the mic and speak an instruction; it's transcribed
  straight into the prompt box
- **Conversation Mode** — follow-up edits ("now make it rain") build on the
  visible version instead of starting over, while AXION manages the version
  history locally
- **Matrix + Reference** — combine role-based source images while keeping
  reference style attributes separate from the matrix content
- **Protected editing** — select the only area that may change with Wand,
  brush and eraser tools, including zoom, pan and undo/redo
- **Before/After comparison** — inspect the original and edited images at full
  size or drag an interactive overlay slider to reveal the differences
- **AXION projects** — save, reopen and resume complete `.axion` project files,
  including version history, AI result explanations and the active reference image
- **Optional project details** — keep a design name and commercial reference
  under File > Project details and reuse them in export filenames without
  occupying the main workspace
- **Contextual help** — concise hover/focus hints explain Matrix, Reference,
  comparison, conversation behavior and project identity exactly where needed
- **Explicit quality and cost control** — starts with Flash Lite at 1K for
  economical drafts, with optional Flash 4K and Pro 4K levels; AXION never
  upgrades to a more expensive model silently
- **PNG and JPEG export** — PNG is the lossless default; JPEG creates a
  compressed, full-resolution copy suitable for email and sharing
- **Prompt History** — every edit is saved, reusable and editable, with
  favorites
- **Templates** — built-in starting points plus a personal library for saving,
  editing and deleting reusable instructions
- **Result explanations** — Gemini briefly describes the visible result in the
  same generation call; AXION stores the explanation with its image version
- **Settings and work profiles** — change your API key, interface language and
  starting quality, and save reusable style/conversation/quality combinations

## Project structure

```
axion/
├── src/
│   ├── main/         Electron app lifecycle, menu, IPC registration
│   ├── preload/       contextBridge — the only renderer↔main bridge
│   ├── shared/         IPC channel name constants
│   ├── gemini/         All Gemini API calls (editing, conversation, optimizer)
│   ├── prompts/        Prompt optimizer engineering + templates
│   ├── styles/         Built-in style presets
│   ├── history/        Prompt/edit history persistence
│   └── services/        Config/API-key storage, file dialogs & IO
├── ui/
│   ├── index.html
│   ├── styles/          Dark theme, layout, component CSS
│   └── scripts/         Renderer entry point + modular components
└── assets/icons/         AXION's packaged Windows app icon
```
