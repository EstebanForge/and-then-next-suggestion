# Development & Contribution

## Getting Started

1. Clone the repository.
2. Run `npm install`.
3. Open the project in VS Code.
4. Press `F5` to launch a new VS Code window with the extension loaded.

## Toolchain

- **TypeScript** (`tsc`): Main language and compiler.
- **VS Code Extension API**: Core library.
- **Vitest**: Unit test runner (`npm test`).
- **@vscode/vsce**: Extension packaging (`npm run package`).

## Testing

Unit tests use **Vitest** and cover all pure logic: dialect request/response handling, the shared `sanitize()` sanitizer (prefix/suffix overlap, thinking-block stripping, conversational-prefix rejection), status-code-to-message mapping, the explain request/response builders, and the Prism webview HTML builder (incl. XSS escaping, nonce CSP, and a packaging-integrity test that asserts every mapped Prism component file ships in `media/prism/`).

- **Run tests**: `npm test` (currently 84 tests across 8 files).
- **Test location**: tests live alongside their implementation (e.g. `src/providers/openai.test.ts`, `src/providers/base.test.ts`, `src/statusMessages.test.ts`, `src/explain.test.ts`, `src/explainWebview.test.ts`).
- **No VS Code mocking needed**: dialects, `sanitize`, `statusMessages`, `explain`, and `buildExplainHtml` are all pure modules with zero `vscode` imports, so they test without an editor environment. The vscode-specific plumbing (webview URI resolution, secret storage, status bar) stays in `extension.ts` and is exercised manually via the Extension Development Host (`F5`).

## Security Considerations

### API Keys
NEVER log the API Key to the console or output channels. Use `context.secrets` for storage. 
When reading from settings, treat the value as a low-security fallback.

### Data Privacy
Be aware that the extension sends chunks of the current file to external endpoints. 
Users should be warned if using public APIs with sensitive/proprietary code.

## Troubleshooting

- **No suggestions appearing?** Open the Output panel and select "And Then Next Suggestion" to inspect timestamped request/response logs. Non-error logs write only to the Output Channel (the extension no longer crosses IPC via `console.log` on the hot path); errors additionally go to `console.error`.
- **Endpoint errors?** Verify the URL includes the full path (e.g. `/v1/chat/completions` for OpenAI). HTTP errors surface provider-specific messages (401/402/403/404/408/422/429/5xx are mapped in `src/statusMessages.ts`).
- **Status Bar Icons**:
    - `$(zap)`: Ready.
    - `$(sync~spin)`: Request in flight (skipped on cache hits, so repeated identical context never flickers).
    - `$(error)`: Last request failed.
- **Hitting rate limits?** Raise `andThenNextSuggestion.debounceMs` or set `andThenNextSuggestion.rateLimitMs` for a hard floor between requests.
