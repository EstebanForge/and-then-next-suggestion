# And Then Next Suggestion

And Then Next Suggestion is a model-agnostic tab autocomplete extension for VS Code. It allows you to use any AI model (local or remote) for code completions without being locked into a specific provider.

## Features

- **Model Agnostic**: Use OpenAI, Anthropic, Ollama, or any custom API endpoint.
- **Ghost Text Autocomplete**: Seamless high-quality suggestions as you type.
- **Fully Customizable**: Control every aspect of the API request, including the JSON body.
- **Lightweight**: Purely focused on tab autocomplete.

## Configuration

Go to VS Code Settings and search for `And Then Next Suggestion` to configure:

- **Endpoint**: The URL of your AI provider's completion API.
- **API Key**: Your API key (if required). See [API Key Security](#api-key-security) below.
- **Provider**: The name of the provider (e.g., `openai`, `opencode`). Used for environment variable lookups.
- **API Type**: Select your provider's API format (`openai`, `anthropic`, `ollama`, or `custom`).
- **Model**: The model name to use (e.g., `gpt-3.5-turbo`, `claude-3-haiku`, `codellama`).

- **Custom Body**: If using `custom` provider, you can define the exact JSON payload. Use placeholders like `{{before}}`, `{{after}}`, `{{model}}`, etc.

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

1. Configure your endpoint and API key in settings. Select the correct **API Type**.
2. Start typing in any file.
3. Suggestions will appear as "ghost text".
4. Press `Tab` to accept a suggestion.
5. Press `Alt + \` to manually trigger a suggestion.

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
