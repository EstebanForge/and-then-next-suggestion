# Development & Contribution

## Getting Started

1. Clone the repository.
2. Run `npm install`.
3. Open the project in VS Code.
4. Press `F5` to launch a new VS Code window with the extension loaded.

## Toolchain

- **TypeScript**: Main language.
- **tsc**: Compiler.
- **VS Code Extension API**: Core library.

## Testing

Currently, testing is manual via the Extension Development Host. 
Future goal: Implement unit tests using `@vscode/test-electron` for mocking the editor environment.

## Security Considerations

### API Keys
NEVER log the API Key to the console or output channels. Use `context.secrets` for storage. 
When reading from settings, treat the value as a low-security fallback.

### Data Privacy
Be aware that the extension sends chunks of the current file to external endpoints. 
Users should be warned if using public APIs with sensitive/proprietary code.

## Troubleshooting

- **No suggestions appearing?** Check the "Output" panel and select "And Then Next Suggestion" (if logging is implemented) or check the Developer Tools Console (`Developer: Toggle Developer Tools`).
- **Endpoint errors?** Verify the URL includes the full path (e.g., `/v1/chat/completions` for OpenAI).
- **Status Bar Icons**:
    - `$(zap)`: Ready.
    - `$(sync~spin)`: Request in flight.
    - `$(error)`: Last request failed.
