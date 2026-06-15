# GEMINI.md - And Then Next Suggestion

## Project Overview
**And Then Next Suggestion** is a lightweight, model-agnostic VS Code extension for tab autocomplete (ghost text). It allows developers to connect to any AI provider (OpenAI, Anthropic, Ollama, or custom endpoints) without being locked into a specific ecosystem.

- **Primary Stack**: TypeScript, VS Code Extension API.
- **Key Feature**: Generic interface for LLM completions with support for custom JSON payloads.
- **Architecture**: `src/extension.ts` orchestrates UI (Status Bar), Configuration, the `InlineCompletionItemProvider`, and the Explain command. Pure logic lives in separate vscode-free modules: `src/providers/` (dialects), `src/statusMessages.ts`, `src/explain.ts`, `src/explainWebview.ts`.

## Building and Running
The project uses standard VS Code extension development workflows.

### Prerequisites
- Node.js 18+ (uses native `fetch`)
- VS Code

### Commands
- `npm install`: Install dependencies.
- `npm run compile`: Compile TypeScript to JavaScript.
- `npm run watch`: Compile in watch mode for development.
- `npm test`: Run unit tests using Vitest.
- `F5`: (In VS Code) Launch the **Extension Development Host** to test and debug.
- `npm run package`: Package the extension into a `.vsix` file.

## Development Conventions

### Testing Strategy
- **Unit Tests**: Use **Vitest** for testing "pure" logic, such as the `Dialect` implementations in `src/providers/`.
- **Test Location**: Tests are located alongside their implementation (e.g., `openai.test.ts`).
- **Mocking**: Dialects are designed to be independent of the VS Code API, allowing them to be tested without a heavy mock environment.

### Code Style & Architecture
- **Locality of Behavior**: Core orchestration in `src/extension.ts`; pure logic extracted into testable modules (`providers/`, `statusMessages`, `explain`, `explainWebview`).
- **Debouncing**: Per-document configurable delay (`andThenNextSuggestion.debounceMs`, default 200ms) with cancellable promises.
- **Context Handling**: Completions use 2000 chars of prefix and 1000 chars of suffix context.
- **Response Cache**: Bounded LRU (50 entries, 5-min TTL) keyed by profile + prefix + suffix. Cache hits skip the status bar entirely.
- **Rate-Limit Floor**: Optional hard minimum between requests (`rateLimitMs`), shared across inline completion and Explain.
- **API Key Cache**: In-memory cache avoids OS keychain round-trip per request; cleared on config change or `secrets.onDidChange`.

### Security & Secrets
- **API Keys**: Prioritize `vscode.ExtensionContext.secrets` over plain-text configuration.
- **Environment Variables**: Fallback to `<PROVIDER>_API_KEY` environment variables if no key is stored in VS Code.
- **Key Cache**: `resolveApiKey()` caches the resolved key in-memory (empty-string sentinel for keyless providers like Ollama). Invalidated on `setApiKey`, `onDidChangeConfiguration`, and `secrets.onDidChange`.
- **Logging**: Never log sensitive data (like API keys) to the Output Channel. Non-error logs write only to the Output Channel (no `console.log` IPC on the hot path).

### Logging
- Use the internal `log()` function which writes to the "And Then Next Suggestion" Output Channel.
- Toggle visibility via the `andThenNextSuggestion.showLogs` command.

### UI / Status Bar
- The status bar indicates state:
    - `$(zap)`: Ready / Idle.
    - `$(sync~spin)`: Request in flight (skipped on cache hits).
    - `$(error)`: Last request failed (with HTTP-status-specific tooltip).
- Status bar tooltip provides details on the active profile and errors.
- Click the status bar to switch profiles via QuickPick.

## Testing Strategy
- **Unit Tests**: **Vitest**. 84 tests across 8 files covering dialects, `sanitize()`, status messages, explain request/response, and the Prism webview HTML builder (incl. XSS + CSP + packaging-integrity tests).
- **Test Location**: Tests alongside implementation (e.g. `src/providers/openai.test.ts`, `src/providers/base.test.ts`).
- **Pure Modules**: Dialects, `sanitize`, `statusMessages`, `explain`, and `buildExplainHtml` have zero `vscode` imports, testable without mocks.
- **Run**: `npm test`.

## Project Structure
- `src/extension.ts`: Main orchestration (activation, commands, inline provider, explain command, fetch, cache, rate-limit).
- `src/providers/`: Dialect strategy pattern (`base.ts`, `openai.ts`, `anthropic.ts`, `ollama.ts`, `custom.ts`, `registry.ts`, `types.ts`).
- `src/statusMessages.ts`: HTTP status code to user-facing message mapping.
- `src/explain.ts`: Pure explain request/response builders (chat-style, exhaustive switch).
- `src/explainWebview.ts`: Pure Prism webview HTML builder (nonce CSP, local resources).
- `src/profileManager.ts`: Profile management webview UI.
- `media/prism/`: Locally bundled Prism syntax highlighter (30 files, ~150KB, ships in `.vsix`).
- `package.json`: Extension manifest, configuration schema, commands, keybindings.
- `docs/`: Architecture, development, providers guides.
- `out/`: Compiled output (ignored in git).
