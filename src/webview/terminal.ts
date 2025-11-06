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
 * Terminal Webview Provider
 * Embeds xterm.js terminal for WebREPL interaction
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from '../webrepl/connection';

export class TerminalWebviewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private connection: WebREPLConnection;
	private extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri, connection: WebREPLConnection) {
		this.extensionUri = extensionUri;
		this.connection = connection;

		// Listen for data from WebREPL
		this.connection.onData((event: { data: string; isError: boolean }) => {
			this.sendToTerminal(event.data, event.isError);
		});

		// Listen for connection status changes
		this.connection.onConnected(() => {
			this.sendConnectionStatus(true);
			// Prompt will be shown by the bridge after entering RAW REPL mode
		});

		this.connection.onDisconnected(() => {
			this.sendConnectionStatus(false);
		});
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

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		// Handle messages from webview
		webviewView.webview.onDidReceiveMessage((message) => {
			switch (message.type) {
				case 'execute':
					// Execute complete command (sent when Enter is pressed)
					if (this.connection.isConnected()) {
						// Execute via execRaw which handles the full RAW REPL protocol
						this.connection.execRaw(message.command, false).catch((error) => {
							// Error will be displayed via onData callback
							console.error('Execution error:', error);
						});
					}
					break;
				case 'interrupt':
					// Interrupt running code
					if (this.connection.isConnected()) {
						this.connection.interrupt();
					}
					break;
				case 'ready':
					// Terminal is ready
					console.log('Terminal webview ready');
					break;
			}
		});
	}

	show(): void {
		if (this.view) {
			this.view.show?.(true);
		}
	}

	private sendToTerminal(data: string, isError: boolean): void {
		if (this.view) {
			this.view.webview.postMessage({
				type: 'output',
				data: data,
				isError: isError
			});
		}
	}

	private sendConnectionStatus(connected: boolean): void {
		if (this.view) {
			this.view.webview.postMessage({
				type: connected ? 'connected' : 'disconnected'
			});
		}
	}

	public showPrompt(): void {
		if (this.view) {
			this.view.webview.postMessage({
				type: 'showPrompt'
			});
		}
	}

	public clear(): void {
		if (this.view) {
			this.view.webview.postMessage({
				type: 'clear'
			});
		}
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		// Use CDN for xterm.js since node_modules isn't included in VSIX
		const xtermJsUri = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js';
		const xtermCssUri = 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css';
		const xtermFitUri = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${xtermCssUri}">
	<style>
		body {
			margin: 0;
			padding: 0;
			overflow: hidden;
			background: #1e1e1e;
		}
		#terminal {
			width: 100%;
			height: 100vh;
			padding-left: 5px;
		}
	</style>
</head>
<body>
	<div id="terminal"></div>

	<script src="${xtermJsUri}"></script>
	<script src="${xtermFitUri}"></script>
	<script>
		const vscode = acquireVsCodeApi();
		
		// Initialize terminal
		const term = new Terminal({
			cursorBlink: true,
			fontSize: 12,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: '#1e1e1e',
				foreground: '#d4d4d4',
				cursor: '#d4d4d4',
				black: '#000000',
				red: '#cd3131',
				green: '#0dbc79',
				yellow: '#e5e510',
				blue: '#2472c8',
				magenta: '#bc3fbc',
				cyan: '#11a8cd',
				white: '#e5e5e5',
				brightBlack: '#666666',
				brightRed: '#f14c4c',
				brightGreen: '#23d18b',
				brightYellow: '#f5f543',
				brightBlue: '#3b8eea',
				brightMagenta: '#d670d6',
				brightCyan: '#29b8db',
				brightWhite: '#e5e5e5'
			}
		});
		
		const fitAddon = new FitAddon.FitAddon();
		term.loadAddon(fitAddon);
		
		term.open(document.getElementById('terminal'));
		fitAddon.fit();
		
		// Buffer input and send as complete command on Enter (like Scripto Studio)
		let currentLine = '';
		let cursorPos = 0;
		let commandHistory = [];
		let historyIndex = -1;
		let savedLine = '';
		let isTerminalInput = false; // Track if output is from terminal input vs script execution
		
		function redrawLine(line, cursor) {
			// Clear current line: move to start, clear to end, write prompt + line
			// Prompt color: #d74dd7 (RGB: 215, 77, 215)
			term.write('\\r\\x1b[K\\x1b[38;2;215;77;215m>>> \\x1b[0m' + line);
			// Move cursor to correct position
			// After writing ">>> " + line, cursor is at the end
			// We want cursor at position 4 + cursor (0-based) = column 4 + cursor + 1 (1-based)
			// So move left by (line.length - cursor) positions
			const moveLeft = line.length - cursor;
			if (moveLeft > 0) {
				term.write('\\x1b[' + moveLeft + 'D');
			}
		}
		
		// Handle terminal input
		term.onData(async (data) => {
			// Up arrow
			if (data === '\\x1b[A') {
				if (commandHistory.length > 0) {
					if (historyIndex === -1) {
						savedLine = currentLine;
						historyIndex = commandHistory.length - 1;
					} else if (historyIndex > 0) {
						historyIndex--;
					}
					currentLine = commandHistory[historyIndex];
					cursorPos = currentLine.length;
					redrawLine(currentLine, cursorPos);
				}
				term.scrollToBottom();
				return;
			}
			
			// Down arrow
			if (data === '\\x1b[B') {
				if (historyIndex !== -1) {
					historyIndex++;
					if (historyIndex >= commandHistory.length) {
						currentLine = savedLine || '';
						historyIndex = -1;
					} else {
						currentLine = commandHistory[historyIndex];
					}
					cursorPos = currentLine.length;
					redrawLine(currentLine, cursorPos);
				}
				term.scrollToBottom();
				return;
			}
			
			// Left arrow
			if (data === '\\x1b[D') {
				if (cursorPos > 0) {
					cursorPos--;
					term.write('\\x1b[D');
				}
				return;
			}
			
			// Right arrow
			if (data === '\\x1b[C') {
				if (cursorPos < currentLine.length) {
					cursorPos++;
					term.write('\\x1b[C');
				}
				return;
			}
			
			// Enter key
			if (data === '\\r' || data === '\\n') {
				term.write('\\r\\n');
				if (currentLine.trim().length > 0) {
					// Add to history (avoid duplicates of last command)
					if (commandHistory.length === 0 || 
						commandHistory[commandHistory.length - 1] !== currentLine) {
						commandHistory.push(currentLine);
						// Limit history to 100 commands
						if (commandHistory.length > 100) {
							commandHistory.shift();
						}
					}
					historyIndex = -1;
					savedLine = '';
					
					// Send complete command to extension for execution
					isTerminalInput = true; // Mark that this output is from terminal input
					vscode.postMessage({
						type: 'execute',
						command: currentLine
					});
				}
				currentLine = '';
				cursorPos = 0;
				// Show prompt after command (will be shown after execution completes)
			} else if (data === '\\u007F' || data === '\\b') {
				// Backspace
				if (cursorPos > 0) {
					currentLine = currentLine.slice(0, cursorPos - 1) + currentLine.slice(cursorPos);
					cursorPos--;
					redrawLine(currentLine, cursorPos);
				}
			} else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
				// Regular printable character - insert at cursor position
				currentLine = currentLine.slice(0, cursorPos) + data + currentLine.slice(cursorPos);
				cursorPos++;
				redrawLine(currentLine, cursorPos);
			}
		});
		
		// Handle messages from extension
		window.addEventListener('message', (event) => {
			const message = event.data;
			switch (message.type) {
				case 'output':
					if (message.isError) {
						term.write('\\x1b[91m' + message.data + '\\x1b[0m\\r\\n');
						isTerminalInput = false; // Reset after error
					} else {
						// Convert \\n to \\r\\n and ensure output ends with newline
						let displayData = message.data.replace(/\\n/g, '\\r\\n');
						// Ensure output ends with newline (unless it already does)
						if (!displayData.endsWith('\\r\\n')) {
							displayData += '\\r\\n';
						}
						// Add blank line before output only for script execution (not terminal input)
						if (!isTerminalInput && !displayData.startsWith('\\r\\n')) {
							term.write('\\r\\n');
						}
						term.write(displayData);
						isTerminalInput = false; // Reset after output
					}
					break;
				case 'connected':
					term.clear();
					term.writeln('\\x1b[32mScriptO Studio Pro REPL\\x1b[0m');
					term.writeln('');
					// Don't show prompt here - wait for showPrompt message
					// This ensures prompt appears AFTER the banner
					break;
				case 'disconnected':
					term.clear();
					term.writeln('\\x1b[32mScriptO Studio Pro REPL\\x1b[0m');
					term.writeln('\\x1b[31mDisconnected\\x1b[0m');
					term.writeln('Connect to your device to start...');
					term.writeln('');
					break;
			case 'showPrompt':
				// Prompt appears on new line (output already has newline)
				// Prompt color: #d74dd7 (RGB: 215, 77, 215)
				term.write('\\x1b[38;2;215;77;215m>>> \\x1b[0m');
				if (typeof currentLine !== 'undefined') {
					currentLine = '';
					cursorPos = 0;
				}
				isTerminalInput = false; // Reset when prompt is shown
				break;
			case 'clear':
				term.clear();
				// Show banner and prompt after clear if connected
				if (isConnected) {
					term.writeln('\\x1b[32mScriptO Studio Pro REPL\\x1b[0m');
					term.writeln('');
					term.write('\\x1b[38;2;215;77;215m>>> \\x1b[0m');
					currentLine = '';
					cursorPos = 0;
				} else {
					term.writeln('\\x1b[32mScriptO Studio Pro REPL\\x1b[0m');
					term.writeln('Connect to your device to start...');
					term.writeln('');
				}
				break;
			}
		});
		
		// Handle window resize
		window.addEventListener('resize', () => {
			fitAddon.fit();
		});
		
		// Initial welcome message (no prompt - will be shown after connection)
		term.writeln('\\x1b[32mMicroPython WebREPL Terminal\\x1b[0m');
		term.writeln('Connect to your device to start...');
		term.writeln('');
		
		// Notify extension that terminal is ready
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}
}

