# And Then Next Suggestion

And Then Next Suggestion is a model-agnostic tab autocomplete extension for VS Code. It allows you to use any AI model (local or remote) for code completions without being locked into a specific provider.

## Features

- **Model Agnostic**: Use OpenAI, Anthropic, Ollama, or any custom API endpoint.
- **Ghost Text Autocomplete**: Seamless high-quality suggestions as you type.
- **Explain Command**: Select code and run "Explain Selected Code" (`Ctrl+Alt+E`) to get a syntax-highlighted explanation in a webview panel.
- **Response Cache**: Identical context reuses the last suggestion within a 5-minute TTL (no redundant API calls).
- **Rate-Limit-Friendly**: Configurable debounce and an optional hard rate-limit floor for providers with strict request limits.
- **Fully Customizable**: Control every aspect of the API request, including the JSON body via custom templates.
- **Profile-Based**: Multiple provider profiles with independent endpoints, models, and keys. Switch from the status bar.
- **Secure Keys**: API keys stored via VS Code's `SecretStorage`, with environment-variable fallback.

## Configuration

Go to VS Code Settings and search for `And Then Next Suggestion`, or run **And Then Next Suggestion: Configure Profiles and Settings** from the Command Palette to use the Profile Manager webview.

Key settings:

- **Profiles** (`andThenNextSuggestion.profiles`): Array of provider profiles, each with `endpoint`, `apiType` (`openai` / `anthropic` / `ollama` / `custom`), `model`, and optional `apiKey` / `customBody`.
- **Active Profile** (`andThenNextSuggestion.activeProfile`): The profile ID to use for completions.
- **Debounce** (`andThenNextSuggestion.debounceMs`, default `200`): Delay after the last keystroke before requesting. Lower = snappier but more requests; higher = gentler on rate-limited/metered providers.
- **Rate-Limit Floor** (`andThenNextSuggestion.rateLimitMs`, default `0` = disabled): Hard minimum between any two API requests, shared across completions and Explain.
- **Request Timeout** (`andThenNextSuggestion.requestTimeout`, default `10`s): Kills stalled requests.
- **Disable Copilot** (`andThenNextSuggestion.disableCopilotAutocomplete`, default `true`): Disables **only** GitHub Copilot's tab autocomplete (inline / ghost-text suggestions) to avoid conflicts with this extension. Copilot Chat and all other Copilot features keep working. When you turn this off, the previously disabled Copilot autocomplete settings are restored.

See [API Key Security](#api-key-security) below for key resolution order.

## Notes

**Copilot interaction.** On activation (with the default `disableCopilotAutocomplete = true`), this extension turns off only GitHub Copilot's tab autocomplete — the inline / ghost-text suggestions (`github.copilot.enable.*`, `editor.enableAutoCompletions`, `inlineSuggest.enable`). Copilot Chat and every other Copilot feature are left untouched. Set `andThenNextSuggestion.disableCopilotAutocomplete` to `false` to re-enable Copilot autocomplete and let both run side by side.

## API Key Security

The extension resolves API keys in this order:

1. **VS Code Storage**:
   - Keys set via the `And Then Next Suggestion: Set API Key` command (stored in VS Code's secure `SecretStorage`).
   - Keys defined directly in the profile settings.
2. **Environment Variables**:
   - Fallback to environment variables based on the **Provider** name: `<PROVIDER>_API_KEY`.
   - Examples:
     - If Provider is `openai`, it looks for `OPENAI_API_KEY`.
     - If Provider is `opencode`, it looks for `OPENCODE_API_KEY`.
     - This allows multiple profiles (with unique IDs) to share the same environment variable.
## Usage

1. Configure your profiles via the Profile Manager or settings. Select the correct **API Type**.
2. Start typing in any file. Suggestions appear as "ghost text".
3. Press `Tab` to accept a suggestion.
4. Press `Alt + \` to manually trigger a suggestion.
5. Select code and press `Ctrl + Alt + E` (macOS: `Cmd + Alt + E`) to explain it.

## Commands

- **Trigger Suggestion** (`Alt + \`): Manually request a completion.
- **Explain Selected Code** (`Ctrl + Alt + E`): Explain the selected code in a webview panel.
- **Switch Provider Profile**: Click the status bar or run from the Command Palette.
- **Set API Key**: Store a key securely for a profile.
- **Open Settings** / **Show Logs**: Quick access to settings and the Output Channel.

## Example Custom Body for a FIM (Fill-In-the-Middle) API:

```json
{
  "model": "{{model}}",
  "prompt": "<PRE> {{before}} <SUF> {{after}} <MID>",
  "max_tokens": {{maxTokens}},
  "temperature": {{temperature}}
}
```

## License

MIT License. See [LICENSE](LICENSE) for details.
