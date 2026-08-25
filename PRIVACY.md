# AXION privacy model

AXION is a local desktop application. It does not include telemetry, analytics,
advertising identifiers or an AXION-operated account service.

## Data kept locally

- The Gemini API key is stored in Electron's per-user data directory and is
  encrypted with the operating-system credential protection when available.
- App settings, recent style IDs and named work profiles are stored locally.
- Personal prompt templates and lightweight prompt history are stored locally.
- Active-project recovery and `.axion` project files contain the project's
  images, prompts, version history, reference image and result explanations.
- Developer diagnostics are disabled by default and remain local when enabled.

## Data sent to Google Gemini

AXION sends data to Gemini only when the user requests an AI operation:

- The instruction and applicable source/reference images for generation or editing.
- The current image when visual prompt optimization is requested.
- Recorded audio when voice transcription is requested.

The user's own Google API key authorizes these requests. Google's applicable API
terms and data policies govern processing on that service.

## Preference handling

AXION does not inspect prompts or images to infer a user profile. Its current
"memory" is deliberately limited to explicit, local signals:

- The four most recently used style IDs, for visual ordering.
- Named work profiles created by the user, containing only a default style and
  Conversation Mode preference.

Any future semantic preference learning must be opt-in, explain what is stored,
support deletion, and remain separable from projects and API credentials.

## Deletion

Personal templates and work profiles can be deleted in the interface. Prompt
history can be cleared from the sidebar. Project files are ordinary user-owned
files and can be removed through the operating system. Uninstalling AXION may
not delete user-created `.axion` files stored outside the application folders.
