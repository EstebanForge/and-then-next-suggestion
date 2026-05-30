import * as vscode from 'vscode';
import { ProviderProfile } from './providers/types';

function isValidProfile(data: any): data is ProviderProfile {
    return (
        typeof data === 'object' && data !== null &&
        typeof data.id === 'string' && data.id.trim().length > 0 &&
        typeof data.name === 'string' && data.name.trim().length > 0 &&
        typeof data.endpoint === 'string' && data.endpoint.trim().length > 0 &&
        typeof data.provider === 'string' && data.provider.trim().length > 0 &&
        ['openai', 'anthropic', 'ollama', 'custom'].includes(data.apiType) &&
        (data.maxTokens === undefined || (Number.isInteger(data.maxTokens) && data.maxTokens > 0)) &&
        (data.temperature === undefined || (typeof data.temperature === 'number' && data.temperature >= 0 && data.temperature <= 2))
    );
}

function generateUniqueId(existing: ProviderProfile[]): string {
    let id: string;
    do {
        id = 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    } while (existing.some(p => p.id === id));
    return id;
}

export class ProfileManager {
    public static currentPanel: ProfileManager | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            await this.handleMessage(msg);
        });

        this.panel.onDidDispose(() => this.dispose());

        this.panel.webview.html = this.getWebviewContent(this.panel.webview);
    }

    public static render(extensionUri: vscode.Uri) {
        if (ProfileManager.currentPanel) {
            ProfileManager.currentPanel.panel.reveal(vscode.ViewColumn.One);
            ProfileManager.currentPanel.refresh();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'profileManager',
            'And Then Next Suggestion: Manage Profiles',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                ],
            }
        );

        ProfileManager.currentPanel = new ProfileManager(panel, extensionUri);
    }

    private refresh() {
        const config = vscode.workspace.getConfiguration('andThenNextSuggestion');
        const profiles = config.get<ProviderProfile[]>('profiles') || [];
        const activeProfileId = config.get<string>('activeProfile');
        this.panel.webview.postMessage({ type: 'refresh', profiles, activeProfileId });
    }

    private async handleMessage(msg: any) {
        const config = vscode.workspace.getConfiguration('andThenNextSuggestion');

        switch (msg.type) {
            case 'ready':
                this.refresh();
                break;

            case 'save': {
                if (!msg.profile || !isValidProfile(msg.profile)) {
                    vscode.window.showErrorMessage('Invalid profile data. Required: id, name, endpoint, provider, apiType.');
                    return;
                }
                const originalId = msg.originalId || msg.profile.id;
                const profiles = config.get<ProviderProfile[]>('profiles') || [];
                const idx = profiles.findIndex(p => p.id === originalId);
                if (idx >= 0) {
                    // Preserve fields not in the webview form
                    const existing = profiles[idx];
                    if (existing.disableThinking !== undefined) { msg.profile.disableThinking = existing.disableThinking; }
                    if (existing.supportsThinking !== undefined) { msg.profile.supportsThinking = existing.supportsThinking; }
                    if (existing.apiKey !== undefined) { msg.profile.apiKey = existing.apiKey; }
                    // If ID changed, check new ID doesn't collide
                    if (originalId !== msg.profile.id && profiles.some(p => p.id === msg.profile.id)) {
                        vscode.window.showErrorMessage(`Profile ID "${msg.profile.id}" already exists.`);
                        return;
                    }
                    profiles[idx] = msg.profile;
                    // If active profile was renamed, update activeProfile
                    const activeId = config.get<string>('activeProfile');
                    if (activeId === originalId && originalId !== msg.profile.id) {
                        await config.update('activeProfile', msg.profile.id, vscode.ConfigurationTarget.Global);
                    }
                } else {
                    if (profiles.some(p => p.id === msg.profile.id)) {
                        vscode.window.showErrorMessage(`Profile ID "${msg.profile.id}" already exists.`);
                        return;
                    }
                    profiles.push(msg.profile);
                }
                await config.update('profiles', profiles, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Profile "${msg.profile.name}" saved.`);
                this.refresh();
                break;
            }

            case 'delete': {
                if (typeof msg.id !== 'string') { return; }
                const profiles = config.get<ProviderProfile[]>('profiles') || [];
                const target = profiles.find(p => p.id === msg.id);
                const targetName = target?.name || msg.id;
                const confirmDelete = await vscode.window.showWarningMessage(
                    `Delete profile "${targetName}"?`,
                    { modal: true }, 'Delete'
                );
                if (confirmDelete !== 'Delete') { return; }

                const filtered = profiles.filter(p => p.id !== msg.id);
                if (filtered.length === 0) {
                    vscode.window.showWarningMessage('Cannot delete the last profile.');
                    return;
                }
                await config.update('profiles', filtered, vscode.ConfigurationTarget.Global);
                const activeId = config.get<string>('activeProfile');
                if (activeId === msg.id) {
                    await config.update('activeProfile', filtered[0].id, vscode.ConfigurationTarget.Global);
                }
                this.refresh();
                break;
            }

            case 'duplicate': {
                if (typeof msg.id !== 'string') { return; }
                const profiles = config.get<ProviderProfile[]>('profiles') || [];
                const source = profiles.find(p => p.id === msg.id);
                if (!source) { return; }
                const copy: ProviderProfile = {
                    ...source,
                    id: generateUniqueId(profiles),
                    name: `${source.name} (Copy)`,
                };
                profiles.push(copy);
                await config.update('profiles', profiles, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Duplicated profile as "${copy.name}".`);
                this.refresh();
                break;
            }

            case 'setActive': {
                if (typeof msg.id !== 'string') { return; }
                const profiles = config.get<ProviderProfile[]>('profiles') || [];
                if (!profiles.some(p => p.id === msg.id)) {
                    vscode.window.showErrorMessage(`Profile "${msg.id}" not found.`);
                    return;
                }
                await config.update('activeProfile', msg.id, vscode.ConfigurationTarget.Global);
                this.refresh();
                break;
            }
        }
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const bundledJs = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'vscode-elements-bundled.js')
        );

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';">
    <title>Manage Provider Profiles</title>
    <script type="module" src="${bundledJs}"></script>
    <style>
        :root { --spacing: 12px; }
        body {
            padding: 0 20px 40px 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
        }
        h1 { font-size: 1.3em; margin: 16px 0 4px 0; }
        .subtitle { color: var(--vscode-descriptionForeground); margin: 0 0 16px 0; font-size: 0.9em; }
        .actions-bar {
            display: flex; gap: 8px; margin-bottom: 16px; align-items: center;
        }
        .profile-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 12px;
            background: var(--vscode-editor-background);
        }
        .profile-card.active {
            border-color: var(--vscode-focusBorder);
        }
        .profile-card-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: var(--vscode-list-hoverBackground);
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            user-select: none;
        }
        .profile-card-header .profile-name {
            flex: 1;
            font-weight: 600;
            font-size: 0.95em;
        }
        .profile-card-header .active-badge {
            font-size: 0.75em;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            padding: 2px 8px;
            border-radius: 10px;
        }
        .profile-card-body {
            padding: 14px;
            display: none;
        }
        .profile-card.expanded .profile-card-body {
            display: block;
        }
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px 20px;
        }
        .form-grid .full-width {
            grid-column: 1 / -1;
        }
        .form-grid vscode-form-group {
            margin-bottom: 0;
        }
        .profile-actions {
            display: flex; gap: 8px; margin-top: 14px; padding-top: 10px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .save-toast {
            display: inline-block;
            font-size: 0.85em;
            color: var(--vscode-notificationsInfoIcon-foreground, #3794ff);
            margin-left: 8px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .save-toast.show { opacity: 1; }
        vscode-textfield, vscode-single-select, vscode-textarea {
            width: 100%;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .field-hint {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        vscode-form-group:not(:defined) { display: block; min-height: 50px; }
        vscode-textfield:not(:defined) { display: inline-block; height: 26px; width: 300px; visibility: hidden; }
        vscode-single-select:not(:defined) { display: inline-block; height: 26px; width: 300px; visibility: hidden; }
        vscode-button:not(:defined) { display: inline-block; height: 26px; visibility: hidden; }
    </style>
</head>
<body>
    <h1>Provider Profiles</h1>
    <p class="subtitle">Add, edit, or remove autocomplete provider profiles. Changes are saved when you click Save.</p>

    <div class="info-alert" style="margin-bottom:16px; padding:12px; background:var(--vscode-input-background, #252526); border-left:4px solid var(--vscode-notificationsInfoIcon-foreground, #3794ff); border-radius:4px; font-size:0.9em; border: 1px solid var(--vscode-panel-border);">
        <div style="font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
            🔑 Secure API Key Management
        </div>
        <p style="margin:0 0 8px 0; color:var(--vscode-foreground);">
            To keep your credentials secure, do not write plain-text API keys in settings files. Use the VS Code command palette and search for <strong>And Then Next Suggestion: Set API Key</strong> to store them safely in the VS Code secure enclave.
        </p>
        <p style="margin:0; font-size:0.95em; color:var(--vscode-descriptionForeground);">
            Alternatively, you can define environment variables on your system, which will be read automatically:
            <ul style="margin:6px 0 0 0; padding-left:20px; line-height:1.5;">
                <li>Anthropic: <code>ANTHROPIC_API_KEY</code></li>
                <li>OpenAI: <code>OPENAI_API_KEY</code></li>
                <li>DeepSeek: <code>DEEPSEEK_API_KEY</code></li>
                <li>Custom Providers: <code>&lt;PROVIDER_NAME&gt;_API_KEY</code> (e.g. <code>MY_PROVIDER_API_KEY</code>)</li>
            </ul>
        </p>
    </div>

    <div class="actions-bar">
        <vscode-button id="btn-add">Add New Profile</vscode-button>
    </div>

    <div id="profiles-list"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let profiles = [];
        let activeProfileId = '';
        let expandedId = null;

        function esc(s) {
            return String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Escape for textarea content (< and > to prevent tag injection)
        function escTA(s) {
            return String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function generateId() {
            return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        }

        function render() {
            const list = document.getElementById('profiles-list');

            if (profiles.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No profiles configured.</p><p>Click "Add New Profile" to get started.</p></div>';
                return;
            }

            list.innerHTML = profiles.map(p => renderCard(p)).join('');
            bindCardEvents();
        }

        function renderCard(p) {
            const isActive = p.id === activeProfileId;
            const isExpanded = expandedId === p.id;

            return \`
                <div class="profile-card \${isActive ? 'active' : ''} \${isExpanded ? 'expanded' : ''}" data-id="\${esc(p.id)}">
                    <div class="profile-card-header" data-toggle="\${esc(p.id)}">
                        <span class="profile-name">\${esc(p.name) || 'Unnamed Profile'}</span>
                        \${isActive ? '<span class="active-badge">Active</span>' : ''}
                        <span style="font-size:0.85em;color:var(--vscode-descriptionForeground)">\${esc(p.provider)} / \${esc(p.model)}</span>
                    </div>
                    <div class="profile-card-body">
                        <div class="form-grid">
                            <vscode-form-group variant="settings-group">
                                <vscode-label>Profile ID</vscode-label>
                                <vscode-textfield field data-field="id" value="\${esc(p.id)}"></vscode-textfield>
                                <div class="field-hint">Unique identifier. Changing this and saving renames the profile.</div>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group">
                                <vscode-label>Display Name</vscode-label>
                                <vscode-textfield field data-field="name" value="\${esc(p.name)}"></vscode-textfield>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group" class="full-width">
                                <vscode-label>Endpoint URL</vscode-label>
                                <vscode-textfield field data-field="endpoint" value="\${esc(p.endpoint)}"></vscode-textfield>
                                <div class="field-hint">Full URL to the chat completions endpoint.</div>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group">
                                <vscode-label>Provider</vscode-label>
                                <vscode-textfield field data-field="provider" value="\${esc(p.provider)}"></vscode-textfield>
                                <div class="field-hint">Provider name (used for env var lookup: &lt;PROVIDER&gt;_API_KEY).</div>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group">
                                <vscode-label>API Type</vscode-label>
                                <vscode-single-select field data-field="apiType">
                                    <vscode-option value="openai" \${p.apiType === 'openai' ? 'selected' : ''}>openai</vscode-option>
                                    <vscode-option value="anthropic" \${p.apiType === 'anthropic' ? 'selected' : ''}>anthropic</vscode-option>
                                    <vscode-option value="ollama" \${p.apiType === 'ollama' ? 'selected' : ''}>ollama</vscode-option>
                                    <vscode-option value="custom" \${p.apiType === 'custom' ? 'selected' : ''}>custom</vscode-option>
                                </vscode-single-select>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group">
                                <vscode-label>Model</vscode-label>
                                <vscode-textfield field data-field="model" value="\${esc(p.model)}"></vscode-textfield>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group">
                                <vscode-label>Max Tokens</vscode-label>
                                <vscode-textfield field data-field="maxTokens" value="\${p.maxTokens ?? 500}"></vscode-textfield>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group">
                                <vscode-label>Temperature</vscode-label>
                                <vscode-textfield field data-field="temperature" value="\${p.temperature ?? 0.1}"></vscode-textfield>
                            </vscode-form-group>
                            <vscode-form-group variant="settings-group" class="full-width">
                                <vscode-label>Custom Body (optional JSON)</vscode-label>
                                <vscode-textarea field data-field="customBody" rows="3">\${escTA(p.customBody)}</vscode-textarea>
                            </vscode-form-group>
                        </div>
                        <div class="profile-actions">
                            <vscode-button data-action="save" data-original-id="\${esc(p.id)}">Save</vscode-button>
                            <span class="save-toast" id="toast-\${esc(p.id)}"></span>
                            <vscode-button data-action="duplicate" data-original-id="\${esc(p.id)}" secondary>Duplicate</vscode-button>
                            \${!isActive ? '<vscode-button data-action="setActive" data-original-id="' + esc(p.id) + '" secondary>Set Active</vscode-button>' : ''}
                            <vscode-button data-action="delete" data-original-id="\${esc(p.id)}" variant="secondary" style="margin-left:auto">Delete</vscode-button>
                        </div>
                    </div>
                </div>
            \`;
        }

        function bindCardEvents() {
            document.querySelectorAll('[data-toggle]').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.getAttribute('data-toggle');
                    expandedId = expandedId === id ? null : id;
                    render();
                });
            });

            document.querySelectorAll('[data-action]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = el.getAttribute('data-action');
                    const originalId = el.getAttribute('data-original-id');

                    if (action === 'save') { saveProfile(originalId); }
                    else if (action === 'duplicate') { vscode.postMessage({ type: 'duplicate', id: originalId }); }
                    else if (action === 'delete') { vscode.postMessage({ type: 'delete', id: originalId }); }
                    else if (action === 'setActive') { vscode.postMessage({ type: 'setActive', id: originalId }); }
                });
            });
        }

        function getFormData(cardEl) {
            const data = {};
            cardEl.querySelectorAll('[data-field]').forEach(el => {
                const field = el.getAttribute('data-field');
                let val = el.value;
                if (field === 'maxTokens') { val = parseInt(val, 10) || 500; }
                else if (field === 'temperature') { val = parseFloat(val) || 0.1; }
                data[field] = val;
            });
            return data;
        }

        function saveProfile(originalId) {
            const card = document.querySelector(\`.profile-card[data-id="\${CSS.escape(originalId)}"]\`);
            if (!card) { return; }
            const data = getFormData(card);
            vscode.postMessage({ type: 'save', originalId, profile: data });
        }

        document.getElementById('btn-add').addEventListener('click', () => {
            const newProfile = {
                id: generateId(),
                name: 'New Profile',
                endpoint: 'https://',
                provider: 'custom',
                apiType: 'openai',
                model: '',
                maxTokens: 500,
                temperature: 0.1,
            };
            vscode.postMessage({ type: 'save', profile: newProfile });
            expandedId = newProfile.id;
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'refresh') {
                profiles = msg.profiles;
                activeProfileId = msg.activeProfileId;
                if (expandedId && !profiles.find(p => p.id === expandedId)) {
                    expandedId = null;
                }
                render();
            }
        });

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }

    private dispose() {
        ProfileManager.currentPanel = undefined;
        this.panel.dispose();
        for (const d of this.disposables) { d.dispose(); }
    }
}
