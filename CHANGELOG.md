# Changelog

All notable changes to the "and-then-next-suggestion" extension will be documented in this file.

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

### Fixed
- **Thinking Parameter Conflict**: Omits `reasoning_effort` when `thinking` is disabled to avoid API rejection from conflicting parameters.
- **DeepSeek Reasoning Suppression**: Uses `thinking: { type: 'disabled' }` for reasoning-capable models, aligned with official API behavior.
<!-- RELEASE:END 1.0.0 -->
