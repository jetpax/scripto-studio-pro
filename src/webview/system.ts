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
 * System Webview Provider
 * Displays system information and settings with sidebar navigation
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from '../webrepl/connection';
import { AIBridge } from '../ai/aiBridge';

export class SystemWebviewProvider {
	private panel?: vscode.WebviewPanel;
	private connection: WebREPLConnection;
	private extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri, connection: WebREPLConnection) {
		this.extensionUri = extensionUri;
		this.connection = connection;
	}

	showSystem(): void {
		if (!this.panel) {
			// Create new panel
			this.panel = vscode.window.createWebviewPanel(
				'micropythonSystem',
				'System',
				vscode.ViewColumn.Active,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});

			// Handle messages from the webview
			this.panel.webview.onDidReceiveMessage(async (message) => {
				await this.handleMessage(message);
			});
		} else {
			// Show existing panel
			this.panel.reveal(vscode.ViewColumn.Active);
		}

		this.panel.webview.html = this.getHtmlForWebview();
	}

	private async handleMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'refreshSystemInfo':
				await this.refreshSystemInfo();
				break;
			case 'refreshNetworks':
				await this.refreshNetworks();
				break;
			case 'ready':
				// Webview is ready, send connection status and AI settings
				this.sendConnectionStatus();
				await this.sendAISettings();
				break;
			case 'aiSettingChange':
				await this.saveAISetting(message.setting, message.value);
				break;
			case 'testAIConnection':
				await this.testAIConnection(message.settings);
				break;
			case 'log':
				// Forward logs from webview to extension host console
				const level = message.level || 'log';
				const logMessage = '[System Webview] ' + message.message;
				if (level === 'error') {
					console.error(logMessage);
				} else if (level === 'warn') {
					console.warn(logMessage);
				} else {
					console.log(logMessage);
				}
				break;
		}
	}

	private async refreshSystemInfo(): Promise<void> {
		if (!this.connection.isConnected()) {
			this.panel?.webview.postMessage({
				type: 'systemInfoError',
				error: 'Not connected to device'
			});
			return;
		}

		try {
			// Execute getSysInfo() on device
			const result = await this.connection.execRaw('getSysInfo()', true);
			
			// Parse the JSON response
			const data = JSON.parse(result.trim());
			
			this.panel?.webview.postMessage({
				type: 'systemInfoData',
				data: data.ARG || data
			});
		} catch (error: any) {
			console.error('[System] Error loading system info:', error);
			this.panel?.webview.postMessage({
				type: 'systemInfoError',
				error: error.message || 'Failed to load system information'
			});
		}
	}

	private async refreshNetworks(): Promise<void> {
		if (!this.connection.isConnected()) {
			this.panel?.webview.postMessage({
				type: 'networksError',
				error: 'Not connected to device'
			});
			return;
		}

		try {
			// Execute getNetworksInfo() on device
			const result = await this.connection.execRaw('getNetworksInfo()', true);
			
			// Parse the JSON response
			const data = JSON.parse(result.trim());
			
			this.panel?.webview.postMessage({
				type: 'networksData',
				data: data.ARG || data
			});
		} catch (error: any) {
			console.error('[System] Error loading networks info:', error);
			this.panel?.webview.postMessage({
				type: 'networksError',
				error: error.message || 'Failed to load network information'
			});
		}
	}

	private sendConnectionStatus(): void {
		this.panel?.webview.postMessage({
			type: 'connectionStatus',
			connected: this.connection.isConnected()
		});
	}

	private async sendAISettings(): Promise<void> {
		const config = vscode.workspace.getConfiguration('micropython.ai');
		const settings = {
			provider: config.get<string>('provider', 'openai'),
			apiKey: config.get<string>('apiKey', ''),
			model: config.get<string>('model', 'gpt-4o'),
			endpoint: config.get<string>('endpoint', ''),
			systemPrompt: config.get<string>('systemPrompt', '')
		};

		this.panel?.webview.postMessage({
			type: 'aiSettings',
			settings: settings
		});
	}

	private async saveAISetting(setting: string, value: string): Promise<void> {
		const config = vscode.workspace.getConfiguration('micropython.ai');
		await config.update(setting, value, vscode.ConfigurationTarget.Global);
	}

	private async testAIConnection(settings: any): Promise<void> {
		try {
			const aiBridge = new AIBridge();
			await aiBridge.testConnection(settings);
			
			this.panel?.webview.postMessage({
				type: 'aiConnectionTest',
				success: true,
				message: 'Connection successful! Ready to generate code.'
			});
		} catch (error: any) {
			this.panel?.webview.postMessage({
				type: 'aiConnectionTest',
				success: false,
				message: error.message || 'Connection test failed'
			});
		}
	}

	close(): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = undefined;
		}
	}

	private getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>System</title>
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
			overflow: hidden;
		}
		
		.container {
			display: flex;
			height: 100vh;
		}
		
		/* Sidebar Navigation */
		.sidebar {
			width: 220px;
			background: var(--vscode-sideBar-background);
			border-right: 1px solid var(--vscode-sideBar-border);
			display: flex;
			flex-direction: column;
			padding: 8px 0;
		}
		
		.sidebar-item {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 8px 16px;
			cursor: pointer;
			transition: background 0.1s;
			color: var(--vscode-foreground);
			font-size: 13px;
		}
		
		.sidebar-item:hover {
			background: var(--vscode-list-hoverBackground);
		}
		
		.sidebar-item.active {
			background: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}
		
		.sidebar-item svg {
			width: 20px;
			height: 20px;
			opacity: 0.8;
		}
		
		/* Main Content */
		.main-content {
			flex: 1;
			overflow-y: auto;
			padding: 24px;
		}
		
		.panel-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 24px;
			padding-bottom: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		
		.panel-header h1 {
			margin: 0;
			font-size: 20px;
			font-weight: 600;
		}
		
		.refresh-button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 14px;
			border-radius: 2px;
			cursor: pointer;
			font-size: 13px;
		}
		
		.refresh-button:hover {
			background: var(--vscode-button-hoverBackground);
		}
		
		.refresh-button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		/* Panel Sections */
		.panel-section {
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 4px;
			padding: 16px;
			margin-bottom: 16px;
		}
		
		.panel-section-title {
			margin: 0 0 12px 0;
			font-size: 14px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}
		
		.section-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 12px;
		}
		
		.status-badge {
			padding: 2px 8px;
			border-radius: 3px;
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
		}
		
		.status-active {
			background: rgba(76, 175, 80, 0.2);
			color: #4CAF50;
		}
		
		.status-inactive {
			background: rgba(158, 158, 158, 0.2);
			color: #9E9E9E;
		}
		
		/* Info Grid */
		.info-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
			gap: 12px;
		}
		
		.info-item {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		
		.info-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		
		.info-value {
			font-size: 13px;
			color: var(--vscode-foreground);
		}
		
		.info-mono {
			font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
		}
		
		.status-yes {
			color: #4CAF50;
		}
		
		.status-no {
			color: #F44336;
		}
		
		/* GPIO Grid */
		.gpio-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
			gap: 8px;
		}
		
		.gpio-item {
			display: flex;
			flex-direction: column;
			align-items: center;
			padding: 8px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 3px;
		}
		
		.gpio-pin {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 4px;
		}
		
		.gpio-state {
			font-size: 11px;
			font-weight: 600;
			padding: 2px 6px;
			border-radius: 2px;
		}
		
		.state-high {
			background: rgba(76, 175, 80, 0.2);
			color: #4CAF50;
		}
		
		.state-low {
			background: rgba(158, 158, 158, 0.2);
			color: #9E9E9E;
		}
		
		/* Partitions Table */
		.partitions-table {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		
		.partition-header, .partition-row {
			display: grid;
			grid-template-columns: 2fr 1fr 1fr 1fr;
			gap: 12px;
			padding: 8px;
			font-size: 12px;
		}
		
		.partition-header {
			font-weight: 600;
			color: var(--vscode-descriptionForeground);
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		
		.partition-row {
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 3px;
		}
		
		.partition-name {
			font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
		}
		
		/* Loading & Error States */
		.panel-loading, .panel-error {
			padding: 40px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
		}
		
		.panel-error {
			color: var(--vscode-errorForeground);
		}
		
		.loading-spinner {
			display: inline-block;
			width: 24px;
			height: 24px;
			border: 3px solid var(--vscode-panel-border);
			border-top-color: var(--vscode-progressBar-background);
			border-radius: 50%;
			animation: spin 1s linear infinite;
			margin-bottom: 12px;
		}
		
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
		
		/* Placeholder Content */
		.placeholder-content {
			text-align: center;
			padding: 40px 20px;
			color: var(--vscode-descriptionForeground);
		}
		
		.placeholder-content svg {
			opacity: 0.4;
			margin-bottom: 16px;
		}
		
		.placeholder-content h3 {
			margin: 0 0 8px 0;
			font-size: 16px;
			color: var(--vscode-foreground);
		}
		
		.placeholder-content p {
			margin: 0 0 16px 0;
			font-size: 13px;
			line-height: 1.5;
		}
		
		.feature-list {
			text-align: left;
			display: inline-block;
			margin: 16px 0;
		}
		
		.feature-list li {
			font-size: 13px;
			margin: 8px 0;
		}
		
		.warning-section {
			border-color: var(--vscode-inputValidation-warningBorder);
			background: var(--vscode-inputValidation-warningBackground);
		}
		
		.info-description {
			font-size: 13px;
			line-height: 1.5;
			margin: 8px 0 0 0;
		}
		
	.hidden {
		display: none;
	}
	
	/* AI Agent Styles */
	.ai-select, .ai-input, .ai-textarea {
		width: 100%;
		padding: 8px 12px;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border: 1px solid var(--vscode-input-border);
		border-radius: 2px;
		font-size: 13px;
		font-family: inherit;
		margin-top: 8px;
	}
	
	.ai-select:focus, .ai-input:focus, .ai-textarea:focus {
		outline: 1px solid var(--vscode-focusBorder);
		border-color: var(--vscode-focusBorder);
	}
	
	.ai-textarea {
		resize: vertical;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
		line-height: 1.5;
	}
	
	.ai-input-group {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	
	.ai-input-group .ai-input {
		flex: 1;
		margin-top: 0;
	}
	
	.ai-test-btn {
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
		border: none;
		padding: 8px 16px;
		border-radius: 2px;
		cursor: pointer;
		font-size: 13px;
		white-space: nowrap;
	}
	
	.ai-test-btn:hover {
		background: var(--vscode-button-hoverBackground);
	}
	
	.ai-test-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.connection-status {
		margin-top: 8px;
		padding: 8px 12px;
		border-radius: 2px;
		font-size: 12px;
	}
	
	.connection-status.success {
		background: rgba(76, 175, 80, 0.15);
		color: #4CAF50;
		border: 1px solid rgba(76, 175, 80, 0.3);
	}
	
	.connection-status.error {
		background: rgba(244, 67, 54, 0.15);
		color: #F44336;
		border: 1px solid rgba(244, 67, 54, 0.3);
	}
	
	.connection-status.testing {
		background: rgba(255, 193, 7, 0.15);
		color: #FFC107;
		border: 1px solid rgba(255, 193, 7, 0.3);
	}
</style>
</head>
<body>
	<div class="container">
		<!-- Sidebar Navigation -->
		<div class="sidebar">
			<div class="sidebar-item active" data-section="sysinfo">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="16" x2="12" y2="12"/>
					<line x1="12" y1="8" x2="12.01" y2="8"/>
				</svg>
				<span>System Info</span>
			</div>
			<div class="sidebar-item" data-section="networks">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M5 12.55a11 11 0 0 1 14.08 0"/>
					<path d="M1.42 9a16 16 0 0 1 21.16 0"/>
					<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
					<line x1="12" y1="20" x2="12.01" y2="20"/>
				</svg>
				<span>Networks</span>
			</div>
			<div class="sidebar-item" data-section="sdcard">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
					<line x1="8" y1="6" x2="8" y2="10"/>
					<line x1="12" y1="6" x2="12" y2="10"/>
					<line x1="16" y1="6" x2="16" y2="10"/>
				</svg>
				<span>SD Card</span>
			</div>
			<div class="sidebar-item" data-section="firmware">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="7 10 12 15 17 10"/>
					<line x1="12" y1="15" x2="12" y2="3"/>
				</svg>
				<span>Firmware</span>
			</div>
			<div class="sidebar-item" data-section="ai-agent">
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
		</div>
		
		<!-- Main Content -->
		<div class="main-content">
			<!-- System Info Panel -->
			<div id="sysinfo-panel" class="panel">
				<div class="panel-header">
					<h1>System Information</h1>
					<button class="refresh-button" id="refresh-sysinfo">Refresh</button>
				</div>
				<div id="sysinfo-content"></div>
			</div>
			
			<!-- Networks Panel -->
			<div id="networks-panel" class="panel hidden">
				<div class="panel-header">
					<h1>Network Configuration</h1>
					<button class="refresh-button" id="refresh-networks">Refresh</button>
				</div>
				<div id="networks-content"></div>
			</div>
			
			<!-- SD Card Panel -->
			<div id="sdcard-panel" class="panel hidden">
				<div class="panel-header">
					<h1>SD Card Management</h1>
				</div>
				<div class="panel-section">
					<div class="placeholder-content">
						<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
							<line x1="8" y1="6" x2="8" y2="10"/>
							<line x1="12" y1="6" x2="12" y2="10"/>
							<line x1="16" y1="6" x2="16" y2="10"/>
						</svg>
						<h3>SD Card Management Coming Soon</h3>
						<p>
							This section will allow you to manage your ESP32's SD card,<br>
							including initialization, mounting, unmounting, and formatting.
						</p>
					</div>
				</div>
				<div class="panel-section">
					<h3 class="panel-section-title">Planned Features</h3>
					<ul class="feature-list">
						<li>Initialize SD card hardware</li>
						<li>Mount and unmount filesystem</li>
						<li>Format SD card (FAT32)</li>
						<li>View storage capacity and usage</li>
						<li>Set default mount point</li>
					</ul>
				</div>
			</div>
			
			<!-- Firmware Panel -->
			<div id="firmware-panel" class="panel hidden">
				<div class="panel-header">
					<h1>Firmware Management</h1>
				</div>
				<div class="panel-section">
					<div class="placeholder-content">
						<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
							<polyline points="7 10 12 15 17 10"/>
							<line x1="12" y1="15" x2="12" y2="3"/>
						</svg>
						<h3>Firmware Updates Coming Soon</h3>
						<p>
							This section will allow you to update your ESP32 firmware<br>
							via Over-The-Air (OTA) updates and manage flash memory.
						</p>
					</div>
				</div>
				<div class="panel-section">
					<h3 class="panel-section-title">Planned Features</h3>
					<ul class="feature-list">
						<li>Upload firmware image (OTA)</li>
						<li>Erase flash memory</li>
						<li>View current firmware version</li>
						<li>Roll back to previous version</li>
						<li>Verify firmware integrity</li>
					</ul>
				</div>
				<div class="panel-section warning-section">
					<h3 class="panel-section-title">⚠️ Important Safety Notice</h3>
					<p class="info-description">
						Firmware updates can potentially brick your device if interrupted or
						if an incompatible image is used. Always ensure you have a backup
						and a way to recover via serial/USB connection.
					</p>
				</div>
			</div>
			
		<!-- AI Agent Panel -->
		<div id="ai-agent-panel" class="panel hidden">
			<div class="panel-header">
				<h1>AI Agent Settings</h1>
			</div>
			
			<!-- API Provider Section -->
			<div class="panel-section">
				<h3 class="panel-section-title">API Provider</h3>
				<p class="info-description">Select your AI service provider</p>
				<select id="ai-provider" class="ai-select">
					<option value="openai">OpenAI (GPT-4, GPT-3.5)</option>
					<option value="anthropic">Anthropic (Claude)</option>
					<option value="grok">Grok (x.ai)</option>
					<option value="openrouter">OpenRouter (Multi-model)</option>
					<option value="custom">Custom Endpoint</option>
				</select>
			</div>
			
			<!-- API Key Section -->
			<div class="panel-section">
				<h3 class="panel-section-title">API Key</h3>
				<p class="info-description" id="api-key-hint">Get your API key from platform.openai.com</p>
				<div class="ai-input-group">
					<input type="password" id="ai-apikey" class="ai-input" placeholder="sk-..." />
					<button class="ai-test-btn" id="test-connection">Test</button>
				</div>
				<div id="connection-status" class="connection-status hidden"></div>
			</div>
			
			<!-- Model Section -->
			<div class="panel-section">
				<h3 class="panel-section-title">Model</h3>
				<p class="info-description">Choose the AI model to use for code generation</p>
				<select id="ai-model" class="ai-select">
					<option value="gpt-4o">GPT-4o (Recommended)</option>
					<option value="gpt-4-turbo">GPT-4 Turbo</option>
					<option value="gpt-4">GPT-4</option>
					<option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
				</select>
			</div>
			
			<!-- Custom Endpoint Section (hidden by default) -->
			<div class="panel-section hidden" id="custom-endpoint-section">
				<h3 class="panel-section-title">Custom Endpoint</h3>
				<p class="info-description">Enter your custom API endpoint URL</p>
				<input type="text" id="ai-endpoint" class="ai-input" placeholder="https://api.example.com/v1/chat/completions" />
			</div>
			
			<!-- System Prompt Section -->
			<div class="panel-section">
				<h3 class="panel-section-title">System Prompt</h3>
				<p class="info-description">Customize the AI's behavior (optional)</p>
				<textarea id="ai-system-prompt" class="ai-textarea" rows="8" placeholder="Leave empty to use default MicroPython expert prompt..."></textarea>
			</div>
		</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		let isConnected = false;
		let currentSection = 'sysinfo';
		
		// Forward console logs to extension host for debugging
		const originalLog = console.log;
		const originalWarn = console.warn;
		const originalError = console.error;
		
		console.log = function(...args) {
			originalLog.apply(console, args);
			if (args[0] && typeof args[0] === 'string' && args[0].includes('[AI]')) {
				vscode.postMessage({ type: 'log', level: 'log', message: args.join(' ') });
			}
		};
		
		console.warn = function(...args) {
			originalWarn.apply(console, args);
			if (args[0] && typeof args[0] === 'string' && args[0].includes('[AI]')) {
				vscode.postMessage({ type: 'log', level: 'warn', message: args.join(' ') });
			}
		};
		
		console.error = function(...args) {
			originalError.apply(console, args);
			if (args[0] && typeof args[0] === 'string' && args[0].includes('[AI]')) {
				vscode.postMessage({ type: 'log', level: 'error', message: args.join(' ') });
			}
		};
		
		// Navigation
		document.querySelectorAll('.sidebar-item').forEach(item => {
			item.addEventListener('click', () => {
				const section = item.dataset.section;
				switchSection(section);
			});
		});
		
		function switchSection(section) {
			// Update sidebar active state
			document.querySelectorAll('.sidebar-item').forEach(item => {
				if (item.dataset.section === section) {
					item.classList.add('active');
				} else {
					item.classList.remove('active');
				}
			});
			
			// Show/hide panels
			document.querySelectorAll('.panel').forEach(panel => {
				panel.classList.add('hidden');
			});
			document.getElementById(section + '-panel').classList.remove('hidden');
			
			currentSection = section;
			
			// Auto-load data for section
			if (isConnected) {
				if (section === 'sysinfo') {
					refreshSystemInfo();
				} else if (section === 'networks') {
					refreshNetworks();
				}
			}
			
			// Fetch OpenRouter models when AI Agent panel is shown
			if (section === 'ai-agent') {
				// Send test message to extension host
				vscode.postMessage({ type: 'log', level: 'log', message: '[AI] AI Agent panel shown, checking for OpenRouter...' });
				
				// Wait a bit for the panel to be visible and elements to be ready
				// Also wait a bit longer to allow settings to be loaded if they haven't been yet
				setTimeout(() => {
					const providerEl = document.getElementById('ai-provider');
					const apiKeyEl = document.getElementById('ai-apikey');
					
					vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Elements found - provider: ' + (providerEl ? providerEl.value : 'null') + ', apiKey: ' + (apiKeyEl ? (apiKeyEl.value ? 'present' : 'empty') : 'null') });
					
					if (providerEl && apiKeyEl && providerEl.value === 'openrouter' && apiKeyEl.value) {
						vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Triggering fetch from switchSection' });
						fetchOpenRouterModels(apiKeyEl.value);
					} else {
						vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Not fetching - conditions not met. Will retry when settings are loaded.' });
						// If settings haven't loaded yet, they will trigger the fetch when loaded
						// But also set up a retry in case settings are slow to load
						setTimeout(() => {
							const retryProviderEl = document.getElementById('ai-provider');
							const retryApiKeyEl = document.getElementById('ai-apikey');
							if (retryProviderEl && retryApiKeyEl && retryProviderEl.value === 'openrouter' && retryApiKeyEl.value) {
								vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Retry: Settings now loaded, triggering fetch...' });
								fetchOpenRouterModels(retryApiKeyEl.value);
							}
						}, 1000);
					}
				}, 200);
			}
		}
		
		// Refresh buttons
		document.getElementById('refresh-sysinfo').addEventListener('click', refreshSystemInfo);
		document.getElementById('refresh-networks').addEventListener('click', refreshNetworks);
		
		function refreshSystemInfo() {
			if (!isConnected) {
				showSysInfoError('Not connected to device');
				return;
			}
			showSysInfoLoading();
			vscode.postMessage({ type: 'refreshSystemInfo' });
		}
		
		function refreshNetworks() {
			if (!isConnected) {
				showNetworksError('Not connected to device');
				return;
			}
			showNetworksLoading();
			vscode.postMessage({ type: 'refreshNetworks' });
		}
		
		function showSysInfoLoading() {
			document.getElementById('sysinfo-content').innerHTML = \`
				<div class="panel-loading">
					<div class="loading-spinner"></div>
					<p>Loading system information...</p>
				</div>
			\`;
		}
		
		function showSysInfoError(error) {
			document.getElementById('sysinfo-content').innerHTML = \`
				<div class="panel-error">
					<p>\${error}</p>
				</div>
			\`;
		}
		
		function showNetworksLoading() {
			document.getElementById('networks-content').innerHTML = \`
				<div class="panel-loading">
					<div class="loading-spinner"></div>
					<p>Loading network information...</p>
				</div>
			\`;
		}
		
		function showNetworksError(error) {
			document.getElementById('networks-content').innerHTML = \`
				<div class="panel-error">
					<p>\${error}</p>
				</div>
			\`;
		}
		
		function renderSystemInfo(info) {
			const os = info.os || {};
			
			let html = \`
				<!-- MCU Section -->
				<div class="panel-section">
					<h3 class="panel-section-title">MCU & MicroPython</h3>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Unique ID</span>
							<span class="info-value info-mono">\${info.uid || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Frequency</span>
							<span class="info-value">\${info.freq || 'N/A'} MHz</span>
						</div>
						<div class="info-item">
							<span class="info-label">Flash Size</span>
							<span class="info-value">\${formatBytes(info.flashSize)}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Platform</span>
							<span class="info-value">\${os.platform || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">System</span>
							<span class="info-value">\${os.system || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Release</span>
							<span class="info-value">\${os.release || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Version</span>
							<span class="info-value info-mono">\${os.version || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Implementation</span>
							<span class="info-value">\${os.implem || 'N/A'}</span>
						</div>
						<div class="info-item">
							<span class="info-label">SPIRAM</span>
							<span class="info-value \${os.spiram ? 'status-yes' : 'status-no'}">
								\${os.spiram ? 'Yes' : 'No'}
							</span>
						</div>
						<div class="info-item">
							<span class="info-label">MPY Version</span>
							<span class="info-value">\${os.mpyver || 'N/A'}</span>
						</div>
					</div>
				</div>
			\`;
			
			// GPIO Section
			if (info.pins && Object.keys(info.pins).length > 0) {
				const gpioEntries = Object.entries(info.pins).sort((a, b) => {
					return parseInt(a[0]) - parseInt(b[0]);
				});
				
				html += \`
					<div class="panel-section">
						<h3 class="panel-section-title">GPIO Pin States</h3>
						<div class="gpio-grid">
							\${gpioEntries.map(([pin, value]) => {
								const state = value === 1 ? 'HIGH' : 'LOW';
								const stateClass = value === 1 ? 'state-high' : 'state-low';
								return \`
									<div class="gpio-item">
										<span class="gpio-pin">GPIO\${pin}</span>
										<span class="gpio-state \${stateClass}">\${state}</span>
									</div>
								\`;
							}).join('')}
						</div>
					</div>
				\`;
			}
			
			// Partitions Section
			if (info.partitions && info.partitions.length > 0) {
				html += \`
					<div class="panel-section">
						<h3 class="panel-section-title">Flash Partitions</h3>
						<div class="partitions-table">
							<div class="partition-header">
								<span>Name</span>
								<span>Type</span>
								<span>Offset</span>
								<span>Size</span>
							</div>
							\${info.partitions.map(part => {
								let partInfo;
								if (Array.isArray(part)) {
									partInfo = {
										type: part[0],
										subtype: part[1],
										offset: part[2],
										size: part[3],
										name: part[4] || 'unknown',
										encrypted: part[5]
									};
								} else {
									partInfo = part;
								}
								
								const typeStr = partInfo.type === 0 ? 'APP' : partInfo.type === 1 ? 'DATA' : 'Type ' + partInfo.type;
								const icon = getPartitionIcon(partInfo.name);
								
								return \`
									<div class="partition-row">
										<span class="partition-name">\${icon} \${partInfo.name}</span>
										<span>\${typeStr}</span>
										<span class="info-mono">0x\${partInfo.offset.toString(16)}</span>
										<span>\${formatBytes(partInfo.size)}</span>
									</div>
								\`;
							}).join('')}
						</div>
					</div>
				\`;
			}
			
			document.getElementById('sysinfo-content').innerHTML = html;
		}
		
		function renderNetworks(networks) {
			let html = '';
			
			// WiFi STA Section
			if (networks.wifiSTA) {
				const sta = networks.wifiSTA;
				html += \`
					<div class="panel-section">
						<div class="section-header">
							<h3 class="panel-section-title">Wi-Fi Client Interface</h3>
							<div class="status-badge \${sta.active ? 'status-active' : 'status-inactive'}">
								\${sta.active ? 'Active' : 'Inactive'}
							</div>
						</div>
						<div class="info-grid">
							<div class="info-item">
								<span class="info-label">MAC Address</span>
								<span class="info-value info-mono">\${sta.mac || 'N/A'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">SSID</span>
								<span class="info-value">\${sta.ssid || 'Not connected'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">IP Address</span>
								<span class="info-value info-mono">\${sta.ip || '0.0.0.0'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Subnet Mask</span>
								<span class="info-value info-mono">\${sta.mask || '0.0.0.0'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Gateway</span>
								<span class="info-value info-mono">\${sta.gateway || '0.0.0.0'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">DNS Server</span>
								<span class="info-value info-mono">\${sta.dns || '0.0.0.0'}</span>
							</div>
							\${sta.rssi ? \`
								<div class="info-item">
									<span class="info-label">Signal Strength</span>
									<span class="info-value">\${sta.rssi} dBm</span>
								</div>
							\` : ''}
						</div>
					</div>
				\`;
			}
			
			// WiFi AP Section
			if (networks.wifiAP) {
				const ap = networks.wifiAP;
				html += \`
					<div class="panel-section">
						<div class="section-header">
							<h3 class="panel-section-title">Wi-Fi Access Point Interface</h3>
							<div class="status-badge \${ap.active ? 'status-active' : 'status-inactive'}">
								\${ap.active ? 'Active' : 'Inactive'}
							</div>
						</div>
						<div class="info-grid">
							<div class="info-item">
								<span class="info-label">MAC Address</span>
								<span class="info-value info-mono">\${ap.mac || 'N/A'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">SSID</span>
								<span class="info-value">\${ap.ssid || 'N/A'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">IP Address</span>
								<span class="info-value info-mono">\${ap.ip || '0.0.0.0'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Subnet Mask</span>
								<span class="info-value info-mono">\${ap.mask || '0.0.0.0'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Gateway</span>
								<span class="info-value info-mono">\${ap.gateway || '0.0.0.0'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">DNS Server</span>
								<span class="info-value info-mono">\${ap.dns || '0.0.0.0'}</span>
							</div>
							\${ap.clients !== undefined ? \`
								<div class="info-item">
									<span class="info-label">Connected Clients</span>
									<span class="info-value">\${ap.clients}</span>
								</div>
							\` : ''}
						</div>
					</div>
				\`;
			}
			
			// Ethernet Section
			if (networks.eth && networks.eth.available) {
				const eth = networks.eth;
				const isConnected = eth.linkup && eth.gotip;
				html += \`
					<div class="panel-section">
						<div class="section-header">
							<h3 class="panel-section-title">Ethernet PHY Interface</h3>
							<div class="status-badge \${isConnected ? 'status-active' : 'status-inactive'}">
								\${isConnected ? 'Connected' : eth.linkup ? 'Link Up' : 'Disconnected'}
							</div>
						</div>
						<div class="info-grid">
							<div class="info-item">
								<span class="info-label">MAC Address</span>
								<span class="info-value info-mono">\${eth.mac || 'N/A'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Driver</span>
								<span class="info-value">\${eth.driver || 'N/A'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Enabled</span>
								<span class="info-value \${eth.enable ? 'status-yes' : 'status-no'}">
									\${eth.enable ? 'Yes' : 'No'}
								</span>
							</div>
							<div class="info-item">
								<span class="info-label">Link Status</span>
								<span class="info-value \${eth.linkup ? 'status-yes' : 'status-no'}">
									\${eth.linkup ? 'Up' : 'Down'}
								</span>
							</div>
							\${eth.gotip ? \`
								<div class="info-item">
									<span class="info-label">IP Address</span>
									<span class="info-value info-mono">\${eth.ip || '0.0.0.0'}</span>
								</div>
								<div class="info-item">
									<span class="info-label">Subnet Mask</span>
									<span class="info-value info-mono">\${eth.mask || '0.0.0.0'}</span>
								</div>
								<div class="info-item">
									<span class="info-label">Gateway</span>
									<span class="info-value info-mono">\${eth.gateway || '0.0.0.0'}</span>
								</div>
								<div class="info-item">
									<span class="info-label">DNS Server</span>
									<span class="info-value info-mono">\${eth.dns || '0.0.0.0'}</span>
								</div>
							\` : ''}
						</div>
					</div>
				\`;
			}
			
			// Bluetooth Section
			if (networks.ble) {
				const ble = networks.ble;
				html += \`
					<div class="panel-section">
						<div class="section-header">
							<h3 class="panel-section-title">Bluetooth LE Interface</h3>
							<div class="status-badge \${ble.active ? 'status-active' : 'status-inactive'}">
								\${ble.active ? 'Active' : 'Inactive'}
							</div>
						</div>
						<div class="info-grid">
							<div class="info-item">
								<span class="info-label">MAC Address</span>
								<span class="info-value info-mono">\${ble.mac || 'N/A'}</span>
							</div>
							<div class="info-item">
								<span class="info-label">Status</span>
								<span class="info-value">\${ble.active ? 'Enabled' : 'Disabled'}</span>
							</div>
						</div>
					</div>
				\`;
			}
			
			// Internet Status Section
			if (networks.internetOK !== undefined) {
				html += \`
					<div class="panel-section">
						<div class="section-header">
							<h3 class="panel-section-title">Internet Connectivity</h3>
							<div class="status-badge \${networks.internetOK ? 'status-active' : 'status-inactive'}">
								\${networks.internetOK ? 'Reachable' : 'Not Reachable'}
							</div>
						</div>
						<p class="info-description">
							\${networks.internetOK ? 
								'Device has internet access and can reach external servers.' :
								'Device cannot reach the internet. Check network configuration and gateway settings.'}
						</p>
					</div>
				\`;
			}
			
			document.getElementById('networks-content').innerHTML = html;
		}
		
		function formatBytes(bytes) {
			if (!bytes) return 'N/A';
			if (bytes < 1024) return bytes + ' B';
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
			return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
		}
		
		function getPartitionIcon(name) {
			if (!name) return '📦';
			const lowerName = name.toLowerCase();
			if (lowerName.includes('ota')) return '🔄';
			if (lowerName.includes('nvs')) return '💾';
			if (lowerName.includes('www')) return '🌐';
			if (lowerName.includes('vfs')) return '📁';
			if (lowerName.includes('data')) return '💿';
			if (lowerName.includes('factory')) return '🏭';
			return '📦';
		}
		
		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.type) {
				case 'connectionStatus':
					isConnected = message.connected;
					// Auto-load current section if connected
					if (isConnected) {
						if (currentSection === 'sysinfo') {
							refreshSystemInfo();
						} else if (currentSection === 'networks') {
							refreshNetworks();
						}
					}
					break;
					
				case 'systemInfoData':
					renderSystemInfo(message.data);
					break;
					
				case 'systemInfoError':
					showSysInfoError(message.error);
					break;
					
				case 'networksData':
					renderNetworks(message.data);
					break;
					
				case 'networksError':
					showNetworksError(message.error);
					break;
			}
		});
		
	// AI Agent Settings
	const aiProvider = document.getElementById('ai-provider');
	const aiApiKey = document.getElementById('ai-apikey');
	const aiModel = document.getElementById('ai-model');
	const aiEndpoint = document.getElementById('ai-endpoint');
	const aiSystemPrompt = document.getElementById('ai-system-prompt');
	const testConnectionBtn = document.getElementById('test-connection');
	const connectionStatus = document.getElementById('connection-status');
	const customEndpointSection = document.getElementById('custom-endpoint-section');
	const apiKeyHint = document.getElementById('api-key-hint');
	
	// Model options for each provider (static)
	const staticModelOptions = {
		'openai': [
			{ value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
			{ value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
			{ value: 'gpt-4', label: 'GPT-4' },
			{ value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
		],
		'anthropic': [
			{ value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Recommended)' },
			{ value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
			{ value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
			{ value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
		],
		'grok': [
			{ value: 'grok-beta', label: 'Grok Beta (Recommended)' },
			{ value: 'grok-vision-beta', label: 'Grok Vision Beta' }
		],
		'custom': [
			{ value: 'custom-model', label: 'Custom Model' }
		]
	};
	
	// Dynamic OpenRouter models (fetched from API)
	let openRouterModels = [];
	let isLoadingOpenRouterModels = false;
	
	// Provider change handler
	aiProvider.addEventListener('change', (e) => {
		const provider = e.target.value;
		// Preserve current model value when switching providers
		updateModelOptions(provider, aiModel.value);
		updateApiKeyHint(provider);
		
		// Show/hide custom endpoint section
		if (provider === 'custom') {
			customEndpointSection.classList.remove('hidden');
		} else {
			customEndpointSection.classList.add('hidden');
		}
		
		// Fetch OpenRouter models if provider is OpenRouter and API key is available
		if (provider === 'openrouter' && aiApiKey.value) {
			fetchOpenRouterModels(aiApiKey.value);
		}
		
		vscode.postMessage({ 
			type: 'aiSettingChange', 
			setting: 'provider', 
			value: provider 
		});
	});
	
	// Fetch OpenRouter models dynamically
	async function fetchOpenRouterModels(apiKey) {
		vscode.postMessage({ type: 'log', level: 'log', message: '[AI] fetchOpenRouterModels called with apiKey: ' + (apiKey ? 'present' : 'missing') });
		
		if (!apiKey || isLoadingOpenRouterModels) {
			vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Skipping fetch - no apiKey or already loading' });
			return Promise.resolve();
		}
		
		const modelEl = document.getElementById('ai-model');
		if (!modelEl) {
			vscode.postMessage({ type: 'log', level: 'error', message: '[AI] Model element not found!' });
			return Promise.resolve();
		}
		
		isLoadingOpenRouterModels = true;
		modelEl.disabled = true;
		modelEl.innerHTML = '<option value="">Loading models...</option>';
		
		try {
			vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Fetching OpenRouter models from API...' });
			const response = await fetch('https://openrouter.ai/api/v1/models', {
				headers: {
					'Authorization': 'Bearer ' + apiKey
				}
			});
			
			vscode.postMessage({ type: 'log', level: 'log', message: '[AI] OpenRouter response status: ' + response.status });
			
			if (response.ok) {
				const data = await response.json();
				vscode.postMessage({ type: 'log', level: 'log', message: '[AI] OpenRouter models received: ' + (data.data?.length || 0) });
				
				// Sort models: premium first, then by name
				const models = data.data
					.filter(model => model.id && !model.id.includes('moderation'))
					.sort((a, b) => {
						// Premium models first
						if (a.pricing?.prompt && !b.pricing?.prompt) return -1;
						if (!a.pricing?.prompt && b.pricing?.prompt) return 1;
						// Then sort by name
						return a.name.localeCompare(b.name);
					})
					.map(model => ({
						value: model.id,
						label: model.name || model.id
					}));
				
				vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Processed OpenRouter models: ' + models.length });
				openRouterModels = models;
				
				// Update dropdown if provider is still OpenRouter
				const providerEl = document.getElementById('ai-provider');
				const modelEl = document.getElementById('ai-model');
				if (providerEl && providerEl.value === 'openrouter' && modelEl) {
					// Preserve current model value
					updateModelOptions('openrouter', modelEl.value);
				}
			} else {
				const errorText = await response.text();
				vscode.postMessage({ type: 'log', level: 'warn', message: '[AI] Failed to fetch OpenRouter models: ' + response.status + ' - ' + errorText });
				// Use fallback models on error
				openRouterModels = [
					{ value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
					{ value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
					{ value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
					{ value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
				];
				const providerEl = document.getElementById('ai-provider');
				const modelEl = document.getElementById('ai-model');
				if (providerEl && providerEl.value === 'openrouter' && modelEl) {
					// Preserve current model value
					updateModelOptions('openrouter', modelEl.value);
				}
			}
		} catch (error) {
			vscode.postMessage({ type: 'log', level: 'error', message: '[AI] Error fetching OpenRouter models: ' + (error.message || error) });
			// Use fallback models on error
			openRouterModels = [
				{ value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
				{ value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
				{ value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
				{ value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
			];
			const providerEl = document.getElementById('ai-provider');
			if (providerEl && providerEl.value === 'openrouter') {
				updateModelOptions('openrouter');
			}
		} finally {
			isLoadingOpenRouterModels = false;
			const modelEl = document.getElementById('ai-model');
			if (modelEl) {
				modelEl.disabled = false;
			}
		}
	}
	
	// Update model options based on provider
	function updateModelOptions(provider, preserveValue = null) {
		let models;
		if (provider === 'openrouter') {
			// Use dynamically fetched models if available, otherwise use fallback
			models = openRouterModels.length > 0 ? openRouterModels : [
				{ value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
				{ value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
				{ value: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5' },
				{ value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' }
			];
		} else {
			models = staticModelOptions[provider] || staticModelOptions['openai'];
		}
		
		// Store current value before clearing
		const currentValue = preserveValue !== null ? preserveValue : aiModel.value;
		
		aiModel.innerHTML = models.map(m => 
			'<option value="' + m.value + '">' + m.label + '</option>'
		).join('');
		
		// Try to restore the previous value if it exists in the new options
		if (currentValue && Array.from(aiModel.options).some(opt => opt.value === currentValue)) {
			aiModel.value = currentValue;
			// Save the restored value to ensure it's persisted
			vscode.postMessage({ 
				type: 'aiSettingChange', 
				setting: 'model', 
				value: currentValue 
			});
		} else if (models.length > 0) {
			// If previous value not found, use first model
			const newValue = models[0].value;
			aiModel.value = newValue;
			// Always save the model value (whether it's restored or defaulted)
			vscode.postMessage({ 
				type: 'aiSettingChange', 
				setting: 'model', 
				value: newValue 
			});
		}
	}
	
	// Update API key hint based on provider
	function updateApiKeyHint(provider) {
		const hints = {
			'openai': 'Get your API key from platform.openai.com',
			'anthropic': 'Get your API key from console.anthropic.com (Note: Anthropic requires a server-side proxy due to CORS)',
			'grok': 'Get your API key from x.ai',
			'openrouter': 'Get your API key from openrouter.ai',
			'custom': 'Enter your custom API key and endpoint URL'
		};
		apiKeyHint.textContent = hints[provider] || hints['openai'];
	}
	
	// Settings change handlers
	aiApiKey.addEventListener('change', (e) => {
		const apiKey = e.target.value;
		
		vscode.postMessage({ type: 'log', level: 'log', message: '[AI] API key changed - provider: ' + aiProvider.value + ', apiKey: ' + (apiKey ? 'present' : 'empty') });
		
		// Fetch OpenRouter models if provider is OpenRouter and API key is available
		if (aiProvider.value === 'openrouter' && apiKey) {
			vscode.postMessage({ type: 'log', level: 'log', message: '[AI] API key entered for OpenRouter, triggering fetch...' });
			fetchOpenRouterModels(apiKey);
		}
		
		vscode.postMessage({ 
			type: 'aiSettingChange', 
			setting: 'apiKey', 
			value: apiKey 
		});
	});
	
	// Also listen for input events (for real-time updates as user types)
	aiApiKey.addEventListener('input', (e) => {
		const apiKey = e.target.value;
		
		// Fetch OpenRouter models if provider is OpenRouter and API key is available
		// Use a debounce to avoid too many requests
		if (aiProvider.value === 'openrouter' && apiKey && apiKey.length > 10) {
			clearTimeout(window.openRouterFetchTimeout);
			window.openRouterFetchTimeout = setTimeout(() => {
				if (aiProvider.value === 'openrouter' && aiApiKey.value === apiKey && apiKey.length > 10) {
					vscode.postMessage({ type: 'log', level: 'log', message: '[AI] API key input detected, triggering fetch...' });
					fetchOpenRouterModels(apiKey);
				}
			}, 500);
		}
	});
	
	aiModel.addEventListener('change', (e) => {
		vscode.postMessage({ 
			type: 'aiSettingChange', 
			setting: 'model', 
			value: e.target.value 
		});
	});
	
	aiEndpoint.addEventListener('change', (e) => {
		vscode.postMessage({ 
			type: 'aiSettingChange', 
			setting: 'endpoint', 
			value: e.target.value 
		});
	});
	
	aiSystemPrompt.addEventListener('change', (e) => {
		vscode.postMessage({ 
			type: 'aiSettingChange', 
			setting: 'systemPrompt', 
			value: e.target.value 
		});
	});
	
	// Test connection button
	testConnectionBtn.addEventListener('click', () => {
		const settings = {
			provider: aiProvider.value,
			apiKey: aiApiKey.value,
			model: aiModel.value,
			endpoint: aiEndpoint.value,
			systemPrompt: aiSystemPrompt.value
		};
		
		if (!settings.apiKey) {
			showConnectionStatus('error', 'Please enter an API key');
			return;
		}
		
		showConnectionStatus('testing', 'Testing connection...');
		testConnectionBtn.disabled = true;
		
		vscode.postMessage({ 
			type: 'testAIConnection', 
			settings: settings 
		});
	});
	
	function showConnectionStatus(type, message) {
		connectionStatus.className = 'connection-status ' + type;
		connectionStatus.textContent = message;
		connectionStatus.classList.remove('hidden');
	}
	
	// Handle messages from extension (including AI settings)
	const originalMessageHandler = window.addEventListener('message', event => {
		const message = event.data;
		
		// Handle AI settings messages
		if (message.type === 'aiSettings') {
			aiProvider.value = message.settings.provider || 'openai';
			aiApiKey.value = message.settings.apiKey || '';
			aiEndpoint.value = message.settings.endpoint || '';
			aiSystemPrompt.value = message.settings.systemPrompt || '';
			
			updateApiKeyHint(aiProvider.value);
			
			if (aiProvider.value === 'custom') {
				customEndpointSection.classList.remove('hidden');
			}
			
			// Store saved model value before updating options
			const savedModel = message.settings.model || '';
			
			// For OpenRouter, fetch models first before updating dropdown
			if (aiProvider.value === 'openrouter' && aiApiKey.value) {
				vscode.postMessage({ type: 'log', level: 'log', message: '[AI] Settings loaded - OpenRouter with API key, fetching models...' });
				// Show loading state
				aiModel.disabled = true;
				aiModel.innerHTML = '<option value="">Loading models...</option>';
				// Fetch models and then update dropdown
				fetchOpenRouterModels(aiApiKey.value).then(() => {
					updateModelOptions('openrouter', savedModel);
				}).catch(() => {
					// On error, still update with fallback models
					updateModelOptions('openrouter', savedModel);
				});
			} else {
				// For other providers, update immediately with saved model value
				updateModelOptions(aiProvider.value, savedModel);
			}
		} else if (message.type === 'aiConnectionTest') {
			testConnectionBtn.disabled = false;
			if (message.success) {
				showConnectionStatus('success', message.message || 'Connection successful!');
			} else {
				showConnectionStatus('error', message.message || 'Connection failed');
			}
		}
	});
	
	// Notify extension that webview is ready
	vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>
`;
	}
}

