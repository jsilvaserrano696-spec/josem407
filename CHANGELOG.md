# Changelog

## 1.1.33

### Added

- Matrix + Reference editing with deterministic image roles.
- Protected-area editing with wand, brush, eraser, pan, zoom and local compositing.
- Complete `.axion` project save/reopen flow and automatic active-project recovery.
- Personal prompt-template manager with atomic persistence.
- Concise AI result explanations stored with each generated version.
- HEIC/HEIF import conversion, clipboard image flows and recent-image gallery.
- Project name/reference metadata and export-name integration.
- English/Spanish runtime interface switching and contextual help.
- Private local memory that prioritizes the four most recently used styles.
- Configurable default style and Conversation Mode for new projects.
- Up to 20 named work profiles for reusable new-project defaults.
- Visible Economy, Balanced and Pro quality tiers, with Economy selected by
  default and model choice stored with each generated version.
- Native Edit > Generation quality menu synchronized with the workspace and
  Settings selectors.

### Changed

- Updated Electron, Gemini SDK and ESLint dependencies.
- Reduced protected-selection undo memory for dense 4K selections.
- Strengthened renderer isolation, navigation restrictions, permissions and CSP.
- Closed the persisted settings schema to supported fields and valid style IDs.
- Excluded tests from production packages and included third-party notices.

### Verified

- 267 automated tests and ESLint pass.
- Windows x64 NSIS package starts successfully with an isolated profile.
- Silent NSIS install, launch and uninstall complete with exit code 0 and no
  residual temporary installation or profile directories.
- Production ASAR contains no test files.

### Known limitation

- Windows binaries are not Authenticode-signed until an official code-signing
  certificate is configured; SmartScreen may warn on installation.
