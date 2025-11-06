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
 * Device UI Webview Provider
 * Displays device-served web UIs in iframe
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from '../webrepl/connection';

export class DeviceUIWebviewProvider {
	private panel?: vscode.WebviewPanel;
	private connection: WebREPLConnection;
	private extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri, connection: WebREPLConnection) {
		this.extensionUri = extensionUri;
		this.connection = connection;
	}

	showDeviceUI(uiData: any): void {
		// Extract URL and title from uiData
		const url = typeof uiData === 'string' ? uiData : uiData.url || uiData;
		const title = typeof uiData === 'object' ? uiData.title || 'Device UI' : 'Device UI';

		if (!this.panel) {
			// Create new panel in the active editor column (replaces current editor)
			this.panel = vscode.window.createWebviewPanel(
				'micropythonDeviceUI',
				title,
				vscode.ViewColumn.Active,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});

			// Handle messages from the webview (iframe bridge)
			this.panel.webview.onDidReceiveMessage(async (message) => {
				if (message.type === 'executeFromUI') {
					// Execute code from device UI iframe
					await this.handleExecuteFromUI(message.id, message.code);
				}
			});
		} else {
			// Update existing panel
			this.panel.title = title;
			this.panel.reveal(vscode.ViewColumn.Active);
		}

		this.panel.webview.html = this.getHtmlForWebview(url, title);
	}

	private async handleExecuteFromUI(id: string, code: string): Promise<void> {
		try {
			console.log('[Device UI] Executing code from iframe:', code.substring(0, 50) + '...');
			
			// Execute code via WebREPL in silent mode
			const output = await this.connection.execRaw(code, true);
			console.log('[Device UI] Raw output:', output);
			
			// The output should be a JSON string with CMD key
			// Just send it back as-is, the iframe will parse it
			let result = output.trim();
			
			// Validate it's JSON with CMD key
			try {
				const parsed = JSON.parse(result);
				if (!parsed.CMD) {
					console.log('[Device UI] Warning: Response has no CMD key:', parsed);
				}
			} catch (e) {
				console.log('[Device UI] Warning: Response is not valid JSON, sending as-is');
			}

			// Send result back to iframe
			this.panel?.webview.postMessage({
				type: 'executeResult',
				id: id,
				data: result
			});
		} catch (error: any) {
			console.error('[Device UI] Error executing code:', error);
			// Send error back to iframe
			this.panel?.webview.postMessage({
				type: 'executeError',
				id: id,
				error: error.message || 'Execution failed'
			});
		}
	}

	close(): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = undefined;
		}
	}

	private getHtmlForWebview(url: string, title: string): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
			background: #1e1e1e;
		}
		.container {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}
		.header {
			background: #2d2d30;
			color: #cccccc;
			padding: 8px 12px;
			border-bottom: 1px solid #3e3e42;
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.url {
			font-size: 12px;
			font-family: monospace;
			color: #858585;
		}
		iframe {
			flex: 1;
			border: none;
			background: white;
		}
		.loading {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100%;
			color: #cccccc;
		}
		.error {
			display: none;
			padding: 20px;
			color: #f48771;
			text-align: center;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10"/>
				<line x1="2" y1="12" x2="22" y2="12"/>
				<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
			</svg>
			<span class="url">${url}</span>
		</div>
		<div class="loading" id="loading">Loading device UI...</div>
		<div class="error" id="error">
			<p>Failed to load device UI</p>
			<p style="font-size: 12px;">Make sure the device is serving the UI at the specified URL.</p>
		</div>
		<iframe 
			id="deviceFrame" 
			src="${url}"
			sandbox="allow-scripts allow-same-origin allow-forms"
			style="display: none;"
		></iframe>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const iframe = document.getElementById('deviceFrame');
		const loading = document.getElementById('loading');
		const error = document.getElementById('error');

		iframe.addEventListener('load', () => {
			loading.style.display = 'none';
			error.style.display = 'none';
			iframe.style.display = 'block';
		});

		iframe.addEventListener('error', () => {
			loading.style.display = 'none';
			iframe.style.display = 'none';
			error.style.display = 'block';
		});

		// Timeout if iframe doesn't load
		setTimeout(() => {
			if (loading.style.display !== 'none') {
				loading.style.display = 'none';
				iframe.style.display = 'none';
				error.style.display = 'block';
			}
		}, 10000);

		// Bridge between iframe and WebREPL
		// The device UI iframe uses window.parent.postMessage to send execute requests
		window.addEventListener('message', async (event) => {
			// Only handle messages from our iframe
			if (event.source !== iframe.contentWindow) {
				return;
			}

			if (!event.data || event.data.type !== 'execute') {
				return;
			}

			const { id, code } = event.data;
			console.log('[Device UI Bridge] Executing code from iframe:', code.substring(0, 50) + '...');

			// Forward execute request to extension
			vscode.postMessage({
				type: 'executeFromUI',
				id: id,
				code: code
			});
		});

		// Listen for results from extension and forward to iframe
		window.addEventListener('message', (event) => {
			const message = event.data;
			
			if (message.type === 'executeResult') {
				// Forward result to iframe
				iframe.contentWindow.postMessage({
					type: 'result',
					id: message.id,
					data: message.data
				}, '*');
			} else if (message.type === 'executeError') {
				// Forward error to iframe
				iframe.contentWindow.postMessage({
					type: 'error',
					id: message.id,
					error: message.error
				}, '*');
			}
		});
	</script>
</body>
</html>`;
	}
}


