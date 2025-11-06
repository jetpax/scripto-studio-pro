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
 * Hidden Webview for WebREPL Bridge
 * This webview runs the WebSocket connection in a browser context
 * where it works (unlike the extension host which blocks it)
 */

import * as vscode from 'vscode';

export class WebREPLBridgeWebview {
	private panel: vscode.WebviewPanel | undefined;
	private extensionUri: vscode.Uri;
	private outputChannel: any;
	private pendingOperations = new Map<string, { resolve: any; reject: any }>();

	constructor(extensionUri: vscode.Uri, outputChannel: any) {
		this.extensionUri = extensionUri;
		this.outputChannel = outputChannel;
	}

	async ensureWebview(): Promise<void> {
		if (!this.panel) {
			// Get active editor before creating panel to restore focus
			const activeEditorBefore = vscode.window.activeTextEditor;
			
		// Create webview - VS Code requires panels to be visible, so we'll use a minimal name
		// Open it in the active column to avoid creating a split view
		this.panel = vscode.window.createWebviewPanel(
			'webreplBridge',
			'🔌', // Use minimal icon-only title to reduce visual impact
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				enableCommandUris: false
			}
		);

			this.panel.onDidDispose(() => {
				this.panel = undefined;
			});

			this.panel.webview.onDidReceiveMessage((message) => {
				this.handleMessage(message);
			});

	this.panel.webview.html = this.getBridgeHtml();
	
	// Immediately switch back to the previous editor or find any Python file
	setTimeout(async () => {
		if (activeEditorBefore) {
			await vscode.window.showTextDocument(activeEditorBefore.document, {
				preserveFocus: false,
				viewColumn: vscode.ViewColumn.One
			});
		} else {
			// Look for any Python editor to show instead of the bridge
			const editors = vscode.window.visibleTextEditors;
			const pythonEditor = editors.find(e => e.document.languageId === 'python');
			if (pythonEditor) {
				await vscode.window.showTextDocument(pythonEditor.document, {
					preserveFocus: false,
					viewColumn: vscode.ViewColumn.One
				});
			}
		}
	}, 10);
		}
	}

	// Close the panel programmatically after connection is established
	// The webview connection will persist even when the panel is closed
	closePanel(): void {
		if (this.panel) {
			this.panel.dispose();
		}
	}

	private onConnectedCallback: (() => void) | null = null;
	private onDisconnectedCallback: (() => void) | null = null;
	private onDataCallback: ((data: string, isError: boolean) => void) | null = null;
	private onAutoInfoCallback: ((info: any) => void) | null = null;
	private onDisplayUICallback: ((uiData: any) => void) | null = null;
	private onPlotDataCallback: ((plotData: any) => void) | null = null;
	private onShowPromptCallback: (() => void) | null = null;

		setCallbacks(callbacks: {
			onConnected?: () => void;
			onDisconnected?: () => void;
			onData?: (data: string, isError: boolean) => void;
			onAutoInfo?: (info: any) => void;
			onDisplayUI?: (uiData: any) => void;
			onPlotData?: (plotData: any) => void;
			onShowPrompt?: () => void;
		}): void {
			this.onConnectedCallback = callbacks.onConnected || null;
			this.onDisconnectedCallback = callbacks.onDisconnected || null;
			this.onDataCallback = callbacks.onData || null;
			this.onAutoInfoCallback = callbacks.onAutoInfo || null;
			this.onDisplayUICallback = callbacks.onDisplayUI || null;
			this.onPlotDataCallback = callbacks.onPlotData || null;
			this.onShowPromptCallback = callbacks.onShowPrompt || null;
		}

	private handleMessage(message: any): void {
		switch (message.type) {
			case 'log':
				if (this.outputChannel) {
					this.outputChannel.appendLine(`[WebREPL Bridge] ${message.data}`);
				}
				break;

			case 'connected':
				if (this.onConnectedCallback) {
					this.onConnectedCallback();
				}
				break;

			case 'disconnected':
				if (this.onDisconnectedCallback) {
					this.onDisconnectedCallback();
				}
				break;

			case 'data':
				if (this.onDataCallback) {
					this.onDataCallback(message.data, message.isError || false);
				}
				break;

			case 'showPrompt':
				// Show prompt after execution completes
				if (this.onShowPromptCallback) {
					this.onShowPromptCallback();
				}
				break;

			case 'command':
				// Broadcast commands (AUTO-INFO, DISPLAY-UI, etc.)
				if (message.cmd === 'AUTO-INFO' && this.onAutoInfoCallback) {
					this.onAutoInfoCallback(message.arg);
				} else if (message.cmd === 'DISPLAY-UI' && this.onDisplayUICallback) {
					this.onDisplayUICallback(message.arg);
				} else if (message.cmd === 'PLOT-DATA-UPDATE' && this.onPlotDataCallback) {
					this.onPlotDataCallback(message.arg);
				}
				break;

			case 'result':
				// Async operation result
				const pending = this.pendingOperations.get(message.requestId);
				if (pending) {
					this.pendingOperations.delete(message.requestId);
					if (message.error) {
						pending.reject(new Error(message.error));
					} else {
						pending.resolve(message.result);
					}
				}
				break;
		}
	}

	async connect(wsUrl: string, password: string): Promise<void> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `connect-${Date.now()}`;
			this.pendingOperations.set(requestId, { resolve, reject });

			this.panel?.webview.postMessage({
				type: 'connect',
				wsUrl,
				password,
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('Connection timeout'));
				}
			}, 15000);
		});
	}

	async disconnect(): Promise<void> {
		if (this.panel) {
			this.panel.webview.postMessage({ type: 'disconnect' });
		}
	}

	async execRaw(code: string, silent: boolean): Promise<string> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `exec-${Date.now()}`;
			this.pendingOperations.set(requestId, { resolve, reject });

			this.panel?.webview.postMessage({
				type: 'exec',
				code,
				silent,
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('Execution timeout'));
				}
			}, 30000);
		});
	}

	async getFile(path: string): Promise<Uint8Array> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `getfile-${Date.now()}`;
			this.pendingOperations.set(requestId, { 
				resolve: (base64Result: string) => {
					// Convert base64 back to Uint8Array
					const binaryString = atob(base64Result);
					const bytes = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					resolve(bytes);
				}, 
				reject 
			});

			this.panel?.webview.postMessage({
				type: 'getFile',
				path,
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('File get timeout'));
				}
			}, 30000);
		});
	}

	async putFile(path: string, data: Uint8Array): Promise<void> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `putfile-${Date.now()}`;
			this.pendingOperations.set(requestId, { resolve, reject });

			// Convert Uint8Array to base64 for postMessage
			const base64 = btoa(String.fromCharCode(...data));

			this.panel?.webview.postMessage({
				type: 'putFile',
				path,
				data: base64,
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('File put timeout'));
				}
			}, 30000);
		});
	}

	async listDir(path: string): Promise<any[]> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `listdir-${Date.now()}`;
			this.pendingOperations.set(requestId, { resolve, reject });

			this.panel?.webview.postMessage({
				type: 'listDir',
				path,
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('List directory timeout'));
				}
			}, 10000);
		});
	}

	async getSystemInfo(): Promise<any> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `sysinfo-${Date.now()}`;
			this.pendingOperations.set(requestId, { resolve, reject });

			this.panel?.webview.postMessage({
				type: 'getSystemInfo',
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('Get system info timeout'));
				}
			}, 10000);
		});
	}

	async getNetworksInfo(): Promise<any> {
		await this.ensureWebview();

		return new Promise((resolve, reject) => {
			const requestId = `networks-${Date.now()}`;
			this.pendingOperations.set(requestId, { resolve, reject });

			this.panel?.webview.postMessage({
				type: 'getNetworksInfo',
				requestId
			});

			setTimeout(() => {
				if (this.pendingOperations.has(requestId)) {
					this.pendingOperations.delete(requestId);
					reject(new Error('Get networks info timeout'));
				}
			}, 10000);
		});
	}

	sendRaw(data: string): void {
		if (this.panel) {
			this.panel.webview.postMessage({
				type: 'send',
				data
			});
		}
	}

	interrupt(): void {
		if (this.panel) {
			this.panel.webview.postMessage({ type: 'interrupt' });
		}
	}

	private getBridgeHtml(): string {
		// Embed the WebREPL bridge JavaScript directly in the webview
		// This is a simplified version - we'll embed the full Scripto Studio bridge
		return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body { display: none; } /* Hidden webview */
	</style>
</head>
<body>
	<script>
		const vscode = acquireVsCodeApi();
		
		// Embed WebREPL Bridge (simplified - will use full Scripto Studio version)
		// This runs in browser context where WebSocket works!
		class WebREPLBridge {
			constructor() {
				this.websocket = null;
				this.webreplState = 'DISCONNECTED';
				this.replState = 'IDLE';
				this.password = '';
				this.pendingCommands = new Map();
				this.rawReplBuffer = '';
				this.rawReplResolve = null;
				this.rawReplReject = null;
				this.codeSentTimestamp = 0;
				this.replTimeout = 15000;
				this.silentMode = false;
				this.jsonResponse = null;
				this.pendingFileOp = null;
				this.WEBREPL_OP_PUT_FILE = 1;
				this.WEBREPL_OP_GET_FILE = 2;
				this.WEBREPL_RESP_OK = 0;
			}

			async connect(wsUrl, password) {
				if (this.webreplState !== 'DISCONNECTED') {
					throw new Error('Already connected');
				}

				this.password = password;
				
				return new Promise((resolve, reject) => {
					try {
						console.log('[WebREPL Bridge] Connecting to:', wsUrl);
						this.websocket = new WebSocket(wsUrl);
						this.websocket.binaryType = "arraybuffer";
						this.webreplState = 'CONNECTING';
						
						const connectTimeout = setTimeout(() => {
							reject(new Error('Connection timeout'));
							this.disconnect();
						}, 10000);
						
						this.websocket.addEventListener('open', () => {
							console.log('[WebREPL Bridge] WebSocket opened');
							vscode.postMessage({ type: 'log', data: 'WebSocket opened' });
						});
						
						this.websocket.addEventListener('message', (evt) => {
							if (this.webreplState === 'CONNECTING' || this.webreplState === 'AUTHENTICATING') {
								this._handleAuthMessage(evt, resolve, reject, connectTimeout);
							} else {
								this._handleMessage(evt);
							}
						});
						
						this.websocket.addEventListener('close', () => {
							console.log('[WebREPL Bridge] Connection closed');
							this.webreplState = 'DISCONNECTED';
							vscode.postMessage({ type: 'disconnected' });
						});
						
						this.websocket.addEventListener('error', (err) => {
							console.error('[WebREPL Bridge] WebSocket error:', err);
							clearTimeout(connectTimeout);
							reject(err);
						});
						
					} catch (ex) {
						this.webreplState = 'DISCONNECTED';
						reject(ex);
					}
				});
			}

			_handleAuthMessage(evt, resolve, reject, connectTimeout) {
				const data = evt.data;
				
				if (typeof data === 'string') {
					vscode.postMessage({ type: 'log', data: 'Auth message: ' + data.substring(0, 100) });
					
					if (data.indexOf('Password:') !== -1) {
						vscode.postMessage({ type: 'log', data: 'Password prompt detected, sending password' });
						this.webreplState = 'AUTHENTICATING';
						this.websocket.send(this.password + '\\r');
					}
					else if (data.indexOf('>>>') !== -1 || data.indexOf('WebREPL connected') !== -1 || data.indexOf('raw REPL') !== -1) {
						vscode.postMessage({ type: 'log', data: 'Authentication successful, entering RAW REPL' });
						this.webreplState = 'CONNECTED';
						clearTimeout(connectTimeout);
						
					if (data.indexOf('raw REPL') !== -1) {
						vscode.postMessage({ type: 'log', data: 'Already in RAW REPL mode' });
						// Don't forward the raw ">" prompt - we'll show >>> instead
						this.replState = 'RAW_REPL_READY';
						vscode.postMessage({ type: 'connected' });
						// Show prompt after a tiny delay to ensure 'connected' message is processed first
						setTimeout(() => {
							vscode.postMessage({ type: 'showPrompt' });
						}, 10);
						resolve();
					} else {
							// Forward the authentication message to terminal (contains ">>>" or "WebREPL connected")
							this._notifyData(data, false);
							vscode.postMessage({ type: 'log', data: 'Sending Ctrl+A to enter RAW REPL' });
							this.replState = 'ENTERING_RAW';
							this.rawReplBuffer = '';
							this.websocket.send('\\x01');
							
							const checkReady = setInterval(() => {
								if (this.replState === 'RAW_REPL_READY') {
									clearInterval(checkReady);
									vscode.postMessage({ type: 'log', data: 'RAW REPL ready, connection complete' });
									vscode.postMessage({ type: 'connected' });
									resolve();
								}
							}, 100);
							
							// Timeout for RAW REPL entry
							setTimeout(() => {
								if (this.replState !== 'RAW_REPL_READY') {
									clearInterval(checkReady);
									vscode.postMessage({ type: 'log', data: 'Timeout waiting for RAW REPL, assuming ready' });
									this.replState = 'RAW_REPL_READY';
									vscode.postMessage({ type: 'connected' });
									resolve();
								}
							}, 5000);
						}
					}
					else if (data.indexOf('Access denied') !== -1) {
						clearTimeout(connectTimeout);
						vscode.postMessage({ type: 'log', data: 'Authentication failed - Access denied' });
						reject(new Error('Authentication failed'));
						this.disconnect();
					}
				}
			}

			_handleMessage(evt) {
				const rawData = evt.data;
				
				if (rawData instanceof ArrayBuffer) {
					this._handleBinaryMessage(new Uint8Array(rawData));
					return;
				}
				
				const textData = rawData;
				
				// FIRST: Check if this is a JSON command response (like Scripto Studio)
				// JSON commands arrive as complete WebSocket frames and should be handled before RAW REPL processing
				try {
					const trimmed = textData.trim();
					
					if (trimmed.startsWith('{')) {
						// Try to parse as JSON
						const response = JSON.parse(trimmed);
						
						// Check if it has a CMD property (JSON command response)
						if (response.CMD) {
							// Handle the command response (updates UI, resolves pending commands, etc.)
							this._handleCommandResponse(response);
							
							// If in silent mode (iframe command), capture the complete JSON frame for return value
							// BUT: Don't capture broadcast commands (AUTO-INFO, DISPLAY-UI, etc.) - they're handled via callbacks
							// Only capture data-response commands (LIST-DIR, PARAMETERS-LIST, etc.) for iframe to use
							if (this.silentMode && this.rawReplResolve && !this._isBroadcastCommand(response.CMD)) {
								this.jsonResponse = textData;  // Capture the complete frame
							}
							
							// If we're in the middle of an execution (RUNNING or GOT_FIRST_EOF), complete it
							if (this.replState === 'RUNNING' || this.replState === 'GOT_FIRST_EOF' || this.replState === 'WAITING_OK') {
								// Complete execution
								this.replState = 'RAW_REPL_READY';
								if (this.rawReplResolve) {
									const result = this.jsonResponse || '';
									this.rawReplResolve(result);
									this.rawReplResolve = null;
									this.rawReplReject = null;
								}
								this.silentMode = false;
								this.jsonResponse = null;
								vscode.postMessage({ type: 'showPrompt' });
							}
							
							// ALWAYS return early - JSON commands are never displayed in terminal
							return;
						}
					}
				} catch (e) {
					vscode.postMessage({ type: 'log', data: 'JSON parse failed: ' + e.message });
					// Not JSON, continue with RAW REPL processing
				}
				
				// Handle RAW REPL responses (not JSON commands)
				if (this.replState === 'ENTERING_RAW' || this.replState === 'RAW_REPL_READY' || 
					this.replState === 'WAITING_OK' || this.replState === 'RUNNING' || this.replState === 'GOT_FIRST_EOF') {
					this._handleRawReplMessage(textData);
				} else {
					this._notifyData(textData, false);
				}
			}

			_handleRawReplMessage(frame) {
				// CRITICAL: Each WebSocket frame is atomic - never accumulate across frames!
				// Buffer is ONLY used in ENTERING_RAW to wait for initial prompt
				
				if (this.replState === 'ENTERING_RAW') {
					// Accumulate ONLY in this state to detect RAW REPL entry
					this.rawReplBuffer += frame;
					if (this.rawReplBuffer.includes('raw REPL') && this.rawReplBuffer.includes('>')) {
						this.replState = 'RAW_REPL_READY';
						this.rawReplBuffer = '';  // Clear buffer after entering
						// Show >>> prompt now that we're in RAW REPL mode
						// Delay slightly to ensure any 'connected' message is processed first
						setTimeout(() => {
							vscode.postMessage({ type: 'showPrompt' });
						}, 10);
					}
					return;
				}
				
				if (this.replState === 'RAW_REPL_READY') {
					// Idle - shouldn't receive anything except JSON broadcasts (already handled in _handleMessage)
					// If we get here, something unexpected happened
					return;
				}
				
				if (this.replState === 'WAITING_OK') {
					// Check timeout
					if (Date.now() - this.codeSentTimestamp > this.replTimeout) {
						this.replState = 'RAW_REPL_READY';
						if (this.rawReplReject) {
							this.rawReplReject(new Error('Timeout'));
							this.rawReplResolve = null;
							this.rawReplReject = null;
						}
						return;
					}
					
					// Wait for "OK" frame
					if (frame.startsWith('OK')) {
						this.replState = 'RUNNING';
						// If frame has data after OK, process it
						const remaining = frame.substring(2);
						if (remaining) {
							this._handleRawReplMessage(remaining);
						}
					}
					return;
				}
				
				if (this.replState === 'RUNNING') {
					// Process this atomic frame for stdout
					// JSON was already intercepted in _handleMessage()
					
					// Check for first EOF marker
					if (frame.includes('\\x04')) {
						const parts = frame.split('\\x04');
						const stdout = parts[0];
						// Display stdout
						if (!this.silentMode && stdout.trim()) {
							this._notifyData(stdout, false);
						}
						// Transition to stderr mode
						this.replState = 'GOT_FIRST_EOF';
						// Process remaining parts (stderr + second EOF)
						const remaining = parts.slice(1).join('\\x04');
						if (remaining) {
							this._handleRawReplMessage(remaining);
						}
					} else {
						// No EOF in this frame - just stdout
						if (!this.silentMode && frame.trim()) {
							this._notifyData(frame, false);
						}
					}
					return;
				}
				
				if (this.replState === 'GOT_FIRST_EOF') {
					// Process this atomic frame for stderr
					// JSON was already intercepted in _handleMessage()
					
					// Check for second EOF marker
					if (frame.includes('\\x04')) {
						const parts = frame.split('\\x04');
						const stderr = parts[0];
						// Display stderr
						if (!this.silentMode && stderr.trim()) {
							this._notifyData(stderr, true);
						}
						
						// Execution complete
						this.replState = 'RAW_REPL_READY';
						
						// Resolve promise with JSON response if captured
						if (this.rawReplResolve) {
							const result = this.jsonResponse || '';
							this.rawReplResolve(result);
							this.rawReplResolve = null;
							this.rawReplReject = null;
						}
						
						this.silentMode = false;
						this.jsonResponse = null;
						
						// Show >>> prompt
						vscode.postMessage({ type: 'showPrompt' });
					} else {
						// No EOF in this frame - just stderr
						if (!this.silentMode && frame.trim()) {
							this._notifyData(frame, true);
						}
					}
					return;
				}
			}

			_handleCommandResponse(response) {
				const cmd = response.CMD;
				if (cmd === 'AUTO-INFO') {
					vscode.postMessage({ type: 'command', cmd: 'AUTO-INFO', arg: response.ARG });
				} else if (cmd === 'DISPLAY-UI') {
					vscode.postMessage({ type: 'command', cmd: 'DISPLAY-UI', arg: response.ARG });
				} else if (cmd === 'PLOT-DATA-UPDATE') {
					vscode.postMessage({ type: 'command', cmd: 'PLOT-DATA-UPDATE', arg: response.ARG });
				} else {
					// Handle all other command responses (including LIST-DIR)
					// Find pending command handler and resolve with ARG
					if (this.pendingCommands.has(cmd)) {
						const handler = this.pendingCommands.get(cmd);
						this.pendingCommands.delete(cmd);
						handler.resolve(response.ARG);
					}
				}
			}

			_isBroadcastCommand(cmd) {
				return cmd === 'AUTO-INFO' || cmd === 'PLOT-DATA-UPDATE' || cmd === 'DISPLAY-UI';
			}

			_notifyData(data, isError) {
				if (!this.silentMode) {
					vscode.postMessage({ type: 'data', data: data, isError: isError });
				}
			}

			_handleBinaryMessage(data) {
				if (data.length >= 4 && data[0] === 'W'.charCodeAt(0) && data[1] === 'B'.charCodeAt(0)) {
					const status = data[2] | (data[3] << 8);
					if (!this.pendingFileOp) return;
					if (status !== this.WEBREPL_RESP_OK) {
						this.pendingFileOp.reject(new Error('File operation failed'));
						this.pendingFileOp = null;
						return;
					}
					if (this.pendingFileOp.type === 'GET') {
						if (data.length >= 8) {
							const fileSize = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
							const fileData = data.slice(8);
							if (fileData.length === fileSize) {
								this.pendingFileOp.resolve(fileData);
								this.pendingFileOp = null;
							}
						}
					} else if (this.pendingFileOp.type === 'PUT') {
						this.pendingFileOp.resolve();
						this.pendingFileOp = null;
					}
				}
			}

			async execRaw(code, silent) {
				if (this.replState !== 'RAW_REPL_READY') {
					await this.getPrompt();
				}
				
				// Wrap simple expressions in print() like Scripto Studio does
				let codeToSend = code;
				const trimmedCode = code.trim();
				if (trimmedCode && 
					!trimmedCode.includes('print') && 
					!trimmedCode.includes('=') && 
					!trimmedCode.includes('import') &&
					!trimmedCode.includes('(')) {
					// This looks like a simple expression, wrap it in print()
					codeToSend = 'print(' + trimmedCode + ')';
				}
				
				this.silentMode = Boolean(silent);
				this.jsonResponse = null;
				this.replState = 'WAITING_OK';
				this.codeSentTimestamp = Date.now();
				
				return new Promise((resolve, reject) => {
					this.rawReplResolve = resolve;
					this.rawReplReject = reject;
					// Send code + EOF in a SINGLE WebSocket message (like Scripto Studio)
					this.websocket.send(codeToSend + '\\x04');
				});
			}

			async getPrompt() {
				if (this.replState === 'RAW_REPL_READY') return;
				this.websocket.send('\\x03');
				return new Promise((resolve) => {
					const timeout = setTimeout(() => {
						this.replState = 'RAW_REPL_READY';
						resolve();
					}, 2000);
					const interval = setInterval(() => {
						if (this.replState === 'RAW_REPL_READY') {
							clearTimeout(timeout);
							clearInterval(interval);
							resolve();
						}
					}, 100);
				});
			}

			async getFile(remotePath) {
				return new Promise((resolve, reject) => {
					this.pendingFileOp = { type: 'GET', resolve, reject };
					const pathBytes = new TextEncoder().encode(remotePath);
					const header = new Uint8Array(4 + pathBytes.length);
					header[0] = 'W'.charCodeAt(0);
					header[1] = 'A'.charCodeAt(0);
					header[2] = this.WEBREPL_OP_GET_FILE;
					header[3] = pathBytes.length;
					header.set(pathBytes, 4);
					this.websocket.send(header);
				});
			}

			async putFile(remotePath, data) {
				return new Promise((resolve, reject) => {
					this.pendingFileOp = { type: 'PUT', resolve, reject };
					const pathBytes = new TextEncoder().encode(remotePath);
					const header = new Uint8Array(4 + pathBytes.length + 4 + data.length);
					let offset = 0;
					header[offset++] = 'W'.charCodeAt(0);
					header[offset++] = 'A'.charCodeAt(0);
					header[offset++] = this.WEBREPL_OP_PUT_FILE;
					header[offset++] = pathBytes.length;
					header.set(pathBytes, offset);
					offset += pathBytes.length;
					header[offset++] = data.length & 0xFF;
					header[offset++] = (data.length >> 8) & 0xFF;
					header[offset++] = (data.length >> 16) & 0xFF;
					header[offset++] = (data.length >> 24) & 0xFF;
					header.set(data, offset);
					this.websocket.send(header);
				});
			}

			async _executeCommand(code) {
				// Execute via RAW REPL (like Scripto Studio)
				if (this.replState !== 'RAW_REPL_READY') {
					await this.getPrompt();
				}
				// Send command + newline + EOF (like Scripto Studio line 1169)
				this.websocket.send(code + '\\n\\x04');
				// Wait a bit for execution
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			async listDir(path) {
				if (this.replState !== 'RAW_REPL_READY') {
					await this.getPrompt();
				}
				
				// Try getListDir() first (Scriptomatic helper), fallback to Python code
				try {
					return await new Promise((resolve, reject) => {
						// Store handler for LIST-DIR response
						this.pendingCommands.set('LIST-DIR', { resolve, reject });
						
						// Execute getListDir() on device - response comes via JSON
						// Use _executeCommand (not execRaw) - it just sends the command
						const escapedPath = path.replace(/'/g, "\\\\'");
						const command = 'getListDir(\\'' + escapedPath + '\\')';
						this._executeCommand(command).catch((error) => {
							// If getListDir fails, fall through to Python fallback
							if (this.pendingCommands.has('LIST-DIR')) {
								this.pendingCommands.delete('LIST-DIR');
							}
							reject(error);
						});
						
						// Timeout after 10 seconds
						setTimeout(() => {
							if (this.pendingCommands.has('LIST-DIR')) {
								this.pendingCommands.delete('LIST-DIR');
								reject(new Error('List directory timeout'));
							}
						}, 10000);
					}).then(response => {
						// Scriptomatic returns: {"path": "/", "entries": {"boot.py": 139, "lib": null}}
						// Convert to our format
						if (response && response.entries) {
							return Object.entries(response.entries).map(([name, size]) => ({
								name: name,
								type: size === null ? 'dir' : 'file',
								size: size === null ? 0 : size
							}));
						}
						return [];
					});
				} catch (error) {
					// Fallback: Use Python code to list directory
					const escapedPath = path.replace(/'/g, "\\\\'");
					const code = 'import os\\nimport json\\ntry:\\n    items = []\\n    for name in os.listdir(\\'' + escapedPath + '\\'):\\n        full_path = \\'' + escapedPath + '\\' + \\'/\\' + name if \\'' + escapedPath + '\\' != \\'/\\' else \\'/\\' + name\\n        try:\\n            stat = os.stat(full_path)\\n            is_dir = stat[0] & 0x4000 != 0\\n            size = stat[6] if not is_dir else 0\\n            items.append({\\'name\\': name, \\'type\\': \\'dir\\' if is_dir else \\'file\\', \\'size\\': size})\\n        except:\\n            items.append({\\'name\\': name, \\'type\\': \\'unknown\\', \\'size\\': 0})\\n    print(json.dumps(items))\\nexcept Exception as e:\\n    print(json.dumps({\\'error\\': str(e)}))';
					const result = await this.execRaw(code, true);
					try {
						const parsed = JSON.parse(result);
						if (parsed.error) {
							throw new Error(parsed.error);
						}
						return parsed;
					} catch (e) {
						throw new Error('Failed to parse directory listing: ' + e.message);
					}
				}
			}

			async getSystemInfo() {
				if (this.replState !== 'RAW_REPL_READY') {
					await this.getPrompt();
				}
				
				return new Promise((resolve, reject) => {
					// Store handler for SYS-INFO response
					this.pendingCommands.set('SYS-INFO', { resolve, reject });
					
					// Execute getSysInfo() on device - response comes via JSON
					this._executeCommand('getSysInfo()').catch(reject);
					
					// Timeout after 10 seconds
					setTimeout(() => {
						if (this.pendingCommands.has('SYS-INFO')) {
							this.pendingCommands.delete('SYS-INFO');
							reject(new Error('Get system info timeout'));
						}
					}, 10000);
				});
			}

			async getNetworksInfo() {
				if (this.replState !== 'RAW_REPL_READY') {
					await this.getPrompt();
				}
				
				return new Promise((resolve, reject) => {
					// Store handler for NETWORKS-INFO response
					this.pendingCommands.set('NETWORKS-INFO', { resolve, reject });
					
					// Execute getNetworksInfo() on device - response comes via JSON
					this._executeCommand('getNetworksInfo()').catch(reject);
					
					// Timeout after 10 seconds
					setTimeout(() => {
						if (this.pendingCommands.has('NETWORKS-INFO')) {
							this.pendingCommands.delete('NETWORKS-INFO');
							reject(new Error('Get networks info timeout'));
						}
					}, 10000);
				});
			}

			sendRaw(data) {
				if (this.websocket && this.webreplState === 'CONNECTED') {
					this.websocket.send(data);
				}
			}

			interrupt() {
				if (this.websocket && this.webreplState === 'CONNECTED') {
					this.websocket.send('\\x03');
				}
			}

			disconnect() {
				if (this.websocket) {
					this.websocket.close();
					this.websocket = null;
				}
				this.webreplState = 'DISCONNECTED';
				this.replState = 'IDLE';
			}
		}

		const bridge = new WebREPLBridge();

		// Handle messages from extension
		window.addEventListener('message', async (event) => {
			const message = event.data;
			
			try {
				switch (message.type) {
					case 'connect':
						try {
							await bridge.connect(message.wsUrl, message.password);
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: true });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;

					case 'disconnect':
						bridge.disconnect();
						break;

					case 'exec':
						try {
							const result = await bridge.execRaw(message.code, message.silent);
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: result });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;

					case 'getFile':
						try {
							const fileData = await bridge.getFile(message.path);
							// Convert Uint8Array to base64
							const base64 = btoa(String.fromCharCode(...fileData));
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: base64 });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;

					case 'putFile':
						try {
							// Convert base64 back to Uint8Array
							const binary = atob(message.data);
							const bytes = new Uint8Array(binary.length);
							for (let i = 0; i < binary.length; i++) {
								bytes[i] = binary.charCodeAt(i);
							}
							await bridge.putFile(message.path, bytes);
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: true });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;

					case 'listDir':
						try {
							const items = await bridge.listDir(message.path);
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: items });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;
						
					case 'getSystemInfo':
						try {
							const sysInfo = await bridge.getSystemInfo();
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: sysInfo });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;
						
					case 'getNetworksInfo':
						try {
							const networksInfo = await bridge.getNetworksInfo();
							vscode.postMessage({ type: 'result', requestId: message.requestId, result: networksInfo });
						} catch (error) {
							vscode.postMessage({ type: 'result', requestId: message.requestId, error: error.message });
						}
						break;

					case 'send':
						bridge.sendRaw(message.data);
						break;

					case 'interrupt':
						bridge.interrupt();
						break;
				}
			} catch (error) {
				vscode.postMessage({ type: 'log', data: 'Error: ' + error.message });
			}
		});

		vscode.postMessage({ type: 'log', data: 'WebREPL Bridge webview ready' });
	</script>
</body>
</html>`;
	}
}

