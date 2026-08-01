# AXION

A professional desktop AI image editor for Windows, built with Electron and
powered by Google's **Gemini 3.1 Flash Image** ("Nano Banana 2") model.

Drag in an image, describe an edit in plain English (or by voice), and get a
result back — with an AI prompt optimizer, a 12-style built-in style library,
multi-turn "Conversation Mode" editing, and prompt history, all in a dark,
minimal interface.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the module map, process-boundary
design, and the extension points prepared for future features (batch editing,
templates, auto-update, plugins).

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

## Build a Windows installer

```
npm run dist
```

Requires an `assets/icons/icon.ico` file (see `assets/icons/README.md`). Output
lands in `dist/`.

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
- **High-resolution output** — requests 4K output from Nano Banana 2; exact
  pixel dimensions depend on the generated aspect ratio
- **PNG and JPEG export** — PNG is the lossless default; JPEG creates a
  compressed, full-resolution copy suitable for email and sharing
- **Prompt History** — every edit is saved, reusable and editable, with
  favorites
- **Templates** — a handful of built-in starting-point prompts in the sidebar
- **Settings** — change your API key or toggle automatic prompt optimization at
  any time

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
└── assets/icons/         Windows app icon (add icon.ico before packaging)
```
