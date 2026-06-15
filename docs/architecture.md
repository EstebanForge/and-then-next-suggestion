# Project Overview & Architecture

And Then Next Suggestion is a lightweight, model-agnostic VS Code extension for tab autocomplete. Unlike other extensions that lock users into specific backend providers, And Then Next Suggestion provides a generic interface to connect to any LLM endpoint.

## High-Level Architecture

The extension follows a standard VS Code extension structure:

1.  **Entry Point (`src/extension.ts`)**: Handles extension activation, command registration, status bar management, the inline-completion provider, the explain command, and request lifecycle (debounce, cache, rate-limit floor, abort/timeout).
2.  **Dialect Layer (`src/providers/`)**: Each API format (OpenAI, Anthropic, Ollama, Custom) is a `Dialect` class extending `BaseDialect`, registered in `registry.ts`. `fetchSuggestion` resolves the dialect via `DialectRegistry.get(profile.apiType)` and delegates request/response handling. All dialects share `sanitize()` from `base.ts`.
3.  **Explain Module (`src/explain.ts` + `src/explainWebview.ts`)**: A separate chat-style request pathway (`buildExplainRequest` / `parseExplainResponse`) rendered in a webview with locally-bundled Prism syntax highlighting. Pure modules, fully unit-tested.
4.  **Status Messages (`src/statusMessages.ts`)**: Maps HTTP status codes (400/401/402/403/404/408/422/429/5xx) to actionable user-facing messages.
5.  **Profile Manager (`src/profileManager.ts`)**: Webview UI for creating/editing provider profiles.

## Key Components

### Inline Completion Provider
Registered via `vscode.languages.registerInlineCompletionItemProvider`.
- **Trigger**: Automatic (on type) or Manual (`Alt + \`).
- **Context Extraction**: Captures 2000 characters before and 1000 characters after the cursor via `document.offsetAt()` (O(1) on VS Code's PieceTree text buffer).
- **Debouncing**: Per-document configurable delay (`andThenNextSuggestion.debounceMs`, default 200ms) with cancellable promise pattern. Only the most recent cursor position survives the debounce window.
- **Response Cache**: Identical prefix + suffix + profile reuses the last suggestion within a 5-minute TTL (bounded LRU, max 50 entries). Cache hits return without touching the status bar (no flicker).
- **Rate-Limit Floor**: Optional hard minimum between any two API requests (`andThenNextSuggestion.rateLimitMs`, default 0 = disabled). Shared across inline completion and the Explain command.
- **Abort & Timeout**: Per-document `AbortController` cancels in-flight requests on new keystrokes. Configurable `requestTimeout` (default 10s).

### Configuration Management
Settings are defined in `package.json` and accessed via `vscode.workspace.getConfiguration('andThenNextSuggestion')`.
- **Profiles**: Multiple provider profiles with independent endpoint, model, API type, and keys. Managed via the Profile Manager webview.
- **Dynamic Updates**: The `onDidChangeConfiguration` handler invalidates both the suggestion cache and the API key cache on any config change.
- **Secrets**: API keys resolved via `resolveApiKey()` with an in-memory cache (one keychain round-trip per profile, cleared on config change or `secrets.onDidChange`).

### Request Flow (Inline Completion)
1. User types in editor.
2. `provideInlineCompletionItems` is triggered.
3. Per-document debounce (configurable, default 200ms). Superseded keystrokes are rejected.
4. Context extracted (2000 chars before, 1000 chars after cursor).
5. **Cache check**: if identical context is cached and fresh, return immediately (no status bar update, no API call).
6. API key resolved from cache (or keychain/env on first hit per profile).
7. **Rate-limit floor** applied (if configured).
8. `DialectRegistry.get(profile.apiType)` resolves the dialect, which builds the provider-specific request body.
9. `fetch` call to the configured `endpoint` with `AbortController` + timeout.
10. HTTP errors mapped to user-facing messages via `statusMessages.ts`.
11. Response parsed by the dialect, then `sanitize()` strips thinking blocks, conversational prefixes, and overlapping prefix/suffix.
12. Result cached and returned as a `vscode.InlineCompletionItem`; ghost text rendered.

### Explain Command Flow
1. User selects code and runs `Explain Selected Code` (`Ctrl+Alt+E` / `Cmd+Alt+E`).
2. A webview panel opens with a "Generating…" placeholder and locally-bundled Prism assets (nonce-gated CSP, no CDN).
3. `buildExplainRequest()` constructs a chat-style request for the active profile's `apiType` (exhaustive switch with compile-time `never` guard).
4. Same rate-limit floor, timeout, and status-error handling as inline completion.
5. `parseExplainResponse()` extracts the explanation; the webview re-renders with Prism-highlighted code.
