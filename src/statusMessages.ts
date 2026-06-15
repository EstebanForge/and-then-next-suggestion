/**
 * Maps an HTTP status code to a user-friendly, actionable error message.
 * Pure function: no vscode dependency, fully unit-testable.
 *
 * @param status - HTTP status code from the response
 * @param profileName - display name of the profile that failed (for context)
 */
export function statusToMessage(status: number, profileName: string): string {
    switch (status) {
        case 400:
            return `Bad Request (400): provider "${profileName}" rejected the request. Check the model name and parameters in profile settings.`;
        case 401:
            return `Unauthorized (401): the API key for "${profileName}" is invalid or missing. Set it via the "And Then Next Suggestion: Set API Key" command.`;
        case 402:
            return `Payment Required (402): check your billing or quota for "${profileName}" at the provider.`;
        case 403:
            return `Forbidden (403): your key for "${profileName}" lacks permission for this model or resource.`;
        case 404:
            return `Not Found (404): the endpoint or model for "${profileName}" is incorrect. Verify the endpoint URL and model name in profile settings.`;
        case 408:
            return `Request Timeout (408): provider "${profileName}" did not respond in time. Increase "Request Timeout" in settings.`;
        case 422:
            return `Invalid Request (422): provider "${profileName}" rejected the payload. Check the model name and parameters.`;
        case 429:
            return `Rate Limit Exceeded (429): too many requests to "${profileName}". Wait a moment, or set a rate-limit floor in settings.`;
        default:
            if (status >= 500) {
                return `Server Error (${status}): provider "${profileName}" is having issues. Try again later.`;
            }
            return `API Error (${status}) from "${profileName}".`;
    }
}
