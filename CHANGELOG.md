# Changelog

All notable changes to the "and-then-next-suggestion" extension will be documented in this file.

<!-- RELEASE:START unreleased -->
## [Unreleased]

### Added
- **Explain Command**: Select code and run "Explain Selected Code" (`Ctrl+Alt+E` / `Cmd+Alt+E`) to get a syntax-highlighted explanation in a webview panel. Uses a separate chat-style request pathway (`src/explain.ts`) with a compile-time exhaustive switch ensuring every `apiType` is handled.
- **Prism Syntax Highlighting**: Explain webview renders code with locally-bundled Prism (30 component files, ~150KB, ships in `.vsix`). No CDN, no remote fetches. Nonce-gated CSP (`default-src 'none'`). Includes a packaging-integrity test that asserts every mapped component file ships.
- **Response Cache**: Bounded LRU cache (50 entries, 5-min TTL) keyed by profile + prefix + suffix. Identical context returns instantly without an API call. Cache hits skip the status bar entirely (no flicker).
- **Per-HTTP-Status Error Messages**: `src/statusMessages.ts` maps 400/401/402/403/404/408/422/429/5xx to actionable user-facing messages, surfaced in the status bar tooltip.
- **Rate-Limit Floor** (`andThenNextSuggestion.rateLimitMs`, default `0` = disabled): Optional hard minimum between any two API requests, shared across inline completion and Explain. Uses synchronous slot reservation to prevent the concurrent-caller race.
- **Configurable Debounce** (`andThenNextSuggestion.debounceMs`, default `200`): Was hardcoded 300ms. Now tunable per-user with documented lower/higher tradeoffs.
- **API Key Cache**: In-memory cache avoids OS keychain round-trip (20-150ms) per request. Keyless providers (Ollama) cache an empty-string sentinel. Invalidated on `setApiKey`, `onDidChangeConfiguration`, and `secrets.onDidChange`.

### Changed
- **Debounce Default**: Reduced from 300ms to 200ms (configurable). Safe at 200 due to cache + abort + optional rate-floor safeguards.
- **Sanitize Overlap Cap**: `sanitize()` prefix/suffix overlap scan capped at 300 chars (was O(n²) over the full 2000-char window). Models never verbatim-repeat more than ~300 chars.
- **Logging**: Non-error `console.log` removed from the hot path (was crossing IPC to renderer on every fetch). Output Channel is the canonical sink; `console.error` retained for errors.
- **Context Extraction**: `document.offsetAt()` deduped to a single call per request.

### Fixed
- **Explain Webview Security**: Replaced CDN-loaded Prism autoloader + `unsafe-inline` CSP with locally-bundled Prism + nonce-based CSP. Added `localResourceRoots` restriction to `media/prism`.
- **Cache LRU Correctness**: `cacheSet()` now uses delete-then-set so refreshed keys move to insertion-order tail (was FIFO, not LRU as documented).
- **Rate-Limit Race**: `applyRateFloor()` reserves the projected fire time synchronously before yielding, closing the concurrent-caller race.
- **Panel Lifecycle**: Explain webview tracks `disposed` flag + aborts via `onDidDispose`. `retainContextWhenHidden` set to `false`.

### Tests
- **84 tests across 8 files** (up from 33/4). New: `src/statusMessages.test.ts`, `src/explain.test.ts`, `src/explainWebview.test.ts`, `src/providers/base.test.ts`.
<!-- RELEASE:END unreleased -->

<!-- RELEASE:START 1.0.0 -->
## [1.0.0] - 2026-05-13

### Added
- **Model-Agnostic Inline Completion**: Tab autocomplete (ghost text) provider that works with any LLM endpoint. Supports OpenAI, Anthropic, Ollama, and custom API types through a pluggable Dialect architecture.
- **Profile-Based Configuration**: Multiple provider profiles (`andThenNextSuggestion.profiles`) with independent endpoint, model, temperature, max tokens, and API key settings. Switch between profiles from the status bar.
- **File Extension Context**: File extension (e.g. `.ts`, `.php`) is passed to LLM providers in system prompts for better language-aware completions. Omitted gracefully for extensionless files (e.g. `Makefile`, `Dockerfile`).
- **Dialect Strategy Pattern**: Each API type (OpenAI, Anthropic, Ollama, Custom) is encapsulated as a `Dialect` with its own request preparation and response parsing logic, independently testable without VS Code API mocking.
- **Custom JSON Body Templates**: `customBody` field with `{{before}}`, `{{after}}`, `{{model}}`, `{{maxTokens}}`, `{{temperature}}`, `{{languageId}}`, and `{{fileExtension}}` placeholder substitution for arbitrary API schemas.
- **SecretStorage for API Keys**: API keys stored via `vscode.ExtensionContext.secrets` (set via command palette). Plain-text `apiKey` in profile config is supported but discouraged.
- **Environment Variable Fallback**: Falls back to `<PROVIDER>_API_KEY` environment variables (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) when no key is stored in VS Code.
- **Thinking/Reasoning Control**: `disableThinking` flag to suppress reasoning tokens on models that support it (o1, o3, DeepSeek R1). Auto-detects reasoning-capable models by name.
- **Fill-in-the-Middle (FIM) for Local Models**: Ollama dialect auto-detects FIM-compatible models (CodeLlama, DeepSeek, Qwen, StarCoder, Llama) and uses native FIM prompt format with suffix support instead of chat-style completion.
- **Request Debouncing**: 300ms debounce per document with cancellation of stale requests. Only the most recent cursor position triggers a completion.
- **Abort and Timeout Control**: Per-document `AbortController` cancels in-flight requests when new ones arrive. Configurable `requestTimeout` (default 10s) kills stalled requests.
- **Overlapping Text Handling**: Response sanitization strips duplicated prefix/suffix overlap between the model output and surrounding code context.
- **Thinking Block Stripping**: Removes `<thinking>...</thinking>` and `<think...</think...>` blocks from model responses before returning completions.
- **Conversational Prefix Rejection**: Rejects responses that start with conversational prefixes ("here", "sure", "i can", etc.) to avoid non-code completions.
- **Status Bar UI**: Status bar item shows active profile name with state indicators: `$(zap)` idle, `$(sync~spin)` requesting, `$(error)` failed. Click to switch profiles.
- **Commands**: `trigger` (alt+\\), `openSettings`, `setApiKey`, `showLogs`, `switchProvider`.
- **Dedicated Output Channel**: "And Then Next Suggestion" output channel with timestamped logs for debugging completion requests and responses.
- **Document Lifecycle Cleanup**: Per-document state (debounce timers, abort controllers) is cleaned up when documents close.
- **MIT License**: Open-source under MIT license.
- **Vitest Unit Tests**: 33 tests across 4 test files covering all dialect request preparation, response parsing, prefix/suffix overlap stripping, thinking block removal, FIM format detection, custom template substitution, file extension handling, and edge cases.
- **Copilot Autocomplete Conflict Resolution**: Added `andThenNextSuggestion.disableCopilotAutocomplete` setting (enabled by default) to dynamically disable GitHub Copilot ghost text completions, auto completions, and next edit suggestions while maintaining Copilot Chat. Resilient and error-free when GitHub Copilot is not installed.
- **Ultra-Compact Status Bar**: Displays compact state-only icons (`$(zap)`, `$(sync~spin)`, `$(error)`) to save screen space, while keeping detailed model profile information and error details in the hover tooltip.
- **Interactive Active Profile Selector**: Replaced the `activeProfile` plain-text setting description with a Markdown link that instantly triggers the interactive profile selector QuickPick dropdown.
- **Secure Key Management Guide**: Added a styled, secure credentials warning panel in the profile manager webview screen detailing fallback environment variables and VS Code enclave key storage commands.

### Fixed
- **Thinking Parameter Conflict**: Omits `reasoning_effort` when `thinking` is disabled to avoid API rejection from conflicting parameters.
- **DeepSeek Reasoning Suppression**: Uses `thinking: { type: 'disabled' }` for reasoning-capable models, aligned with official API behavior.
- **Cross-Platform Building**: Removed the hardcoded Linux-only Rolldown binary dependency from devDependencies, resolving `EBADPLATFORM` installation errors on macOS (Darwin) and other environments.
<!-- RELEASE:END 1.0.0 -->
