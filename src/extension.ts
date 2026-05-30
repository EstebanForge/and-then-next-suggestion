import * as vscode from 'vscode';
import * as path from 'path';
import { DialectRegistry } from './providers/registry';
import { ProviderProfile, CompletionContext } from './providers/types';
import { ProfileManager } from './profileManager';

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

function log(message: string, isError: boolean = false) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}]${isError ? ' [ERROR]' : ''}`;
    logChannel.appendLine(`${prefix} ${message}`);
    if (isError) {
        console.error(`And Then Next Suggestion: ${message}`);
    } else {
        console.log(`And Then Next Suggestion: ${message}`);
    }
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

            let debounceOk = false;
            let ownEntry: DebounceEntry | undefined;
            await new Promise<void>((resolve, reject) => {
                ownEntry = {
                    timer: setTimeout(resolve, 300),
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

            const textBefore = document.getText(new vscode.Range(
                document.positionAt(Math.max(0, document.offsetAt(position) - 2000)),
                position
            ));
            const textAfter = document.getText(new vscode.Range(
                position,
                document.positionAt(document.offsetAt(position) + 1000)
            ));

            statusBarItem.text = '$(sync~spin)';
            activeRequests++;
            
            try {
                // 1. Try SecretStorage (set via command) or profile config first
                let apiKey = (await context.secrets.get(`andThenNextSuggestion.apiKey.${activeProfile.id}`)) || activeProfile.apiKey;

                // 2. Fallback to environment variables if not set in VS Code
                if (!apiKey) {
                    const providerEnvKey = activeProfile.provider.toUpperCase().replace(/[^A-Z0-9]/g, '_');
                    apiKey = process.env[`${providerEnvKey}_API_KEY`];
                }

                const ext = path.extname(document.uri.fsPath) || '';
                const suggestion = await fetchSuggestion(activeProfile, textBefore, textAfter, document.languageId, ext, docKey, apiKey, token);
                
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

    // Watch for config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('andThenNextSuggestion')) {
            updateStatusBar();
        }
        if (e.affectsConfiguration('andThenNextSuggestion.disableCopilotAutocomplete')) {
            await syncCopilotSettings();
        }
    }));

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

async function syncCopilotSettings() {
    const config = vscode.workspace.getConfiguration();
    const disableCopilot = config.get<boolean>('andThenNextSuggestion.disableCopilotAutocomplete');
    const copilotConfig = vscode.workspace.getConfiguration('github.copilot');
    
    const handleSyncError = (settingKey: string, err: any) => {
        const errMsg = String(err);
        if (!errMsg.includes('not a registered configuration')) {
            log(`Failed to update ${settingKey}: ${err}`, true);
        }
    };

    const hasSetting = (key: string) => copilotConfig.inspect(key) !== undefined;

    if (disableCopilot) {
        // 1. Disable completions globally via enable object mapping ("Ghost text suggestions")
        if (hasSetting('enable')) {
            const enableConfig = copilotConfig.get<Record<string, boolean>>('enable') || {};
            if (enableConfig['*'] !== false) {
                try {
                    const newEnable = { ...enableConfig, '*': false };
                    await copilotConfig.update('enable', newEnable, vscode.ConfigurationTarget.Global);
                    log('Disabled GitHub Copilot completions globally ("github.copilot.enable.* = false").');
                } catch (err) {
                    handleSyncError('github.copilot.enable', err);
                }
            }
        }

        // 2. Disable editor.enableAutoCompletions ("Auto Completions")
        if (hasSetting('editor.enableAutoCompletions')) {
            if (copilotConfig.get<boolean>('editor.enableAutoCompletions') !== false) {
                try {
                    await copilotConfig.update('editor.enableAutoCompletions', false, vscode.ConfigurationTarget.Global);
                    log('Disabled GitHub Copilot auto completions ("github.copilot.editor.enableAutoCompletions").');
                } catch (err) {
                    handleSyncError('github.copilot.editor.enableAutoCompletions', err);
                }
            }
        }

        // 3. Disable inlineSuggest.enable ("Next edit suggestions")
        if (hasSetting('inlineSuggest.enable')) {
            if (copilotConfig.get<boolean>('inlineSuggest.enable') !== false) {
                try {
                    await copilotConfig.update('inlineSuggest.enable', false, vscode.ConfigurationTarget.Global);
                    log('Disabled GitHub Copilot inline suggestions ("github.copilot.inlineSuggest.enable").');
                } catch (err) {
                    handleSyncError('github.copilot.inlineSuggest.enable', err);
                }
            }
        }
    } else {
        // Restore settings if they toggle it off
        if (hasSetting('enable')) {
            const enableConfig = copilotConfig.get<Record<string, boolean>>('enable') || {};
            if (enableConfig['*'] === false) {
                try {
                    const newEnable = { ...enableConfig, '*': true };
                    await copilotConfig.update('enable', newEnable, vscode.ConfigurationTarget.Global);
                    log('Re-enabled GitHub Copilot completions globally.');
                } catch (err) {
                    handleSyncError('github.copilot.enable', err);
                }
            }
        }

        if (hasSetting('editor.enableAutoCompletions')) {
            if (copilotConfig.get<boolean>('editor.enableAutoCompletions') === false) {
                try {
                    await copilotConfig.update('editor.enableAutoCompletions', true, vscode.ConfigurationTarget.Global);
                    log('Re-enabled GitHub Copilot auto completions ("github.copilot.editor.enableAutoCompletions").');
                } catch (err) {
                    handleSyncError('github.copilot.editor.enableAutoCompletions', err);
                }
            }
        }

        if (hasSetting('inlineSuggest.enable')) {
            if (copilotConfig.get<boolean>('inlineSuggest.enable') === false) {
                try {
                    await copilotConfig.update('inlineSuggest.enable', true, vscode.ConfigurationTarget.Global);
                    log('Re-enabled GitHub Copilot inline suggestions ("github.copilot.inlineSuggest.enable").');
                } catch (err) {
                    handleSyncError('github.copilot.inlineSuggest.enable', err);
                }
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
    apiKey?: string,
    token?: vscode.CancellationToken
): Promise<string | null> {
    const dialect = DialectRegistry.get(profile.apiType);
    const ctx: CompletionContext = {
        textBefore,
        textAfter,
        languageId,
        fileExtension,
        maxTokens: profile.maxTokens ?? 500,
        temperature: profile.temperature ?? 0.1
    };

    log(`Fetching suggestion from ${profile.endpoint} (Model: ${profile.model}, Dialect: ${dialect.type})`);

    const { url, init } = dialect.prepareRequest(ctx, profile, apiKey);

    const prev = abortControllers.get(docKey);
    if (prev) { prev.abort(); }

    const controller = new AbortController();
    abortControllers.set(docKey, controller);
    const cancellationDisposable = token?.onCancellationRequested(() => controller.abort());

    const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
    const timeoutMs = (config.get<number>('requestTimeout') ?? 10) * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });

        if (!response.ok) {
            log(`API Response Error (${response.status})`, true);
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data: any = await response.json();
        log(`Successfully received response from ${dialect.type}. Tokens: ${data.usage?.total_tokens ?? '?'}`);

        const rawContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
        log(`Raw response content (${rawContent.length} chars): ${rawContent.substring(0, 200)}`);

        const result = dialect.parseResponse(data, ctx);
        log(`Parsed suggestion (${result?.length ?? 0} chars): ${result?.substring(0, 200) ?? 'null'}`);

        return result;
    } finally {
        clearTimeout(timeoutId);
        cancellationDisposable?.dispose();
        if (abortControllers.get(docKey) === controller) {
            abortControllers.delete(docKey);
        }
    }
}

export function deactivate() {}
