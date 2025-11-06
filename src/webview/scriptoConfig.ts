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
 * ScriptO Configuration Webview Provider
 * Ported from Scripto Studio's ScriptOsConfigView
 */

import * as vscode from 'vscode';
import { ScriptOFile } from '../scriptos/scanner';

export class ScriptOConfigWebviewProvider {
	private panel: vscode.WebviewPanel | undefined;
	private extensionUri: vscode.Uri;
	private scripto: ScriptOFile | null = null;
	private userArgs: { [key: string]: any } = {};
	private resolveCallback: ((args: { [key: string]: any }) => void) | null = null;
	private rejectCallback: ((error: Error) => void) | null = null;

	constructor(extensionUri: vscode.Uri) {
		this.extensionUri = extensionUri;
	}

	async showConfig(scripto: ScriptOFile): Promise<{ [key: string]: any }> {
		return new Promise((resolve, reject) => {
			this.scripto = scripto;
			this.resolveCallback = resolve;
			this.rejectCallback = reject;

			// Initialize args with default values
			this.userArgs = {};
			if (scripto.config.args) {
				for (const argId in scripto.config.args) {
					const arg = scripto.config.args[argId];
					if (arg.value !== undefined) {
						this.userArgs[argId] = arg.value;
					} else {
						// Set sensible defaults based on type
						if (arg.type === 'str') {
							this.userArgs[argId] = '';
						} else if (arg.type === 'int') {
							this.userArgs[argId] = 0;
						} else if (arg.type === 'float') {
							this.userArgs[argId] = 0.0;
						} else if (arg.type === 'bool') {
							this.userArgs[argId] = false;
						} else if (arg.type === 'list') {
							this.userArgs[argId] = arg.optional ? null : 0;
						} else if (arg.type === 'dict' && arg.items) {
							this.userArgs[argId] = Object.keys(arg.items)[0];
						}
					}
				}
			}

			// Create or reveal panel
			if (!this.panel) {
				this.panel = vscode.window.createWebviewPanel(
					'scriptoConfig',
					`Configure ${scripto.config.info?.name || scripto.filename}`,
					vscode.ViewColumn.Active,
					{
						enableScripts: true,
						retainContextWhenHidden: false
					}
				);

				this.panel.onDidDispose(() => {
					this.panel = undefined;
					if (this.rejectCallback) {
						this.rejectCallback(new Error('Configuration cancelled'));
					}
				});

				this.panel.webview.onDidReceiveMessage((message) => {
					this.handleMessage(message);
				});
			} else {
				this.panel.title = `Configure ${scripto.config.info?.name || scripto.filename}`;
			}

			this.panel.webview.html = this.getHtmlForWebview(scripto);
			this.panel.reveal();
		});
	}

	private handleMessage(message: any): void {
		switch (message.type) {
			case 'updateArg':
				this.userArgs[message.argId] = message.value;
				break;

			case 'generate':
				if (this.resolveCallback) {
					this.resolveCallback(this.userArgs);
					this.resolveCallback = null;
					this.rejectCallback = null;
				}
				if (this.panel) {
					this.panel.dispose();
				}
				break;

			case 'cancel':
				if (this.rejectCallback) {
					this.rejectCallback(new Error('Configuration cancelled'));
					this.rejectCallback = null;
					this.resolveCallback = null;
				}
				if (this.panel) {
					this.panel.dispose();
				}
				break;
		}
	}

	private getHtmlForWebview(scripto: ScriptOFile): string {
		const info = scripto.config.info || {};
		const args = scripto.config.args || {};
		const hasArgs = Object.keys(args).length > 0;

		// Handle version
		let version = 'v1.0.0';
		if (info.version) {
			if (Array.isArray(info.version)) {
				version = `v${info.version.join('.')}`;
			} else {
				version = `v${info.version}`;
			}
		}

		// Generate form fields HTML
		const formFields = hasArgs ? this.generateFormFields(args) : `
			<div style="text-align: center; padding: 40px;">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.5;">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="16" x2="12" y2="12"/>
					<line x1="12" y1="8" x2="12.01" y2="8"/>
				</svg>
				<p style="color: var(--vscode-descriptionForeground); margin: 0;">This ScriptO requires no configuration</p>
			</div>
		`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Configure ScriptO</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
			margin: 0;
		}
		.header {
			margin-bottom: 24px;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}
		.title-row {
			display: flex;
			align-items: baseline;
			gap: 12px;
			margin-bottom: 8px;
		}
		h2 {
			margin: 0;
			font-size: 20px;
			font-weight: 600;
		}
		.version {
			font-size: 14px;
			color: var(--vscode-descriptionForeground);
		}
		.description {
			color: var(--vscode-descriptionForeground);
			margin: 8px 0;
		}
		.meta {
			display: flex;
			gap: 16px;
			margin-top: 12px;
			font-size: 13px;
			color: var(--vscode-descriptionForeground);
		}
		.meta-item {
			display: flex;
			align-items: center;
			gap: 6px;
		}
		.form-section {
			margin-bottom: 32px;
		}
		.form-section h3 {
			margin: 0 0 16px 0;
			font-size: 16px;
			font-weight: 600;
		}
		.form-fields {
			display: flex;
			flex-direction: column;
			gap: 20px;
		}
		.field {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		.field label {
			font-size: 13px;
			font-weight: 500;
		}
		.field-optional {
			font-weight: normal;
			color: var(--vscode-descriptionForeground);
			font-size: 12px;
		}
		.field input[type="text"],
		.field input[type="number"] {
			padding: 6px 10px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
			font-size: 13px;
			border-radius: 2px;
		}
		.field input[type="text"]:focus,
		.field input[type="number"]:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
		}
		.field select {
			padding: 6px 10px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
			font-size: 13px;
			border-radius: 2px;
		}
		.checkbox-field {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.checkbox-field input[type="checkbox"] {
			width: 18px;
			height: 18px;
		}
		.actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 24px;
			padding-top: 16px;
			border-top: 1px solid var(--vscode-panel-border);
		}
		.button {
			padding: 8px 16px;
			border: none;
			border-radius: 2px;
			font-family: var(--vscode-font-family);
			font-size: 13px;
			cursor: pointer;
			transition: background-color 0.2s;
		}
		.button-secondary {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		.button-secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		.button-primary {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}
		.button-primary:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
	</style>
</head>
<body>
	<div class="header">
		<div class="title-row">
			<h2>${this.escapeHtml(info.name || scripto.filename)}</h2>
			<span class="version">${this.escapeHtml(version)}</span>
		</div>
		${info.description ? `<p class="description">${this.escapeHtml(info.description)}</p>` : ''}
		${info.author ? `
			<div class="meta">
				<div class="meta-item">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
						<circle cx="12" cy="7" r="4"/>
					</svg>
					${this.escapeHtml(info.author)}
				</div>
				${info.www ? `
					<a href="${this.escapeHtml(info.www)}" target="_blank" rel="noopener" style="color: var(--vscode-textLink-foreground); text-decoration: none;">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/>
							<line x1="2" y1="12" x2="22" y2="12"/>
							<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
						</svg>
						Website
					</a>
				` : ''}
			</div>
		` : ''}
	</div>

	<div class="form-section">
		${hasArgs ? '<h3>Configuration</h3>' : ''}
		<div class="form-fields">
			${formFields}
		</div>
	</div>

	<div class="actions">
		<button class="button button-secondary" onclick="cancel()">Back</button>
		<button class="button button-primary" onclick="generate()">Generate Code</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		// Initialize form with default values
		const defaultArgs = ${JSON.stringify(this.userArgs)};

		// Update arg value
		function updateArg(argId, value) {
			vscode.postMessage({
				type: 'updateArg',
				argId: argId,
				value: value
			});
		}

		// Generate code
		function generate() {
			vscode.postMessage({
				type: 'generate'
			});
		}

		// Cancel
		function cancel() {
			vscode.postMessage({
				type: 'cancel'
			});
		}

		// Set up event listeners for form fields
		// Note: DOMContentLoaded may have already fired, so we run immediately
		(function initForm() {
			// Text inputs
			document.querySelectorAll('input[type="text"]').forEach(function(input) {
				const argId = input.getAttribute('data-arg-id');
				// Set initial value
				if (argId && defaultArgs[argId] !== undefined) {
					input.value = defaultArgs[argId];
				}
				input.addEventListener('input', function(e) {
					const target = e.target;
					const argId = target.getAttribute('data-arg-id');
					if (argId) {
						updateArg(argId, target.value);
					}
				});
			});

			// Number inputs
			document.querySelectorAll('input[type="number"]').forEach(function(input) {
				const argId = input.getAttribute('data-arg-id');
				// Set initial value
				if (argId && defaultArgs[argId] !== undefined) {
					input.value = String(defaultArgs[argId]);
				}
				input.addEventListener('input', function(e) {
					const target = e.target;
					const argId = target.getAttribute('data-arg-id');
					if (argId) {
						const value = target.step === '1' ? parseInt(target.value) || 0 : parseFloat(target.value) || 0.0;
						updateArg(argId, value);
					}
				});
			});

			// Checkboxes
			document.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
				const argId = checkbox.getAttribute('data-arg-id');
				// Set initial value
				if (argId && defaultArgs[argId] !== undefined) {
					checkbox.checked = defaultArgs[argId];
				}
				checkbox.addEventListener('change', function(e) {
					const target = e.target;
					const argId = target.getAttribute('data-arg-id');
					if (argId) {
						updateArg(argId, target.checked);
					}
				});
			});

			// Selects
			document.querySelectorAll('select').forEach(function(select) {
				const argId = select.getAttribute('data-arg-id');
				// Set initial value
				if (argId && defaultArgs[argId] !== undefined) {
					select.value = defaultArgs[argId] === null ? 'none' : String(defaultArgs[argId]);
				}
				select.addEventListener('change', function(e) {
					const target = e.target;
					const argId = target.getAttribute('data-arg-id');
					if (argId) {
						const value = target.value === 'none' ? null : 
							(target.hasAttribute('data-is-number') ? parseInt(target.value) : target.value);
						updateArg(argId, value);
					}
				});
			});
		})();
		
		// Also set up on DOMContentLoaded in case it fires later
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', initForm);
		}
	</script>
</body>
</html>`;
	}

	private generateFormFields(args: any): string {
		const argIds = Object.keys(args);
		let html = '';

		for (const argId of argIds) {
			const arg = args[argId];
			const label = arg.label || argId;
			const optional = arg.optional || false;
			const defaultValue = this.userArgs[argId] !== undefined ? this.userArgs[argId] : arg.value;

			html += '<div class="field">';
			html += `<label>${this.escapeHtml(label)}${optional ? '<span class="field-optional"> (optional)</span>' : ''}</label>`;

			switch (arg.type) {
				case 'str':
					html += `<input type="text" data-arg-id="${this.escapeHtml(argId)}" placeholder="Enter text..." value="${this.escapeHtml(String(defaultValue || ''))}">`;
					break;

				case 'int':
					html += `<input type="number" step="1" data-arg-id="${this.escapeHtml(argId)}" placeholder="Enter integer..." value="${defaultValue !== undefined ? defaultValue : 0}">`;
					break;

				case 'float':
					html += `<input type="number" step="0.1" data-arg-id="${this.escapeHtml(argId)}" placeholder="Enter number..." value="${defaultValue !== undefined ? defaultValue : 0.0}">`;
					break;

				case 'bool':
					html += `
						<div class="checkbox-field">
							<input type="checkbox" data-arg-id="${this.escapeHtml(argId)}" ${defaultValue ? 'checked' : ''}>
							<span>Enabled</span>
						</div>
					`;
					break;

				case 'list':
					// GPIO pin selector
					const pins = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 26, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48];
					html += `<select data-arg-id="${this.escapeHtml(argId)}" data-is-number="true">`;
					if (optional) {
						html += `<option value="none" ${defaultValue === null ? 'selected' : ''}>No pin</option>`;
					}
					for (const pin of pins) {
						html += `<option value="${pin}" ${defaultValue === pin ? 'selected' : ''}>GPIO ${pin}</option>`;
					}
					html += '</select>';
					break;

				case 'dict':
					// Custom dropdown from items
					const items = arg.items || {};
					const itemKeys = Object.keys(items);
					html += `<select data-arg-id="${this.escapeHtml(argId)}">`;
					for (const itemKey of itemKeys) {
						html += `<option value="${this.escapeHtml(itemKey)}" ${defaultValue === itemKey ? 'selected' : ''}>${this.escapeHtml(items[itemKey])}</option>`;
					}
					html += '</select>';
					break;

				default:
					html += `<input type="text" data-arg-id="${this.escapeHtml(argId)}" placeholder="Enter value..." value="${this.escapeHtml(String(defaultValue || ''))}">`;
			}

			html += '</div>';
		}

		return html;
	}

	private escapeHtml(text: string): string {
		// Simple HTML escaping for use in webview HTML generation
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}

