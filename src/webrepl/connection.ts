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
 * WebREPL Connection Manager
 * Ported from Scripto Studio's webrepl-bridge.js
 */

import * as vscode from 'vscode';

type WebREPLState = 'DISCONNECTED' | 'CONNECTING' | 'AUTHENTICATING' | 'CONNECTED';
type REPLState = 'IDLE' | 'ENTERING_RAW' | 'RAW_REPL_READY' | 'WAITING_OK' | 'RUNNING' | 'GOT_FIRST_EOF';

interface PendingFileOp {
	type: 'GET' | 'PUT';
	resolve: (data?: any) => void;
	reject: (error: Error) => void;
	data?: Uint8Array;
}

interface PendingCommand {
	resolve: (data: any) => void;
	reject: (error: Error) => void;
}

export class WebREPLConnection {
	public websocket: WebSocket | null = null; // Not used when proxying to webview
	private webreplState: WebREPLState = 'DISCONNECTED';
	private replState: REPLState = 'IDLE';
	private password: string = '';
	private outputChannel: any = null; // vscode.OutputChannel
	private bridgeWebview: any = null; // WebREPLBridgeWebview - will be set by extension
	
	constructor(outputChannel?: any, bridgeWebview?: any) {
		this.outputChannel = outputChannel;
		this.bridgeWebview = bridgeWebview;
	}

	setBridgeWebview(bridge: any) {
		this.bridgeWebview = bridge;
	}

	// Internal methods for bridge webview to update state
	internalSetConnected(): void {
		this.webreplState = 'CONNECTED';
		this.replState = 'RAW_REPL_READY';
	}

	internalSetDisconnected(): void {
		this.webreplState = 'DISCONNECTED';
		this.replState = 'IDLE';
	}

	internalFireData(data: string, isError: boolean): void {
		this._onData.fire({ data, isError });
	}

	internalFireAutoInfo(info: any): void {
		this._onAutoInfo.fire(info);
	}

	internalFireDisplayUI(uiData: any): void {
		this._onDisplayUI.fire(uiData);
	}

	internalFirePlotData(plotData: any): void {
		this._onPlotData.fire(plotData);
	}
	
	private log(message: string, ...args: any[]) {
		const fullMessage = `[${new Date().toISOString()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
		console.log(fullMessage);
		if (this.outputChannel) {
			this.outputChannel.appendLine(fullMessage);
		}
	}
	
	private logError(message: string, ...args: any[]) {
		const fullMessage = `[${new Date().toISOString()}] ERROR: ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
		console.error(fullMessage);
		if (this.outputChannel) {
			this.outputChannel.appendLine(fullMessage);
		}
	}
	
	// Event emitters
	private _onConnected = new vscode.EventEmitter<void>();
	public readonly onConnected = this._onConnected.event;
	
	private _onDisconnected = new vscode.EventEmitter<void>();
	public readonly onDisconnected = this._onDisconnected.event;
	
	private _onData = new vscode.EventEmitter<{ data: string; isError: boolean }>();
	public readonly onData = this._onData.event;
	
	private _onAutoInfo = new vscode.EventEmitter<any>();
	public readonly onAutoInfo = this._onAutoInfo.event;
	
	private _onDisplayUI = new vscode.EventEmitter<any>();
	public readonly onDisplayUI = this._onDisplayUI.event;
	
	private _onPlotData = new vscode.EventEmitter<any>();
	public readonly onPlotData = this._onPlotData.event;
	
	// File transfer state
	private pendingFileOp: PendingFileOp | null = null;
	
	// Command response handlers
	private pendingCommands = new Map<string, PendingCommand>();
	private commandIdCounter = 0;
	
	// RAW REPL execution state
	private rawReplBuffer: string = '';
	private jsonResponse: string | null = null;
	private rawReplResolve: ((result: string) => void) | null = null;
	private rawReplReject: ((error: Error) => void) | null = null;
	private codeSentTimestamp: number = 0;
	private replTimeout = 15000; // 15 second timeout
	
	// Silent mode for iframe commands
	private silentMode = false;
	
	// Constants
	private readonly WEBREPL_OP_PUT_FILE = 1;
	private readonly WEBREPL_OP_GET_FILE = 2;
	private readonly WEBREPL_RESP_OK = 0;

	/**
	 * Connect to WebREPL server
	 * Uses bridge webview if available (for VS Code web), otherwise tries direct connection
	 */
	async connect(wsUrl: string, password: string): Promise<void> {
		if (this.webreplState !== 'DISCONNECTED') {
			throw new Error('Already connected or connecting');
		}

		this.password = password;

		// If we have a bridge webview, use it (WebSocket runs in browser context)
		if (this.bridgeWebview) {
			this.log('[WebREPL] Using bridge webview for connection (browser context)');
			try {
				await this.bridgeWebview.connect(wsUrl, password);
				this.webreplState = 'CONNECTED';
				this.replState = 'RAW_REPL_READY';
				this._onConnected.fire();
				return;
			} catch (error) {
				throw error;
			}
		}

		// Fallback to direct connection (won't work in extension host, but try anyway)
		return new Promise((resolve, reject) => {
			// Add connection timeout
			const connectTimeout = setTimeout(() => {
				if (this.websocket) {
					this.websocket.close();
				}
				reject(new Error('Connection timeout - device may be unreachable or WebREPL not enabled'));
			}, 10000); // 10 second timeout

			try {
				this.log('[WebREPL] Connecting to:', wsUrl);
				
				// Check if WebSocket is available (should be in vscode.dev browser context)
				if (typeof WebSocket === 'undefined') {
					reject(new Error('WebSocket is not available in this environment. Make sure you\'re using vscode.dev (browser), not VS Code Desktop.'));
					return;
				}
				
				this.log('[WebREPL] Creating WebSocket object...');
				this.websocket = new WebSocket(wsUrl);
				this.webreplState = 'CONNECTING';
				this.log('[WebREPL] WebSocket object created, readyState:', this.websocket.readyState);

				this.websocket.binaryType = 'arraybuffer';

				// Use addEventListener like Scripto Studio for better compatibility
				this.websocket.addEventListener('open', () => {
					this.log('[WebREPL] WebSocket opened successfully');
					// Don't set AUTHENTICATING yet - wait for first message
				});

				this.websocket.addEventListener('message', (evt) => {
					if (this.webreplState === 'CONNECTING' || this.webreplState === 'AUTHENTICATING') {
						this._handleAuthMessage(evt, resolve, reject, connectTimeout);
					} else {
						this._onWebSocketMessage(evt.data);
					}
				});

				this.websocket.addEventListener('error', (error: any) => {
					// Log detailed error information
					this.logError('[WebREPL] WebSocket error event:', error);
					this.logError('[WebREPL] Error type:', typeof error);
					this.logError('[WebREPL] Error details:', JSON.stringify(error));
					
					// Try to get more info from the WebSocket itself
					if (this.websocket) {
						this.logError('[WebREPL] WebSocket readyState:', this.websocket.readyState);
						this.logError('[WebREPL] WebSocket URL:', wsUrl);
					}
					
					clearTimeout(connectTimeout);
					
					// Extract IP from URL for helpful error messages
					const ipMatch = wsUrl.match(/ws:\/\/([^\/]+)/);
					const ipAddress = ipMatch ? ipMatch[1] : 'device';
					
					// Build helpful error message
					let errorMsg = `Failed to create WebSocket connection to ${wsUrl}\n\n`;
					errorMsg += `Possible causes:\n`;
					errorMsg += `1. Device is unreachable (check ping ${ipAddress})\n`;
					errorMsg += `2. Network/firewall blocking connection\n`;
					errorMsg += `3. WebREPL not running on device\n`;
					errorMsg += `4. Browser security blocking ws:// connection\n\n`;
					errorMsg += `Quick test: Open http://${ipAddress} in your browser.\n`;
					errorMsg += `If that works, the device is reachable and the issue is WebREPL/WebSocket.`;
					
					reject(new Error(errorMsg));
				});

				this.websocket.addEventListener('close', (event) => {
					this.log('[WebREPL] WebSocket closed', `code: ${event.code}`, `reason: ${event.reason}`);
					clearTimeout(connectTimeout);
					
					if (this.webreplState === 'CONNECTING' || this.webreplState === 'AUTHENTICATING') {
						// Connection closed before completing
						if (event.code === 1006) {
							reject(new Error('Connection closed unexpectedly. Device may be unreachable or WebREPL not running.'));
						} else {
							reject(new Error(`Connection closed: ${event.reason || 'Unknown reason'} (code: ${event.code})`));
						}
					}
					
					this.webreplState = 'DISCONNECTED';
					this.replState = 'IDLE';
					this._onDisconnected.fire();
				});
			} catch (error) {
				clearTimeout(connectTimeout);
				this.logError('[WebREPL] Connection error:', error);
				reject(new Error(`Failed to create WebSocket: ${error instanceof Error ? error.message : String(error)}`));
			}
		});
	}

	/**
	 * Disconnect from WebREPL
	 */
	async disconnect(): Promise<void> {
		if (this.bridgeWebview) {
			await this.bridgeWebview.disconnect();
		} else if (this.websocket) {
			try {
				this.websocket.close();
			} catch (error) {
				console.error('[WebREPL] Error closing websocket:', error);
			}
			this.websocket = null;
		}
		this.webreplState = 'DISCONNECTED';
		this.replState = 'IDLE';
		this._onDisconnected.fire();
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.webreplState === 'CONNECTED';
	}

	/**
	 * Send interrupt signal (Ctrl+C)
	 */
	interrupt(): void {
		if (this.bridgeWebview && this.webreplState === 'CONNECTED') {
			this.bridgeWebview.interrupt();
		} else if (this.websocket && this.webreplState === 'CONNECTED') {
			try {
				console.log('[WebREPL] Sending Ctrl+C interrupt');
				this.websocket.send('\x03');
			} catch (error) {
				console.error('[WebREPL] Error sending interrupt:', error);
			}
		}
	}

	/**
	 * Send raw data to WebREPL (for terminal input)
	 */
	sendRaw(data: string): void {
		if (this.bridgeWebview && this.webreplState === 'CONNECTED') {
			this.bridgeWebview.sendRaw(data);
		} else if (this.websocket && this.webreplState === 'CONNECTED') {
			this.websocket.send(data);
		}
	}

	/**
	 * Handle authentication messages (matches Scripto Studio pattern)
	 */
	private _handleAuthMessage(evt: MessageEvent, resolve: () => void, reject: (error: Error) => void, connectTimeout: NodeJS.Timeout): void {
		const data = evt.data;
		
		if (typeof data === 'string') {
			this.log('[WebREPL] Auth message received:', data.substring(0, 100));
			
			// Check for password prompt
			if (data.indexOf('Password:') !== -1) {
				this.log('[WebREPL] Password prompt detected, sending password');
				this.webreplState = 'AUTHENTICATING';
				// Use \r not \r\n like Scripto Studio
				this.websocket?.send(this.password + '\r');
			}
			// Check for successful authentication
			else if (data.indexOf('>>>') !== -1 || data.indexOf('WebREPL connected') !== -1 || data.indexOf('raw REPL') !== -1) {
				this.log('[WebREPL] Authentication successful');
				this.webreplState = 'CONNECTED';
				clearTimeout(connectTimeout);
				
				// Check if already in RAW REPL mode
				if (data.indexOf('raw REPL') !== -1) {
					this.log('[WebREPL] Already in RAW REPL mode');
					this.replState = 'RAW_REPL_READY';
					this._onConnected.fire();
					resolve();
				} else {
					// Need to enter RAW REPL mode
					this.log('[WebREPL] Entering RAW REPL mode');
					this.replState = 'ENTERING_RAW';
					this.rawReplBuffer = '';
					
					// Send Ctrl+A to enter RAW REPL mode
					this.websocket?.send('\x01');
					
					// Wait for RAW REPL to be ready before resolving (like Scripto Studio)
					const checkReady = setInterval(() => {
						if (this.replState === 'RAW_REPL_READY') {
							clearInterval(checkReady);
							this.log('[WebREPL] Connection complete - in RAW REPL mode');
							this._onConnected.fire();
							resolve();
						}
					}, 100);
				}
			}
			// Check for failed authentication
			else if (data.indexOf('Access denied') !== -1) {
				clearTimeout(connectTimeout);
				this.logError('[WebREPL] Authentication failed - Access denied');
				reject(new Error('Authentication failed - incorrect password'));
				this.disconnect();
			}
		}
	}

	/**
	 * Handle incoming WebSocket messages
	 */
	private _onWebSocketMessage(rawData: string | ArrayBuffer): void {
		// Handle binary data (file transfer)
		if (rawData instanceof ArrayBuffer) {
			this._handleBinaryMessage(new Uint8Array(rawData));
			return;
		}

		// Handle text data
		const textData = rawData as string;

		// Try to parse as JSON command response
		try {
			const trimmed = textData.trim();
			if (trimmed.startsWith('{') && trimmed.includes('"CMD"')) {
				const response = JSON.parse(trimmed);

				// Handle the command response (e.g., AUTO-INFO, DISPLAY-UI, etc.)
				this._handleCommandResponse(response);

				// If in silent mode (iframe command), capture the complete JSON frame
				// BUT: Don't capture broadcast commands - they're handled via events
				if (this.silentMode && this.rawReplResolve && !this._isBroadcastCommand(response.CMD)) {
					this.jsonResponse = textData;
				}

				// Return early to prevent terminal display
				return;
			}
		} catch (e) {
			// Not JSON, continue with REPL processing
		}

		// Handle RAW REPL responses
		if (
			this.replState === 'ENTERING_RAW' ||
			this.replState === 'RAW_REPL_READY' ||
			this.replState === 'WAITING_OK' ||
			this.replState === 'RUNNING' ||
			this.replState === 'GOT_FIRST_EOF'
		) {
			this._handleRawReplMessage(textData);
		} else {
			// Regular REPL output - send to listeners
			this._notifyData(textData, false);
		}
	}

	/**
	 * Handle binary messages (file transfers)
	 */
	private _handleBinaryMessage(data: Uint8Array): void {
		console.log('[WebREPL] Binary message, length:', data.length);

		// Check for WebREPL file transfer response: "WB" + status(2) + ...
		if (data.length >= 4 && data[0] === 'W'.charCodeAt(0) && data[1] === 'B'.charCodeAt(0)) {
			const status = data[2] | (data[3] << 8);
			console.log('[WebREPL] File op response, status:', status === this.WEBREPL_RESP_OK ? 'OK' : 'ERROR');

			if (!this.pendingFileOp) {
				console.log('[WebREPL] Received file response but no pending operation');
				return;
			}

			if (status !== this.WEBREPL_RESP_OK) {
				this.pendingFileOp.reject(new Error('File operation failed'));
				this.pendingFileOp = null;
				return;
			}

			// Success response
			if (this.pendingFileOp.type === 'GET') {
				// GET response includes file size and data
				if (data.length >= 8) {
					const fileSize = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
					const fileData = data.slice(8);

					console.log('[WebREPL] GET success, file size:', fileSize, 'received:', fileData.length);

					if (fileData.length === fileSize) {
						this.pendingFileOp.resolve(fileData);
						this.pendingFileOp = null;
					} else {
						this.pendingFileOp.reject(new Error(`File size mismatch: expected ${fileSize}, got ${fileData.length}`));
						this.pendingFileOp = null;
					}
				} else {
					this.pendingFileOp.reject(new Error('Invalid GET response (too short)'));
					this.pendingFileOp = null;
				}
			} else if (this.pendingFileOp.type === 'PUT') {
				console.log('[WebREPL] PUT success');
				this.pendingFileOp.resolve();
				this.pendingFileOp = null;
			}
			return;
		}

		console.log('[WebREPL] Unknown binary message format');
	}

	/**
	 * Handle RAW REPL messages
	 */
	private _handleRawReplMessage(text: string): void {
		if (this.replState === 'ENTERING_RAW') {
			// Accumulate until we see the RAW REPL banner
			this.rawReplBuffer += text;
			if (this.rawReplBuffer.includes('raw REPL') && this.rawReplBuffer.includes('>')) {
				console.log('[RAW REPL] Entered RAW REPL mode');
				this.replState = 'RAW_REPL_READY';
				this.rawReplBuffer = '';
			}
			return; // Don't display
		}

		if (this.replState === 'RAW_REPL_READY') {
			// When idle in RAW REPL mode, we might receive JSON broadcasts (AUTO-INFO, etc.)
			const trimmed = text.trim();
			if (trimmed.startsWith('{') && trimmed.includes('"CMD"')) {
				try {
					const response = JSON.parse(trimmed);
					// It's a JSON command - handle it silently
					this._handleCommandResponse(response);
					return; // Done - don't display
				} catch (e) {
					console.warn('[RAW REPL] Received non-JSON data in RAW_REPL_READY state:', text);
				}
			}
			return; // Don't display anything in ready state
		}

		if (this.replState === 'WAITING_OK') {
			// Check for timeout
			if (Date.now() - this.codeSentTimestamp > this.replTimeout) {
				console.error('[RAW REPL] Timeout waiting for OK');
				this.replState = 'RAW_REPL_READY';
				if (this.rawReplReject) {
					this.rawReplReject(new Error('Timeout waiting for REPL response'));
					this.rawReplResolve = null;
					this.rawReplReject = null;
				}
				return;
			}

			// Check if message STARTS with "OK"
			if (text.startsWith('OK')) {
				console.log('[RAW REPL] Received OK, transitioning to RUNNING');
				this.replState = 'RUNNING';

				const remainingData = text.substring(2);
				if (remainingData.length > 0) {
					text = remainingData;
					// Fall through to RUNNING case
				} else {
					return;
				}
			}
		}

		if (this.replState === 'RUNNING') {
			// Accumulate output until we see EOF (\x04)
			this.rawReplBuffer += text;

			if (this.rawReplBuffer.includes('\x04')) {
				const parts = this.rawReplBuffer.split('\x04');
				
				if (parts.length >= 2) {
					const output = parts[0];
					const remaining = parts.slice(1).join('\x04');

					// Display output to terminal (not in silent mode)
					if (!this.silentMode && output) {
						this._notifyData(output, false);
					}

					this.replState = 'GOT_FIRST_EOF';
					this.rawReplBuffer = remaining;

					// Continue processing remaining data
					if (remaining) {
						this._handleRawReplMessage(remaining);
					}
				}
			}
			return;
		}

		if (this.replState === 'GOT_FIRST_EOF') {
			// Accumulate error output until second EOF
			this.rawReplBuffer += text;

			if (this.rawReplBuffer.includes('\x04')) {
				const parts = this.rawReplBuffer.split('\x04');
				const errorOutput = parts[0];

				// Display errors to terminal (in red)
				if (!this.silentMode && errorOutput) {
					this._notifyData(errorOutput, true);
				}

				// Check if there's a JSON response (for silent mode)
				let result = errorOutput;
				if (this.silentMode && this.jsonResponse) {
					result = this.jsonResponse;
					this.jsonResponse = null;
				}

				// Execution complete
				console.log('[RAW REPL] Execution complete');
				this.replState = 'RAW_REPL_READY';
				this.rawReplBuffer = '';

				if (this.rawReplResolve) {
					this.rawReplResolve(result);
					this.rawReplResolve = null;
					this.rawReplReject = null;
				}
			}
			return;
		}
	}

	/**
	 * Handle JSON command responses (including broadcasts)
	 */
	private _handleCommandResponse(response: any): void {
		const cmd = response.CMD;

		// Handle AUTO-INFO broadcasts
		if (cmd === 'AUTO-INFO') {
			this._onAutoInfo.fire(response.ARG);
			return;
		}

		// Handle PLOT-DATA-UPDATE broadcasts
		if (cmd === 'PLOT-DATA-UPDATE') {
			this._onPlotData.fire(response.ARG);
			return;
		}

		// Handle DISPLAY-UI commands (ScriptO UI plugin architecture)
		if (cmd === 'DISPLAY-UI') {
			console.log('[WebREPL] DISPLAY-UI command received:', response.ARG);
			this._onDisplayUI.fire(response.ARG);
			return;
		}

		// Find pending command handler
		if (this.pendingCommands.has(cmd)) {
			const handler = this.pendingCommands.get(cmd)!;
			this.pendingCommands.delete(cmd);
			handler.resolve(response.ARG);
		}
	}

	/**
	 * Check if command is a broadcast (not a response to a request)
	 */
	private _isBroadcastCommand(cmd: string): boolean {
		return cmd === 'AUTO-INFO' || cmd === 'PLOT-DATA-UPDATE' || cmd === 'DISPLAY-UI';
	}

	/**
	 * Notify data listeners
	 */
	private _notifyData(data: string, isError: boolean): void {
		this._onData.fire({ data, isError });
	}

	/**
	 * Ensure RAW REPL is ready
	 */
	async getPrompt(): Promise<void> {
		if (this.webreplState !== 'CONNECTED') {
			throw new Error('Not connected');
		}

		if (this.replState === 'RAW_REPL_READY') {
			return; // Already ready
		}

		// If code is running, interrupt it with Ctrl+C
		console.log('[RAW REPL] Interrupting running code with Ctrl+C');
		this.websocket?.send('\x03');

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				console.warn('[RAW REPL] Timeout waiting for interrupt response, forcing ready state');
				this.replState = 'RAW_REPL_READY';
				resolve();
			}, 2000);

			// Check periodically if we're ready
			const interval = setInterval(() => {
				if (this.replState === 'RAW_REPL_READY') {
					clearTimeout(timeout);
					clearInterval(interval);
					resolve();
				}
			}, 100);
		});
	}

	/**
	 * Execute code on device in RAW REPL mode
	 */
	async execRaw(code: string, silent = false): Promise<string> {
		if (this.bridgeWebview) {
			return await this.bridgeWebview.execRaw(code, silent);
		}

		await this.getPrompt();

		this.silentMode = silent;

		return new Promise((resolve, reject) => {
			this.rawReplResolve = resolve;
			this.rawReplReject = reject;
			this.rawReplBuffer = '';
			this.jsonResponse = null;

			// Send code
			this.replState = 'WAITING_OK';
			this.codeSentTimestamp = Date.now();
			this.websocket?.send(code);
			this.websocket?.send('\x04'); // Ctrl+D to execute

			console.log('[RAW REPL] Code sent, waiting for OK');
		});
	}

	/**
	 * Get file from device
	 */
	async getFile(remotePath: string): Promise<Uint8Array> {
		if (this.webreplState !== 'CONNECTED') {
			throw new Error('Not connected to device');
		}

		if (this.bridgeWebview) {
			return await this.bridgeWebview.getFile(remotePath);
		}

		return new Promise((resolve, reject) => {
			// Set timeout for file operation
			const timeout = setTimeout(() => {
				if (this.pendingFileOp) {
					this.pendingFileOp = null;
					reject(new Error('File get operation timed out'));
				}
			}, 30000); // 30 second timeout

			this.pendingFileOp = { 
				type: 'GET', 
				resolve: (data) => {
					clearTimeout(timeout);
					resolve(data);
				}, 
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				}
			};

			try {
				// Build GET request: "WA" + op(1) + path_len(2) + path
				const pathBytes = new TextEncoder().encode(remotePath);
				const header = new Uint8Array(4 + pathBytes.length);
				header[0] = 'W'.charCodeAt(0);
				header[1] = 'A'.charCodeAt(0);
				header[2] = this.WEBREPL_OP_GET_FILE;
				header[3] = pathBytes.length;
				header.set(pathBytes, 4);

				console.log('[WebREPL] Sending GET request for:', remotePath);
				this.websocket?.send(header);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingFileOp = null;
				reject(error);
			}
		});
	}

	/**
	 * Put file to device
	 */
	async putFile(remotePath: string, data: Uint8Array): Promise<void> {
		if (this.webreplState !== 'CONNECTED') {
			throw new Error('Not connected to device');
		}

		if (this.bridgeWebview) {
			return await this.bridgeWebview.putFile(remotePath, data);
		}

		return new Promise((resolve, reject) => {
			// Set timeout for file operation
			const timeout = setTimeout(() => {
				if (this.pendingFileOp) {
					this.pendingFileOp = null;
					reject(new Error('File put operation timed out'));
				}
			}, 30000); // 30 second timeout

			this.pendingFileOp = { 
				type: 'PUT', 
				resolve: () => {
					clearTimeout(timeout);
					resolve();
				}, 
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				}, 
				data 
			};

			try {
				// Build PUT request: "WA" + op(1) + path_len(2) + path + file_size(4) + data
				const pathBytes = new TextEncoder().encode(remotePath);
				const header = new Uint8Array(4 + pathBytes.length + 4 + data.length);
				
				let offset = 0;
				header[offset++] = 'W'.charCodeAt(0);
				header[offset++] = 'A'.charCodeAt(0);
				header[offset++] = this.WEBREPL_OP_PUT_FILE;
				header[offset++] = pathBytes.length;
				header.set(pathBytes, offset);
				offset += pathBytes.length;
				
				// File size (little-endian)
				header[offset++] = data.length & 0xFF;
				header[offset++] = (data.length >> 8) & 0xFF;
				header[offset++] = (data.length >> 16) & 0xFF;
				header[offset++] = (data.length >> 24) & 0xFF;
				
				header.set(data, offset);

				console.log('[WebREPL] Sending PUT request for:', remotePath, 'size:', data.length);
				this.websocket?.send(header);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingFileOp = null;
				reject(error);
			}
		});
	}

	/**
	 * List files in directory
	 */
	async listDir(path: string): Promise<any[]> {
		if (this.bridgeWebview) {
			return await this.bridgeWebview.listDir(path);
		}

		// Fallback: direct execution
		const code = `
import os
import json
try:
    items = []
    for name in os.listdir('${path}'):
        full_path = '${path}' + '/' + name if '${path}' != '/' else '/' + name
        try:
            stat = os.stat(full_path)
            is_dir = stat[0] & 0x4000 != 0
            size = stat[6] if not is_dir else 0
            items.append({'name': name, 'type': 'dir' if is_dir else 'file', 'size': size})
        except:
            items.append({'name': name, 'type': 'unknown', 'size': 0})
    print(json.dumps(items))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
		const result = await this.execRaw(code, true);
		try {
			const parsed = JSON.parse(result);
			if (parsed.error) {
				throw new Error(parsed.error);
			}
			return parsed;
		} catch (e) {
			throw new Error('Failed to parse directory listing');
		}
	}

	/**
	 * Delete file or directory
	 */
	async deleteFile(path: string): Promise<void> {
		const code = `
import os
def rmdir(path):
    for item in os.listdir(path):
        full_path = path + '/' + item
        try:
            os.rmdir(full_path)
        except:
            os.remove(full_path)
    os.rmdir(path)

try:
    try:
        os.remove('${path}')
    except:
        rmdir('${path}')
    print('OK')
except Exception as e:
    print('ERROR:', str(e))
`;
		await this.execRaw(code, true);
	}

	/**
	 * Create directory
	 */
	async mkdir(path: string): Promise<void> {
		const code = `
import os
try:
    os.mkdir('${path}')
    print('OK')
except Exception as e:
    print('ERROR:', str(e))
`;
		await this.execRaw(code, true);
	}

	/**
	 * Rename/move file
	 */
	async rename(oldPath: string, newPath: string): Promise<void> {
		const code = `
import os
try:
    os.rename('${oldPath}', '${newPath}')
    print('OK')
except Exception as e:
    print('ERROR:', str(e))
`;
		await this.execRaw(code, true);
	}
}

