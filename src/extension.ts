import * as vscode from 'vscode';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DialectRegistry } from './providers/registry';
import { ProviderProfile, CompletionContext } from './providers/types';
import { ProfileManager } from './profileManager';
import { statusToMessage } from './statusMessages';
import { buildExplainRequest, parseExplainResponse } from './explain';
import { buildExplainHtml, prismLanguageId, prismComponentFiles } from './explainWebview';
import {
    CacheEntry,
    buildCacheKey,
    cacheGet,
    cacheSet as cachePut,
} from './cache';
import { computeRateWait } from './rateLimit';

let statusBarItem: vscode.StatusBarItem;
let logChannel: vscode.OutputChannel;
let activeRequests = 0;
const lastRequestIds = new Map<string, number>();
const abortControllers = new Map<string, AbortController>();

interface DebounceEntry {
    timer: ReturnType<typeof setTimeout>;
    resolve: () => void;
    reject: () => void;
}
const debounceEntries = new Map<string, DebounceEntry>();

// Response cache: identical prefix + suffix + profile = instant, no API call.
// LRU + TTL helpers live in ./cache (pure, unit-tested); this Map is the store.
const suggestionCache = new Map<string, CacheEntry>();

function cacheSet(key: string, result: string): void {
    cachePut(suggestionCache, key, result, Date.now());
}

// API key cache: avoids an OS keychain round-trip (20-150ms) on every request.
// Invalidated on setApiKey command and on profile config changes. A provider
// with no key (e.g. Ollama) caches an empty-string sentinel so the keychain is
// hit at most once per profile.
const apiKeyCache = new Map<string, string>();

async function resolveApiKey(context: vscode.ExtensionContext, profile: ProviderProfile): Promise<string | undefined> {
    if (apiKeyCache.has(profile.id)) {
        return apiKeyCache.get(profile.id) || undefined;
    }
    let key = (await context.secrets.get(`andThenNextSuggestion.apiKey.${profile.id}`)) || profile.apiKey;
    if (!key) {
        const providerEnvKey = profile.provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        key = process.env[`${providerEnvKey}_API_KEY`];
    }
    apiKeyCache.set(profile.id, key ?? '');
    return key || undefined;
}

// Rate-limit floor: minimum ms between any two API calls (independent of debounce).
// Shared by inline completion AND explain so the floor is truly global.
let lastApiCallTime = 0;

/**
 * Enforces the global rate-limit floor. The slot is reserved synchronously
 * (before any await) so concurrent callers space out rather than both racing
 * past the check. Returns after the required wait, if any.
 */
async function applyRateFloor(): Promise<void> {
    const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
    const rateLimitMs = config.get<number>('rateLimitMs') ?? 0;
    const { wait, reservedTime } = computeRateWait(Date.now(), lastApiCallTime, rateLimitMs);
    // Reserve the projected fire time now, before yielding, to close the race.
    lastApiCallTime = reservedTime;
    if (wait > 0) {
        log(`Rate-limit floor active — waiting ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
    }
}

function log(message: string, isError: boolean = false) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}]${isError ? ' [ERROR]' : ''}`;
    logChannel.appendLine(`${prefix} ${message}`);
    if (isError) {
        console.error(`And Then Next Suggestion: ${message}`);
    }
    // Non-error logs go only to the OutputChannel — console.log crosses IPC to
    // the renderer on every call, which is wasteful on the per-fetch path.
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize Log Channel
    logChannel = vscode.window.createOutputChannel('And Then Next Suggestion');
    context.subscriptions.push(logChannel);
    log('Extension is now active!');

    // Initialize Status Bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(zap)';
    statusBarItem.tooltip = 'Click to switch provider profile';
    statusBarItem.command = 'andThenNextSuggestion.switchProvider';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    updateStatusBar();
    syncCopilotSettings().catch(err => log(`Failed during initial Copilot settings sync: ${err}`, true));


    const provider: vscode.InlineCompletionItemProvider = {
        async provideInlineCompletionItems(document, position, contextProv, token) {
            const docKey = document.uri.toString();
            const requestId = (lastRequestIds.get(docKey) || 0) + 1;
            lastRequestIds.set(docKey, requestId);

            const prev = debounceEntries.get(docKey);
            if (prev) { clearTimeout(prev.timer); prev.reject(); }

            const debounceMs = vscode.workspace.getConfiguration('andThenNextSuggestion').get<number>('debounceMs') ?? 200;
            let debounceOk = false;
            let ownEntry: DebounceEntry | undefined;
            await new Promise<void>((resolve, reject) => {
                ownEntry = {
                    timer: setTimeout(resolve, debounceMs),
                    resolve,
                    reject
                };
                debounceEntries.set(docKey, ownEntry);
            }).then(() => { debounceOk = true; }).catch(() => {});

            // Only delete if we still own the entry (not replaced by a newer call)
            if (debounceEntries.get(docKey) === ownEntry) {
                debounceEntries.delete(docKey);
            }

            if (!debounceOk || token.isCancellationRequested || requestId !== (lastRequestIds.get(docKey) || 0)) {
                return [];
            }

            const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
            const profiles = config.get<ProviderProfile[]>('profiles') || [];
            const activeProfileId = config.get<string>('activeProfile');
            const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

            if (!activeProfile || !activeProfile.endpoint) {
                return [];
            }

            const offset = document.offsetAt(position);
            const textBefore = document.getText(new vscode.Range(
                document.positionAt(Math.max(0, offset - 2000)),
                position
            ));
            const textAfter = document.getText(new vscode.Range(
                position,
                document.positionAt(offset + 1000)
            ));

            // Cache hit: return without touching the status bar (avoids zap->spin->zap flicker).
            const cacheKey = buildCacheKey(activeProfile.id, textBefore, textAfter);
            const cached = cacheGet(suggestionCache, cacheKey, Date.now());
            if (cached) {
                return [new vscode.InlineCompletionItem(cached, new vscode.Range(position, position))];
            }

            statusBarItem.text = '$(sync~spin)';
            activeRequests++;
            
            try {
                const apiKey = await resolveApiKey(context, activeProfile);

                const ext = path.extname(document.uri.fsPath) || '';
                const suggestion = await fetchSuggestion(activeProfile, textBefore, textAfter, document.languageId, ext, docKey, apiKey, token, cacheKey);
                
                if (suggestion) {
                    return [new vscode.InlineCompletionItem(suggestion, new vscode.Range(position, position))];
                }
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return [];
                }
                const errorMsg = error instanceof Error ? error.message : String(error);
                log(`Error in completion: ${errorMsg}`, true);
                statusBarItem.text = '$(error)';
                statusBarItem.tooltip = `Error: ${errorMsg}\nClick to switch profiles or check logs.`;
                setTimeout(() => {
                    if (statusBarItem.text.includes('$(error)')) {
                        updateStatusBar();
                    }
                }, 5000);
            } finally {
                activeRequests--;
                if (activeRequests <= 0 && statusBarItem.text.includes('$(sync~spin)')) {
                    updateStatusBar();
                }
            }

            return [];
        },
    };

    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' },
            provider
        )
    );

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.trigger', () => {
            vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'andThenNextSuggestion');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.showLogs', () => {
            logChannel.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.manageProfiles', () => {
            ProfileManager.render(context.extensionUri);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.setApiKey', async () => {
            const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
            const profiles = config.get<ProviderProfile[]>('profiles') || [];
            
            const selected = await vscode.window.showQuickPick(
                profiles.map(p => ({ label: p.name, id: p.id })),
                { placeHolder: 'Select profile to set API key for' }
            );

            if (selected) {
                const apiKey = await vscode.window.showInputBox({
                    prompt: `Enter API Key for ${selected.label}`,
                    password: true,
                    placeHolder: 'sk-...'
                });
                if (apiKey) {
                    await context.secrets.store(`andThenNextSuggestion.apiKey.${selected.id}`, apiKey);
                    apiKeyCache.set(selected.id, apiKey);
                    vscode.window.showInformationMessage(`And Then Next Suggestion: API Key for ${selected.label} stored securely.`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.switchProvider', async () => {
            const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
            const profiles = config.get<ProviderProfile[]>('profiles') || [];
            const activeProfileId = config.get<string>('activeProfile');

            const items = profiles.map(p => ({
                label: p.id === activeProfileId ? `$(check) ${p.name}` : p.name,
                description: p.model || p.apiType,
                detail: p.endpoint,
                profileId: p.id
            }));

            items.push({ label: 'Actions', kind: vscode.QuickPickItemKind.Separator } as any);
            items.push({ label: '$(output) Show Extension Logs', description: '', detail: '', profileId: '__logs__' } as any);
            items.push({ label: '$(gear) Configure Profiles and Settings...', description: '', detail: '', profileId: '__settings__' } as any);

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select active provider profile'
            });

            if (selected) {
                if (selected.profileId === '__settings__') {
                    vscode.commands.executeCommand('andThenNextSuggestion.openSettings');
                } else if (selected.profileId === '__logs__') {
                    vscode.commands.executeCommand('andThenNextSuggestion.showLogs');
                } else {
                    await config.update('activeProfile', selected.profileId, vscode.ConfigurationTarget.Global);
                    updateStatusBar();
                    vscode.window.showInformationMessage(`Active profile switched to: ${selected.label.replace('$(check) ', '')}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('andThenNextSuggestion.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('And Then Next Suggestion: No active editor.');
                return;
            }
            const selection = editor.selection;
            if (selection.isEmpty) {
                vscode.window.showWarningMessage('And Then Next Suggestion: Select some code to explain first.');
                return;
            }
            const code = editor.document.getText(selection);
            if (!code) { return; }

            const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
            const profiles = config.get<ProviderProfile[]>('profiles') || [];
            const activeProfile = profiles.find(p => p.id === config.get<string>('activeProfile')) || profiles[0];
            if (!activeProfile || !activeProfile.endpoint) {
                vscode.window.showErrorMessage('And Then Next Suggestion: No provider profile configured.');
                return;
            }

            const apiKey = await resolveApiKey(context, activeProfile);

            const languageId = editor.document.languageId;
            const panel = vscode.window.createWebviewPanel(
                'codeExplanation',
                'Code Explanation',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    // Restrict local file access to the bundled Prism assets only.
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media', 'prism')]
                }
            );

            // Abort the in-flight request if the user closes the panel.
            let disposed = false;
            const explainController = new AbortController();
            panel.onDidDispose(() => {
                disposed = true;
                explainController.abort();
            });

            panel.webview.html = renderExplainHtml(panel.webview, context.extensionUri, code, 'Generating explanation…', languageId, false);

            try {
                const explanation = await runExplain(activeProfile, apiKey, code, explainController);
                if (!disposed) {
                    panel.webview.html = renderExplainHtml(panel.webview, context.extensionUri, code, explanation || 'No explanation generated.', languageId, false);
                }
            } catch (error) {
                // Closed mid-request: abort is expected, not an error.
                if (disposed || (error instanceof DOMException && error.name === 'AbortError')) { return; }
                const msg = error instanceof Error ? error.message : String(error);
                log(`Explain error: ${msg}`, true);
                if (!disposed) {
                    panel.webview.html = renderExplainHtml(panel.webview, context.extensionUri, code, `Error: ${msg}`, languageId, true);
                }
            }
        })
    );

    // Watch for config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('andThenNextSuggestion')) {
            updateStatusBar();
            // Profiles, models, or rate-limit may have changed — invalidate caches.
            suggestionCache.clear();
            apiKeyCache.clear();
        }
        if (e.affectsConfiguration('andThenNextSuggestion.disableCopilotAutocomplete')) {
            await syncCopilotSettings();
        }
    }));

    // Invalidate the API key cache if a stored secret changes outside the
    // setApiKey command (e.g. revoked via VS Code's secret management).
    context.subscriptions.push(context.secrets.onDidChange(() => apiKeyCache.clear()));

    // Clean up per-document state when documents close
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        const docKey = doc.uri.toString();
        lastRequestIds.delete(docKey);
        const controller = abortControllers.get(docKey);
        if (controller) {
            controller.abort();
            abortControllers.delete(docKey);
        }
        const debounce = debounceEntries.get(docKey);
        if (debounce) {
            clearTimeout(debounce.timer);
            debounce.reject();
            debounceEntries.delete(docKey);
        }
    }));
}

function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
    const profiles = config.get<ProviderProfile[]>('profiles') || [];
    const activeProfileId = config.get<string>('activeProfile');
    const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

    statusBarItem.text = '$(zap)';
    if (activeProfile) {
        statusBarItem.tooltip = `Active Profile: ${activeProfile.name}\nModel: ${activeProfile.model || 'N/A'}\nEndpoint: ${activeProfile.endpoint}\n\nClick to switch profiles or check logs.`;
    } else {
        statusBarItem.tooltip = 'Click to configure provider profiles';
    }
}

// Copilot settings toggled to avoid ghost-text conflicts. Each entry knows
// how to read its "disabled" state and produce the disabled/enabled value.
// `enable` is special-cased: it is an object keyed by language glob (`*`).
interface CopilotToggle {
    key: string;
    isDisabled: (current: any) => boolean;
    apply: (current: any, disable: boolean) => any;
    disableMsg: string;
    enableMsg: string;
}

const COPILOT_TOGGLES: CopilotToggle[] = [
    {
        key: 'enable',
        isDisabled: (v) => v?.['*'] === false,
        apply: (v, disable) => ({ ...(v || {}), '*': !disable }),
        disableMsg: 'Disabled GitHub Copilot completions globally ("github.copilot.enable.* = false").',
        enableMsg: 'Re-enabled GitHub Copilot completions globally.',
    },
    {
        key: 'editor.enableAutoCompletions',
        isDisabled: (v) => v === false,
        apply: (_v, disable) => !disable,
        disableMsg: 'Disabled GitHub Copilot auto completions ("github.copilot.editor.enableAutoCompletions").',
        enableMsg: 'Re-enabled GitHub Copilot auto completions ("github.copilot.editor.enableAutoCompletions").',
    },
    {
        key: 'inlineSuggest.enable',
        isDisabled: (v) => v === false,
        apply: (_v, disable) => !disable,
        disableMsg: 'Disabled GitHub Copilot inline suggestions ("github.copilot.inlineSuggest.enable").',
        enableMsg: 'Re-enabled GitHub Copilot inline suggestions ("github.copilot.inlineSuggest.enable").',
    },
];

async function syncCopilotSettings() {
    const config = vscode.workspace.getConfiguration();
    const disableCopilot = config.get<boolean>('andThenNextSuggestion.disableCopilotAutocomplete');
    const copilotConfig = vscode.workspace.getConfiguration('github.copilot');
    const hasSetting = (key: string) => copilotConfig.inspect(key) !== undefined;

    for (const toggle of COPILOT_TOGGLES) {
        if (!hasSetting(toggle.key)) { continue; }
        const current = copilotConfig.get(toggle.key);
        const alreadyDisabled = toggle.isDisabled(current);
        const shouldToggle = disableCopilot ? !alreadyDisabled : alreadyDisabled;
        if (!shouldToggle) { continue; }

        const settingKey = `github.copilot.${toggle.key}`;
        try {
            await copilotConfig.update(toggle.key, toggle.apply(current, !!disableCopilot), vscode.ConfigurationTarget.Global);
            log(disableCopilot ? toggle.disableMsg : toggle.enableMsg);
        } catch (err) {
            const errMsg = String(err);
            if (!errMsg.includes('not a registered configuration')) {
                log(`Failed to update ${settingKey}: ${err}`, true);
            }
        }
    }
}

async function fetchSuggestion(
    profile: ProviderProfile,
    textBefore: string,
    textAfter: string,
    languageId: string,
    fileExtension: string,
    docKey: string,
    apiKey: string | undefined,
    token: vscode.CancellationToken | undefined,
    cacheKey: string
): Promise<string | null> {
    const ctx: CompletionContext = {
        textBefore,
        textAfter,
        languageId,
        fileExtension,
        maxTokens: profile.maxTokens ?? 500,
        temperature: profile.temperature ?? 0.1
    };

    // Cache is already checked by the inline provider before calling here;
    // no second lookup needed.

    const dialect = DialectRegistry.get(profile.apiType);
    log(`Fetching suggestion from ${profile.endpoint} (Model: ${profile.model}, Dialect: ${dialect.type})`);

    // Rate-limit floor (global, shared with explain). Reserves the slot
    // synchronously to avoid the concurrent-caller race.
    await applyRateFloor();
    if (token?.isCancellationRequested) { return null; }

    const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
    const { url, init } = dialect.prepareRequest(ctx, profile, apiKey);

    const prev = abortControllers.get(docKey);
    if (prev) { prev.abort(); }

    const controller = new AbortController();
    abortControllers.set(docKey, controller);
    const cancellationDisposable = token?.onCancellationRequested(() => controller.abort());

    const timeoutMs = (config.get<number>('requestTimeout') ?? 10) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });

        if (!response.ok) {
            log(`API Response Error (${response.status})`, true);
            throw new Error(statusToMessage(response.status, profile.name));
        }

        const data: any = await response.json();
        log(`Successfully received response from ${dialect.type}. Tokens: ${data.usage?.total_tokens ?? '?'}`);

        const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
        log(`Raw response content (${rawContent.length} chars): ${rawContent.substring(0, 200)}`);

        const result = dialect.parseResponse(data, ctx);
        log(`Parsed suggestion (${result?.length ?? 0} chars): ${result?.substring(0, 200) ?? 'null'}`);

        // Cache only actual suggestions (skip nulls so retries stay possible).
        if (result) {
            cacheSet(cacheKey, result);
        }

        return result;
    } finally {
        clearTimeout(timeoutId);
        cancellationDisposable?.dispose();
        if (abortControllers.get(docKey) === controller) {
            abortControllers.delete(docKey);
        }
    }
}

/**
 * Resolves bundled Prism resources to webview URIs and renders the explain HTML.
 * Keeps the URI/nonce plumbing (vscode-specific) here so the pure buildExplainHtml
 * stays testable without vscode.
 */
function renderExplainHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    code: string,
    explanation: string,
    languageId: string,
    isError: boolean
): string {
    const prismDir = vscode.Uri.joinPath(extensionUri, 'media', 'prism');
    const styleHref = webview.asWebviewUri(vscode.Uri.joinPath(prismDir, 'prism-okaidia.min.css'));
    const coreHref = webview.asWebviewUri(vscode.Uri.joinPath(prismDir, 'prism-core.min.js'));
    const prismLang = prismLanguageId(languageId) ?? 'clike';
    const componentHrefs = prismComponentFiles(prismLang).map(
        f => webview.asWebviewUri(vscode.Uri.joinPath(prismDir, f))
    );
    return buildExplainHtml({
        code,
        explanation,
        languageId,
        isError,
        styleHref: styleHref.toString(),
        coreScriptHref: coreHref.toString(),
        componentScriptHrefs: componentHrefs.map(h => h.toString()),
        nonce: randomUUID(),
        cspSource: webview.cspSource
    });
}

/**
 * Runs an "explain this code" chat request against the given profile.
 * Reuses the same timeout + status-error handling as fetchSuggestion.
 */
async function runExplain(
    profile: ProviderProfile,
    apiKey: string | undefined,
    code: string,
    controller: AbortController
): Promise<string> {
    // Honor the same global rate-limit floor as inline completion (#10).
    await applyRateFloor();
    if (controller.signal.aborted) { throw new DOMException('Aborted', 'AbortError'); }

    const { url, init } = buildExplainRequest(profile, apiKey, code);
    log(`Fetching explanation from ${profile.endpoint} (Model: ${profile.model}, Dialect: ${profile.apiType})`);

    const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
    const timeoutMs = (config.get<number>('requestTimeout') ?? 10) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) {
            log(`Explain API Response Error (${response.status})`, true);
            throw new Error(statusToMessage(response.status, profile.name));
        }
        const data: any = await response.json();
        const result = parseExplainResponse(profile.apiType, data);
        if (!result) { throw new Error('The provider returned an empty explanation.'); }
        return result.trim();
    } finally {
        clearTimeout(timeoutId);
    }
}

export function deactivate() {}
