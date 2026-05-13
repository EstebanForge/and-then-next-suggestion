# GEMINI.md - And Then Next Suggestion

## Project Overview
**And Then Next Suggestion** is a lightweight, model-agnostic VS Code extension for tab autocomplete (ghost text). It allows developers to connect to any AI provider (OpenAI, Anthropic, Ollama, or custom endpoints) without being locked into a specific ecosystem.

- **Primary Stack**: TypeScript, VS Code Extension API.
- **Key Feature**: Generic interface for LLM completions with support for custom JSON payloads.
- **Architecture**: Single-entry extension (`src/extension.ts`) handling UI (Status Bar), Configuration, and the `InlineCompletionItemProvider`.

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
- **Locality of Behavior**: Core logic is currently centralized in `src/extension.ts` for simplicity.
- **Debouncing**: Requests are debounced by 300ms to avoid API flooding.
- **Context Handling**: completions use 2000 chars of prefix and 1000 chars of suffix context.

### Security & Secrets
- **API Keys**: Prioritize `vscode.ExtensionContext.secrets` over plain-text configuration.
- **Environment Variables**: Fallback to `<PROVIDER>_API_KEY` environment variables if no key is stored in VS Code.
- **Logging**: Never log sensitive data (like API keys) to the Output Channel.

### Logging
- Use the internal `log()` function which writes to the "And Then Next Suggestion" Output Channel.
- Toggle visibility via the `andThenNextSuggestion.showLogs` command.

### UI / Status Bar
- The status bar indicates state:
    - `$(zap)`: Ready / Idle.
    - `$(sync~spin)`: Request in flight.
    - `$(error)`: Last request failed.
- Status bar tooltip provides details on the active profile and errors.

## Project Structure
- `src/extension.ts`: Main implementation (Activation, Commands, Provider, Fetch).
- `package.json`: Extension manifest, configuration schema, and scripts.
- `docs/`:
    - `architecture.md`: High-level design.
    - `development.md`: Contributor guide.
    - `providers.md`: Details on supported API types.
- `tsconfig.json`: TypeScript configuration.
- `out/`: Compiled output (ignored in git).
