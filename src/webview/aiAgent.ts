/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * AI Agent Webview Provider
 * Chat interface for AI-powered code generation
 * Appears in secondary sidebar (right side)
 */

import * as vscode from 'vscode';
import { AIBridge, AIMessage, AIGenerateResult } from '../ai/aiBridge';
import { parseScriptOsConfig, generateScriptOsCode } from '../scriptos/parser';
import { ScriptOFile } from '../scriptos/scanner';
import { ScriptOConfigWebviewProvider } from './scriptoConfig';

export class AIAgentWebviewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private extensionUri: vscode.Uri;
	private aiBridge: AIBridge;
	private scriptoConfigProvider: ScriptOConfigWebviewProvider;
	private messages: Array<{ role: string; content: string; code?: string }> = [];
	private isGenerating: boolean = false;

	constructor(extensionUri: vscode.Uri, scriptoConfigProvider: ScriptOConfigWebviewProvider) {
		this.extensionUri = extensionUri;
		this.scriptoConfigProvider = scriptoConfigProvider;
		this.aiBridge = new AIBridge();
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		token: vscode.CancellationToken
	): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtmlForWebview();

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			await this.handleMessage(message);
		});

		// Check API key status and send to webview
		const config = vscode.workspace.getConfiguration('micropython.ai');
		const apiKey = config.get<string>('apiKey', '');
		webviewView.webview.postMessage({
			type: 'apiKeyStatus',
			hasApiKey: !!apiKey
		});

		// Send current messages to webview when it becomes visible
		if (this.messages.length > 0) {
			webviewView.webview.postMessage({
				type: 'updateMessages',
				messages: this.messages
			});
		}
	}

	async show(): Promise<void> {
		if (this.view) {
			this.view.show?.(true);
		}
		// Try to reveal the view container - VS Code generates this command automatically
		try {
			await vscode.commands.executeCommand('workbench.view.extension.scripto-studio-pro-ai');
		} catch (e) {
			// Fallback: try the view focus command
			try {
				await vscode.commands.executeCommand('micropythonAIAgent.focus');
			} catch (e2) {
				console.error('Failed to show AI Agent view:', e2);
			}
		}
	}

	private async handleMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'sendMessage':
				await this.sendMessage(message.content);
				break;
			case 'insertCode':
				await this.insertCode(message.code);
				break;
			case 'saveScriptO':
				await this.saveScriptO(message.code);
				break;
		case 'clearMessages':
			this.messages = [];
			this.updateWebviewMessages();
			break;
		}
	}

	private async sendMessage(content: string): Promise<void> {
		if (!content.trim() || this.isGenerating) {
			return;
		}

		// Add user message
		this.messages.push({ role: 'user', content: content });
		this.updateWebviewMessages();

		// Set generating state
		this.isGenerating = true;
		this.view?.webview.postMessage({ type: 'setGenerating', generating: true });

		try {
			// Get AI settings
			const config = vscode.workspace.getConfiguration('micropython.ai');
			const settings = {
				provider: config.get<string>('provider', 'openai'),
				apiKey: config.get<string>('apiKey', ''),
				model: config.get<string>('model', 'gpt-4o'),
				endpoint: config.get<string>('endpoint', ''),
				systemPrompt: config.get<string>('systemPrompt', '')
			};

			if (!settings.apiKey) {
				throw new Error('Please configure your API key in System > AI Agent settings');
			}

			// Convert messages to AI format
			const aiMessages: AIMessage[] = this.messages.map((msg) => ({
				role: msg.role as any,
				content: msg.content
			}));

			// Generate response
			const result: AIGenerateResult = await this.aiBridge.generateCode(
				content,
				aiMessages,
				settings
			);

			// Check if this is a ScriptO (has config parameters)
			const isScriptO = result.code && parseScriptOsConfig(result.code || '') !== null;

			// Add assistant message
			// If it's a ScriptO, suppress the raw content and only show the code block
			this.messages.push({
				role: 'assistant',
				content: isScriptO ? 'Generated ScriptO code:' : result.content,
				code: result.code || undefined
			});

			this.updateWebviewMessages();
		} catch (error: any) {
			// Add error message
			this.messages.push({
				role: 'assistant',
				content: `Error: ${error.message || 'Failed to generate code'}`
			});
			this.updateWebviewMessages();
		} finally {
			this.isGenerating = false;
			this.view?.webview.postMessage({ type: 'setGenerating', generating: false });
		}
	}

	private updateWebviewMessages(): void {
		this.view?.webview.postMessage({
			type: 'updateMessages',
			messages: this.messages
		});
	}

	private async insertCode(code: string): Promise<void> {
		// Check if this is a ScriptO (has config parameters)
		const config = parseScriptOsConfig(code);
		
		if (config) {
			// It's a ScriptO - open the config UI
			const scripto: ScriptOFile = {
				filename: config.info?.name || 'Generated ScriptO',
				fullPath: '',
				content: code,
				config: config
			};

			try {
				// Show config UI and get user args
				const userArgs = await this.scriptoConfigProvider.showConfig(scripto);
				
				// Generate code with user args
				const generatedCode = generateScriptOsCode(code, config, userArgs);
				
				// Check if ScriptO should run silently
				const shouldAddSilentFlag = config.silent === true;
				const finalCode = shouldAddSilentFlag ? `# SCRIPTOS_SILENT: True\n${generatedCode}` : generatedCode;
				
				// Create new untitled document with the generated code
				const doc = await vscode.workspace.openTextDocument({
					language: 'python',
					content: finalCode
				});
				await vscode.window.showTextDocument(doc);
				
				vscode.window.showInformationMessage(`ScriptO "${scripto.config.info?.name || 'generated'}" configured and ready`);
			} catch (error: any) {
				if (error.message !== 'Configuration cancelled') {
					vscode.window.showErrorMessage(`Failed to configure ScriptO: ${error.message}`);
				}
			}
		} else {
			// Not a ScriptO - insert directly into editor
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor');
				return;
			}

			await editor.edit((editBuilder) => {
				editBuilder.insert(editor.selection.active, code);
			});

			vscode.window.showInformationMessage('Code inserted');
		}
	}

	private async saveScriptO(code: string): Promise<void> {
		// Create new untitled document with the code
		const doc = await vscode.workspace.openTextDocument({
			language: 'python',
			content: code
		});

		await vscode.window.showTextDocument(doc);
		vscode.window.showInformationMessage('ScriptO created. Save it to add to your collection.');
	}


	private getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>AI Agent</title>
	<style>
		* {
			box-sizing: border-box;
		}
		
		body {
			margin: 0;
			padding: 0;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			height: 100vh;
			display: flex;
			flex-direction: column;
		}
		
		/* Header */
		.ai-header {
			padding: 12px 16px;
			border-bottom: 1px solid var(--vscode-panel-border);
			display: flex;
			justify-content: space-between;
			align-items: center;
			background: var(--vscode-sideBar-background);
		}
		
		.ai-header-title {
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: 14px;
			font-weight: 600;
		}
		
		.ai-header-actions {
			display: flex;
			gap: 8px;
		}
		
		.header-btn {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 4px 8px;
			border-radius: 2px;
			font-size: 12px;
		}
		
		.header-btn:hover {
			background: var(--vscode-toolbar-hoverBackground);
		}
		
		/* Messages Container */
		.messages-container {
			flex: 1;
			overflow-y: auto;
			padding: 16px;
			width: 100%;
			box-sizing: border-box;
		}
		
		.welcome-screen {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			text-align: center;
			color: var(--vscode-descriptionForeground);
		}
		
		.welcome-screen svg {
			opacity: 0.6;
			margin-bottom: 20px;
		}
		
		.welcome-screen h3 {
			margin: 0 0 12px 0;
			color: var(--vscode-foreground);
			font-size: 18px;
		}
		
		.welcome-screen p {
			margin: 0 0 20px 0;
			font-size: 14px;
			line-height: 1.5;
		}
		
		.welcome-examples {
			text-align: left;
			background: var(--vscode-input-background);
			padding: 16px;
			border-radius: 4px;
			border: 1px solid var(--vscode-input-border);
			max-width: 400px;
		}
		
		.welcome-examples strong {
			display: block;
			margin-bottom: 8px;
			color: var(--vscode-foreground);
		}
		
		.welcome-examples ul {
			margin: 0;
			padding-left: 20px;
		}
		
		.welcome-examples li {
			margin: 6px 0;
			font-size: 13px;
		}
		
		.setup-warning {
			margin-top: 20px;
			padding: 12px;
			background: rgba(255, 193, 7, 0.15);
			border: 1px solid rgba(255, 193, 7, 0.3);
			border-radius: 4px;
			color: #FFC107;
			font-size: 13px;
			max-width: 400px;
		}
		
		/* Message */
		.message {
			margin-bottom: 20px;
			display: flex;
			gap: 12px;
			width: 100%;
			box-sizing: border-box;
		}
		
		.message-avatar {
			width: 32px;
			height: 32px;
			border-radius: 16px;
			background: var(--vscode-button-background);
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}
		
		.message-avatar svg {
			width: 18px;
			height: 18px;
		}
		
		.message.user .message-avatar {
			background: var(--vscode-button-secondaryBackground);
		}
		
		.message-content {
			flex: 1 1 auto;
			min-width: 0;
			width: 100%;
			max-width: none;
			box-sizing: border-box;
			overflow: hidden;
		}
		
		.message.code-only .message-content {
			flex: 1 1 100%;
			width: 100%;
		}
		
		.message-text {
			font-size: 13px;
			line-height: 1.6;
			white-space: pre-wrap;
			word-wrap: break-word;
			width: 100%;
			max-width: none;
		}
		
		.code-block {
			margin: 12px 0;
			background: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			overflow: hidden;
			width: 100%;
			max-width: none;
			min-width: 0;
		}
		
		.code-content {
			padding: 12px;
			font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
			font-size: 12px;
			line-height: 1.5;
			overflow-x: auto;
			width: 100%;
			max-width: none;
			min-width: 0;
			box-sizing: border-box;
		}
		
		.code-content pre {
			margin: 0;
			padding: 0;
			width: 100%;
			max-width: none;
			min-width: 0;
			white-space: pre-wrap;
			word-wrap: break-word;
			overflow-wrap: break-word;
		}
		
		.code-actions {
			display: flex;
			gap: 6px;
			padding: 8px 12px;
			background: var(--vscode-sideBar-background);
			border-top: 1px solid var(--vscode-panel-border);
			justify-content: flex-end;
		}
		
		.code-btn {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 4px 10px;
			border-radius: 2px;
			cursor: pointer;
			font-size: 11px;
		}
		
		.code-btn:hover {
			background: var(--vscode-button-hoverBackground);
		}
		
		/* Typing Indicator */
		.typing-indicator {
			display: flex;
			gap: 4px;
			padding: 8px 0;
		}
		
		.typing-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--vscode-progressBar-background);
			animation: typing 1.4s infinite;
		}
		
		.typing-dot:nth-child(2) {
			animation-delay: 0.2s;
		}
		
		.typing-dot:nth-child(3) {
			animation-delay: 0.4s;
		}
		
		@keyframes typing {
			0%, 60%, 100% {
				opacity: 0.3;
			}
			30% {
				opacity: 1;
			}
		}
		
		/* Input Area */
		.input-container {
			border-top: 1px solid var(--vscode-panel-border);
			padding: 12px 16px;
			background: var(--vscode-sideBar-background);
		}
		
		.input-wrapper {
			display: flex;
			gap: 8px;
			align-items: flex-end;
		}
		
		.input-field {
			flex: 1;
			min-height: 60px;
			max-height: 200px;
			padding: 10px 12px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			font-size: 13px;
			font-family: inherit;
			resize: vertical;
		}
		
		.input-field:focus {
			outline: 1px solid var(--vscode-focusBorder);
			border-color: var(--vscode-focusBorder);
		}
		
		.input-field:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		.send-btn {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 10px 16px;
			border-radius: 4px;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		
		.send-btn:hover:not(:disabled) {
			background: var(--vscode-button-hoverBackground);
		}
		
		.send-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		.send-btn svg {
			width: 20px;
			height: 20px;
		}
		
		.hidden {
			display: none;
		}
	</style>
</head>
<body>
	<div class="ai-header">
		<div class="ai-header-title">
			<svg width="20" height="20" viewBox="0 0 50 50" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.2">
				<rect x="8" y="13" width="35" height="32" rx="3.5" ry="3.5"/>
				<line x1="25" y1="6" x2="25" y2="13"/>
				<circle cx="25" cy="4" r="2.5"/>
				<circle cx="16" cy="25" r="3.5"/>
				<circle cx="34" cy="25" r="3.5"/>
				<line x1="15" y1="36" x2="35" y2="36"/>
				<line x1="17" y1="40" x2="33" y2="40"/>
				<line x1="8" y1="25" x2="4" y2="25"/>
				<line x1="43" y1="25" x2="46" y2="25"/>
			</svg>
			<span>AI Agent</span>
		</div>
		<div class="ai-header-actions">
			<button class="header-btn" id="clear-btn" title="Clear conversation">Clear</button>
		</div>
	</div>

	<div class="messages-container" id="messages">
		<div class="welcome-screen" id="welcome">
			<svg width="64" height="64" viewBox="0 0 50 50" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5">
				<rect x="8" y="13" width="35" height="32" rx="3.5" ry="3.5"/>
				<line x1="25" y1="6" x2="25" y2="13"/>
				<circle cx="25" cy="4" r="2.5"/>
				<circle cx="16" cy="25" r="3.5"/>
				<circle cx="34" cy="25" r="3.5"/>
				<line x1="15" y1="36" x2="35" y2="36"/>
				<line x1="17" y1="40" x2="33" y2="40"/>
				<line x1="8" y1="25" x2="4" y2="25"/>
				<line x1="43" y1="25" x2="46" y2="25"/>
			</svg>
			<h3>Hello ScriptO!</h3>
			<p>Generate MicroPython ScriptO code using natural language.</p>
			<div class="welcome-examples">
				<strong>Try asking:</strong>
				<ul>
					<li>"Flash a NeoPixel LED at 1Hz"</li>
					<li>"Read an analog sensor on GPIO 34"</li>
					<li>"Control a servo motor on GPIO 12"</li>
					<li>"Set up I2C communication"</li>
				</ul>
			</div>
			<div class="setup-warning" id="setup-warning">
				<p>⚠️ Please configure your API key in <strong>System > AI Agent</strong> to get started.</p>
			</div>
		</div>
	</div>

	<div class="input-container">
		<div class="input-wrapper">
			<textarea 
				id="input-field" 
				class="input-field" 
				placeholder="Describe what you want to build..."
				rows="3"
			></textarea>
			<button id="send-btn" class="send-btn" title="Send message (Ctrl+Enter)">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="22" y1="2" x2="11" y2="13"/>
					<polygon points="22 2 15 22 11 13 2 9 22 2"/>
				</svg>
			</button>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const messagesContainer = document.getElementById('messages');
		const welcomeScreen = document.getElementById('welcome');
		const setupWarning = document.getElementById('setup-warning');
		const inputField = document.getElementById('input-field');
		const sendBtn = document.getElementById('send-btn');
		const clearBtn = document.getElementById('clear-btn');
		
		let messages = [];
		let isGenerating = false;
		
		// Handle API key status updates
		window.addEventListener('message', event => {
			const message = event.data;
			if (message.type === 'apiKeyStatus') {
				if (message.hasApiKey && setupWarning) {
					setupWarning.classList.add('hidden');
				} else if (!message.hasApiKey && setupWarning) {
					setupWarning.classList.remove('hidden');
				}
			}
		});
		
		// Send message
		sendBtn.addEventListener('click', sendMessage);
		inputField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				sendMessage();
			}
		});
		
		function sendMessage() {
			const content = inputField.value.trim();
			if (!content || isGenerating) return;
			
			vscode.postMessage({
				type: 'sendMessage',
				content: content
			});
			
			inputField.value = '';
			inputField.style.height = 'auto';
		}
		
		// Clear conversation
		clearBtn.addEventListener('click', () => {
			if (confirm('Clear conversation history?')) {
				vscode.postMessage({ type: 'clearMessages' });
			}
		});
		
		// Auto-resize textarea
		inputField.addEventListener('input', () => {
			inputField.style.height = 'auto';
			inputField.style.height = inputField.scrollHeight + 'px';
		});
		
		// Render messages
		function renderMessages(msgs) {
			messages = msgs;
			
			if (messages.length === 0) {
				welcomeScreen.classList.remove('hidden');
				return;
			}
			
			welcomeScreen.classList.add('hidden');
			
			let html = messages.map((msg, index) => {
				const isUser = msg.role === 'user';
				const avatar = isUser 
					? \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>\`
					: \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>\`;
				
				// Check if this is a ScriptO (has code block)
				const isScriptO = msg.code && msg.content === 'Generated ScriptO code:';
				
				let contentHtml = '';
				// Only show text content if it's not a ScriptO (ScriptOs only show the code block)
				if (!isScriptO) {
					contentHtml = \`<div class="message-text">\${escapeHtml(msg.content)}</div>\`;
				}
				
				// Add code block if present
				if (msg.code) {
					contentHtml += \`
						<div class="code-block">
							<div class="code-content"><pre>\${escapeHtml(msg.code)}</pre></div>
							<div class="code-actions">
								<button class="code-btn" onclick="insertCode(\${index})">Configure</button>
								<button class="code-btn" onclick="saveScriptO(\${index})">Save as ScriptO</button>
							</div>
						</div>
					\`;
				}
				
				// Hide avatar for code-only messages (ScriptOs)
				const avatarHtml = isScriptO ? '' : \`<div class="message-avatar">\${avatar}</div>\`;
				
				return \`
					<div class="message \${isUser ? 'user' : 'assistant'} \${isScriptO ? 'code-only' : ''}">
						\${avatarHtml}
						<div class="message-content">
							\${contentHtml}
						</div>
					</div>
				\`;
			}).join('');
			
			// Add typing indicator if generating
			if (isGenerating) {
				html += \`
					<div class="message assistant">
						<div class="message-avatar">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>
						</div>
						<div class="message-content">
							<div class="typing-indicator">
								<div class="typing-dot"></div>
								<div class="typing-dot"></div>
								<div class="typing-dot"></div>
							</div>
						</div>
					</div>
				\`;
			}
			
			messagesContainer.innerHTML = html;
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
		
		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}
		
		function insertCode(index) {
			if (messages[index] && messages[index].code) {
				vscode.postMessage({
					type: 'insertCode',
					code: messages[index].code
				});
			}
		}
		
		function saveScriptO(index) {
			if (messages[index] && messages[index].code) {
				vscode.postMessage({
					type: 'saveScriptO',
					code: messages[index].code
				});
			}
		}
		
		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.type) {
				case 'updateMessages':
					isGenerating = false; // Clear generating state when messages update
					renderMessages(message.messages);
					break;
				case 'setGenerating':
					isGenerating = message.generating;
					inputField.disabled = isGenerating;
					sendBtn.disabled = isGenerating;
					renderMessages(messages); // Re-render to show/hide typing indicator
					break;
				case 'apiKeyStatus':
					if (message.hasApiKey && setupWarning) {
						setupWarning.classList.add('hidden');
					} else if (!message.hasApiKey && setupWarning) {
						setupWarning.classList.remove('hidden');
					}
					break;
			}
		});
		
		// Initial render
		renderMessages([]);
	</script>
</body>
</html>
`;
	}
}

