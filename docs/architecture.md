# Project Overview & Architecture

And Then Next Suggestion is a lightweight, model-agnostic VS Code extension for tab autocomplete. Unlike other extensions that lock users into specific backend providers, And Then Next Suggestion provides a generic interface to connect to any LLM endpoint.

## High-Level Architecture

The extension follows a standard VS Code extension structure:

1.  **Entry Point (`src/extension.ts`)**: Handles extension activation, command registration, and status bar management.
2.  **Inline Completion Provider**: The core engine that listens to editor changes and requests suggestions.
3.  **API Client (`fetchSuggestion`)**: A flexible function that transforms editor context into provider-specific payloads.

## Key Components

### Inline Completion Provider
Registered via `vscode.languages.registerInlineCompletionItemProvider`. 
- **Trigger**: Automatic (on type) or Manual (`Alt + \`).
- **Context Extraction**: Captures 2000 characters before and 1000 characters after the cursor to provide sufficient LLM context while keeping payloads manageable.
- **Debouncing**: Implements a 300ms sleep before execution to prevent API flooding during fast typing.

### Configuration Management
Settings are defined in `package.json` and accessed via `vscode.workspace.getConfiguration('andThenNextSuggestion')`. 
- **Dynamic Updates**: Changes to settings are reflected immediately on the next completion request.
- **Secrets**: API keys are prioritized from `vscode.ExtensionContext.secrets` for security.

### Request Flow
1. User types in editor.
2. `provideInlineCompletionItems` is triggered.
3. Configuration and Secrets are read.
4. `fetchSuggestion` determines the payload format based on the `provider` setting.
5. `fetch` call is made to the configured `endpoint`.
6. Response is parsed and converted into a `vscode.InlineCompletionItem`.
7. Ghost text is rendered in the editor.
