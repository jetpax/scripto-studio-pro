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
 * Additional permissions under GNU GPL version 3 section 7:
 *
 * If you modify this Program, or any covered work, by linking or
 * combining it with OpenSSL (or a modified version of that library),
 * containing parts covered by the terms of GPL version 2, the licensors
 * of this Program grant you additional permission to convey the
 * resulting work.
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from './webrepl/connection';
import { DeviceFileSystemProvider } from './fileSystem/deviceFS';
import { DeviceTreeProvider } from './fileSystem/treeProvider';
import { TerminalWebviewProvider } from './webview/terminal';
import { DeviceUIWebviewProvider } from './webview/deviceUI';
import { SystemWebviewProvider } from './webview/system';
import { StatusBarManager } from './statusBar';
import { WebREPLBridgeWebview } from './webview/webreplBridge';
import { scanScriptOsFiles } from './scriptos/scanner';
import { generateScriptOsCode } from './scriptos/parser';
import { ScriptOConfigWebviewProvider } from './webview/scriptoConfig';
import { AIAgentWebviewProvider } from './webview/aiAgent';

let connection: WebREPLConnection;
let bridgeWebview: WebREPLBridgeWebview;
let statusBar: StatusBarManager;
let deviceFS: DeviceFileSystemProvider;
let deviceTree: DeviceTreeProvider;
let terminalProvider: TerminalWebviewProvider;
let deviceUIProvider: DeviceUIWebviewProvider;
let systemProvider: SystemWebviewProvider;
let scriptoConfigProvider: ScriptOConfigWebviewProvider;
let aiAgentProvider: AIAgentWebviewProvider;
let outputChannel: vscode.OutputChannel;
let context: vscode.ExtensionContext;
let activationTime: number;

export function activate(extensionContext: vscode.ExtensionContext) {
	context = extensionContext;
	activationTime = Date.now();
	// Create output channel for debugging
	outputChannel = vscode.window.createOutputChannel('ScriptO Studio Pro');
	context.subscriptions.push(outputChannel);
	
	outputChannel.appendLine('ScriptO Studio Pro extension activated');
	
	console.log('ScriptO Studio Pro extension is now active');
	
	// Initialize bridge webview (runs WebSocket in browser context)
	bridgeWebview = new WebREPLBridgeWebview(context.extensionUri, outputChannel);

	// Initialize connection manager (proxies to bridge webview)
	connection = new WebREPLConnection(outputChannel, bridgeWebview);
	
	// CRITICAL: Register file system provider IMMEDIATELY before VS Code tries to restore files
	// This must happen before any UI operations to prevent "No file system provider" errors
	deviceFS = new DeviceFileSystemProvider(connection);
	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider('webrepl', deviceFS, {
			isCaseSensitive: true
		})
	);

	// Wire up bridge webview callbacks to connection events
	bridgeWebview.setCallbacks({
		onConnected: () => {
			connection.internalSetConnected();
			// Fire the connected event
			(connection as any)._onConnected.fire();
		},
		onDisconnected: () => {
			connection.internalSetDisconnected();
			// Fire the disconnected event
			(connection as any)._onDisconnected.fire();
		},
		onData: (data: string, isError: boolean) => {
			connection.internalFireData(data, isError);
		},
		onAutoInfo: (info: any) => {
			connection.internalFireAutoInfo(info);
		},
		onDisplayUI: (uiData: any) => {
			connection.internalFireDisplayUI(uiData);
		},
		onPlotData: (plotData: any) => {
			connection.internalFirePlotData(plotData);
		},
		onShowPrompt: () => {
			terminalProvider.showPrompt();
		}
	});

	// Initialize status bar
	statusBar = new StatusBarManager(connection);
	context.subscriptions.push(statusBar);
	
	// Update context state for when clauses
	vscode.commands.executeCommand('setContext', 'micropython.executing', false);
	
	connection.onConnected(() => {
		vscode.commands.executeCommand('setContext', 'micropython.connected', true);
		vscode.commands.executeCommand('setContext', 'micropython.executing', false);
	});
	connection.onDisconnected(() => {
		vscode.commands.executeCommand('setContext', 'micropython.connected', false);
		vscode.commands.executeCommand('setContext', 'micropython.executing', false);
	});
	
	// Listen for AUTO-INFO broadcasts and update status bar
	connection.onAutoInfo((info: any) => {
		statusBar.updateDeviceInfo(info);
	});

	// Initialize device tree view
	deviceTree = new DeviceTreeProvider(connection);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('micropythonDeviceFiles', deviceTree)
	);

	// Initialize terminal webview
	terminalProvider = new TerminalWebviewProvider(context.extensionUri, connection);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('micropythonTerminal', terminalProvider)
	);

	// Initialize device UI webview
	deviceUIProvider = new DeviceUIWebviewProvider(context.extensionUri, connection);

	// Initialize system webview
	systemProvider = new SystemWebviewProvider(context.extensionUri, connection);

	// Initialize ScriptO config webview
	scriptoConfigProvider = new ScriptOConfigWebviewProvider(context.extensionUri);

	// Initialize AI Agent webview (secondary sidebar)
	// Register the provider (view is declared in package.json)
	aiAgentProvider = new AIAgentWebviewProvider(context.extensionUri, scriptoConfigProvider);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('micropythonAIAgent', aiAgentProvider)
	);

	// Register commands
	registerCommands(context);
	
	// Populate any empty untitled editors with our welcome template
	// VS Code sometimes creates an Untitled-1 when no editors are open
	setTimeout(async () => {
		try {
			const editors = vscode.window.visibleTextEditors;
			for (const editor of editors) {
				if (editor.document.isUntitled && editor.document.getText().trim() === '') {
					const template = `# ScriptO Studio for MicroPython



print('Hello, ScriptO!')
`;
					await editor.edit((editBuilder) => {
						editBuilder.insert(new vscode.Position(0, 0), template);
					});
					// Set language to Python
					await vscode.languages.setTextDocumentLanguage(editor.document, 'python');
				}
			}
		} catch (error) {
			console.log('Error populating untitled with template:', error);
		}
	}, 500);
	
	// Auto-open ScriptO Studio extension view after cleanup
	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.scripto-studio-pro');
		} catch (error) {
			// View might not be available yet, ignore
			console.log('Could not auto-open ScriptO Studio view:', error);
		}
	}, 1500);
	
	// Show connection dialog on startup if not already connected
	setTimeout(async () => {
		if (!connection.isConnected()) {
			const result = await vscode.window.showInformationMessage(
				'Connect to your MicroPython device to get started',
				'Connect',
				'Later'
			);
			
			if (result === 'Connect') {
				await vscode.commands.executeCommand('micropython.connect');
			}
		}
	}, 2000);

	// Listen for connection events
	connection.onConnected(async () => {
		deviceTree.refresh();
		vscode.window.showInformationMessage('Connected to device');
		
		// Auto-open ScriptO Studio extension view
		try {
			await vscode.commands.executeCommand('workbench.view.extension.scripto-studio-pro');
		} catch (error) {
			// View might not be available yet, ignore
			console.log('Could not open ScriptO Studio view:', error);
		}
	});
	
	// Handle webrepl:// files from previous sessions gracefully
	// Close them immediately on startup if not connected (handled by cleanupUnwantedTabs above)
	// Also handle any new webrepl files that get opened when not connected
	const webreplFilesFromRestore = new Set<string>();
	let hasShownMessage = false;
	
	vscode.workspace.onDidOpenTextDocument(async (document) => {
		if (document.uri.scheme === 'webrepl' && !connection.isConnected()) {
			const uriString = document.uri.toString();
			
			// Only process each file once
			if (!webreplFilesFromRestore.has(uriString)) {
				webreplFilesFromRestore.add(uriString);
				
				// Close the document immediately to avoid errors
				setTimeout(async () => {
					try {
						// Find all editors showing this document
						const editors = vscode.window.visibleTextEditors.filter(
							e => e.document.uri.toString() === uriString
						);
						
						// Close each editor
						for (const editor of editors) {
							const doc = editor.document;
							await vscode.window.showTextDocument(doc);
							await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
						}
					} catch (error) {
						console.log('Error closing webrepl file:', error);
					}
					
					// Show message once (only after startup phase)
					if (!hasShownMessage && Date.now() - activationTime > 2000) {
						hasShownMessage = true;
						vscode.window.showInformationMessage(
							'Device files from previous session were closed. Connect to device to access them.',
							'Connect'
						).then(action => {
							if (action === 'Connect') {
								vscode.commands.executeCommand('micropython.connect');
							}
						});
					}
				}, 100);
			}
		}
	});

	// Listen for new untitled Python files and insert template
	// Use a small delay to ensure document is fully initialized
	// Skip during initial activation to avoid interfering with session restore
	const pendingTemplates = new Set<string>();
	let extensionReady = false;
	
	// Mark extension as ready after startup phase
	setTimeout(() => {
		extensionReady = true;
	}, 2000);
	
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async (document) => {
			// Skip during startup/restore phase
			if (!extensionReady) {
				return;
			}
			
			// Only handle new untitled Python files
			if (document.isUntitled && document.languageId === 'python') {
				const docId = document.uri.toString();
				// Skip if we've already processed this document
				if (pendingTemplates.has(docId)) {
					return;
				}
				
				const text = document.getText();
				// Only add template if file is completely empty
				if (text.trim() === '') {
					pendingTemplates.add(docId);
					// Small delay to ensure document is ready
					setTimeout(async () => {
						try {
							const editor = await vscode.window.showTextDocument(document);
							const currentText = document.getText();
						// Double-check it's still empty (user might have typed)
						if (currentText.trim() === '') {
							const template = `# ScriptO Studio for MicroPython



print('Hello, ScriptO!')
`;
								await editor.edit((editBuilder) => {
									editBuilder.insert(new vscode.Position(0, 0), template);
								});
							}
						} catch (error) {
							// Ignore errors
						} finally {
							pendingTemplates.delete(docId);
						}
					}, 100);
				}
			}
		})
	);

	connection.onDisconnected(() => {
		deviceTree.refresh();
	});

	connection.onAutoInfo((info: any) => {
		// Update status bar with device info
		statusBar.updateDeviceInfo(info);
	});

	connection.onDisplayUI((uiData: any) => {
		// Show device UI in webview
		deviceUIProvider.showDeviceUI(uiData);
	});

	// Auto-connect if configured
	const config = vscode.workspace.getConfiguration('micropython');
	if (config.get<boolean>('autoConnect')) {
		vscode.commands.executeCommand('micropython.connect');
	}
}

function registerCommands(context: vscode.ExtensionContext) {
	// File commands
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.openFile', async (filePath: string) => {
			try {
				if (!connection.isConnected()) {
					vscode.window.showErrorMessage('Not connected to device');
					return;
				}

				outputChannel.appendLine(`Opening file: ${filePath}`);
				
				// Use webrepl:// URI so DeviceFileSystemProvider handles saves
				const uri = vscode.Uri.parse(`webrepl:${filePath}`);
				
				// Verify file exists first by checking stat
				try {
					await deviceFS.stat(uri);
				} catch (statError: any) {
					vscode.window.showErrorMessage(`File not found: ${filePath}`);
					outputChannel.appendLine(`Error: File not found: ${filePath} - ${statError.message}`);
					return;
				}
				
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc);
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
				outputChannel.appendLine(`Error opening file: ${error.message}`);
				console.error('Error opening file:', error);
			}
		})
	);
	
	// Connection commands
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.connect', async () => {
			await connectToDevice();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.disconnect', async () => {
			await connection.disconnect();
			vscode.window.showInformationMessage('Disconnected from device');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.reconnect', async () => {
			await connection.disconnect();
			await connectToDevice();
		})
	);

	// File operations
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.uploadFile', async (uri?: vscode.Uri) => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			// Get file from workspace or active editor
			let fileUri = uri;
			if (!fileUri && vscode.window.activeTextEditor) {
				fileUri = vscode.window.activeTextEditor.document.uri;
			}

			if (!fileUri) {
				vscode.window.showErrorMessage('No file selected');
				return;
			}

			try {
				const content = await vscode.workspace.fs.readFile(fileUri);
				const fileName = fileUri.path.split('/').pop();
				const remotePath = await vscode.window.showInputBox({
					prompt: 'Enter remote path on device',
					value: `/${fileName}`,
					placeHolder: '/main.py'
				});

				if (!remotePath) {
					return;
				}

				await connection.putFile(remotePath, content);
				vscode.window.showInformationMessage(`Uploaded ${fileName} to ${remotePath}`);
				deviceTree.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to upload file: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.downloadFile', async (item: any) => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			try {
				const remotePath = item.path;
				const fileName = remotePath.split('/').pop();

				// Open file in editor from webrepl:// URI
				const uri = vscode.Uri.parse(`webrepl:${remotePath}`);
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to download file: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.deleteFile', async (item: any) => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const remotePath = item.path;
			const fileName = remotePath.split('/').pop();

			const confirm = await vscode.window.showWarningMessage(
				`Delete ${fileName} from device?`,
				{ modal: true },
				'Delete'
			);

			if (confirm !== 'Delete') {
				return;
			}

			try {
				await connection.deleteFile(remotePath);
				vscode.window.showInformationMessage(`Deleted ${fileName}`);
				deviceTree.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to delete file: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.renameFile', async (item: any) => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const oldPath = item.path;
			const oldName = oldPath.split('/').pop();

			const newName = await vscode.window.showInputBox({
				prompt: 'Enter new name',
				value: oldName,
				placeHolder: 'new_name.py'
			});

			if (!newName || newName === oldName) {
				return;
			}

			const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;

			try {
				await connection.rename(oldPath, newPath);
				vscode.window.showInformationMessage(`Renamed ${oldName} to ${newName}`);
				deviceTree.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to rename file: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.createFile', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const fileName = await vscode.window.showInputBox({
				prompt: 'Enter file name',
				placeHolder: 'new_file.py'
			});

			if (!fileName) {
				return;
			}

		const remotePath = `/${fileName}`;
		const defaultContent = `# ScriptO Studio for MicroPython



print('Hello, ScriptO!')
`;

			try {
				await connection.putFile(remotePath, new TextEncoder().encode(defaultContent));
				vscode.window.showInformationMessage(`Created ${fileName}`);
				deviceTree.refresh();

				// Open the new file
				const uri = vscode.Uri.parse(`webrepl:${remotePath}`);
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to create file: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.createFolder', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const folderName = await vscode.window.showInputBox({
				prompt: 'Enter folder name',
				placeHolder: 'new_folder'
			});

			if (!folderName) {
				return;
			}

			const remotePath = `/${folderName}`;

			try {
				await connection.mkdir(remotePath);
				vscode.window.showInformationMessage(`Created folder ${folderName}`);
				deviceTree.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.refreshFiles', async () => {
			deviceTree.refresh();
		})
	);

	// Execution commands
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.runCurrentFile', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor');
				return;
			}

			// Get code directly from editor document - this works even if file is unsaved
			// We read from the in-memory document, not from disk, so no save is needed
			const document = editor.document;
			const code = document.getText();
			if (!code.trim()) {
				vscode.window.showErrorMessage('File is empty');
				return;
			}

			// Check if document is dirty (unsaved) - if so, we can still run it
			const isDirty = document.isDirty;
			if (isDirty) {
				// Document has unsaved changes - we can still execute it
				// VS Code may show a save dialog, but we'll use the in-memory content regardless
				console.log('[Run File] Executing unsaved file content');
			}

		try {
			// Set executing context
			vscode.commands.executeCommand('setContext', 'micropython.executing', true);
			
			terminalProvider.show();
			// Execute code directly from in-memory document - no file save required
			await connection.execRaw(code, false);
			// Don't show notification - output is visible in terminal
		} catch (error) {
			vscode.window.showErrorMessage(`Execution failed: ${error}`);
		} finally {
			// Clear executing context
			vscode.commands.executeCommand('setContext', 'micropython.executing', false);
		}
	})
);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.runSelection', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor || !editor.selection) {
				vscode.window.showErrorMessage('No selection');
				return;
			}

			const code = editor.document.getText(editor.selection);
			if (!code.trim()) {
				vscode.window.showErrorMessage('Selection is empty');
				return;
			}

		try {
			terminalProvider.show();
			await connection.execRaw(code, false);
			// Don't show notification - output is visible in terminal
		} catch (error) {
			vscode.window.showErrorMessage(`Execution failed: ${error}`);
		}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.interrupt', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}
			connection.interrupt();
			// Clear executing context
			vscode.commands.executeCommand('setContext', 'micropython.executing', false);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.stopExecution', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}
			connection.interrupt();
			// Clear executing context
			vscode.commands.executeCommand('setContext', 'micropython.executing', false);
		})
	);

	// UI commands
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.showTerminal', async () => {
			terminalProvider.show();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.clearTerminal', async () => {
			terminalProvider.clear();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.showDeviceUI', async () => {
			if (!connection.isConnected()) {
				vscode.window.showErrorMessage('Not connected to device');
				return;
			}

			const url = await vscode.window.showInputBox({
				prompt: 'Enter device UI URL',
				placeHolder: 'http://192.168.4.1/ui',
				value: 'http://192.168.4.1/'
			});

			if (url) {
				deviceUIProvider.showDeviceUI({ url, title: 'Device UI' });
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.closeDeviceUI', async () => {
			deviceUIProvider.close();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.showSystem', async () => {
			systemProvider.showSystem();
		})
	);

	// AI Agent commands
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.toggleAIAgent', async () => {
			await aiAgentProvider.show();
		})
	);

	// Add Scripto command
	context.subscriptions.push(
		vscode.commands.registerCommand('micropython.addScripto', async () => {
			console.log('[Add Scripto] Command invoked');
			try {
				outputChannel.appendLine('[Add Scripto] Scanning for ScriptOs...');
				console.log('[Add Scripto] Scanning for ScriptOs...');
				outputChannel.appendLine(`[Add Scripto] Workspace folders: ${vscode.workspace.workspaceFolders?.length || 0}`);
				console.log(`[Add Scripto] Workspace folders: ${vscode.workspace.workspaceFolders?.length || 0}`);
				if (vscode.workspace.workspaceFolders) {
					for (const folder of vscode.workspace.workspaceFolders) {
						outputChannel.appendLine(`  - ${folder.uri.fsPath}`);
				console.log(`  - ${folder.uri.fsPath}`);
				}
			}

			// Scan for ScriptOs
			console.log('[Add Scripto] Calling scanScriptOsFiles...');
			const scriptOsList = await scanScriptOsFiles();

			console.log(`[Add Scripto] Found ${scriptOsList.length} ScriptOs`);

				if (scriptOsList.length === 0) {
					const message = 'No ScriptOs found. Please open the workspace folder that contains your ScriptOs/ directory (File > Open Folder).';
					outputChannel.appendLine(`[Add Scripto] ${message}`);
					
					// Show a more helpful message with a button to open folder
					const action = await vscode.window.showWarningMessage(
						message,
						'Open Folder'
					);
					
					if (action === 'Open Folder') {
						const folderUri = await vscode.window.showOpenDialog({
							canSelectFiles: false,
							canSelectFolders: true,
							canSelectMany: false,
							openLabel: 'Select Folder with ScriptOs'
						});
						
					if (folderUri && folderUri[0]) {
						await vscode.commands.executeCommand('vscode.openFolder', folderUri[0]);
						// Retry scanning after opening folder
						const retryList = await scanScriptOsFiles();
						if (retryList.length > 0) {
							// Continue with the scriptOs list
							scriptOsList.push(...retryList);
							} else {
								vscode.window.showWarningMessage('Still no ScriptOs found. Make sure the folder contains a ScriptOs/ subdirectory.');
								return;
							}
						} else {
							return;
						}
					} else {
						return;
					}
				}

				// Create QuickPick items
				const items = scriptOsList.map(scripto => {
					const info = scripto.config.info || {};
					const name = info.name || scripto.filename;
					const description = info.description || '';
					const category = info.category || '';
					const version = info.version ? 
						(Array.isArray(info.version) ? `v${info.version.join('.')}` : `v${info.version}`) : 
						'v1.0.0';

					return {
						label: name,
						description: description || category,
						detail: category ? `${category} • ${version}` : version,
						scripto: scripto
					};
				});

				// Show QuickPick
				const selected = await vscode.window.showQuickPick(items, {
					placeHolder: 'Select a ScriptO to add...',
					matchOnDescription: true,
					matchOnDetail: true
				});

				if (!selected) {
					return; // User cancelled
				}

				const scripto = selected.scripto;

				// Check if ScriptO has args that need configuration
				const hasArgs = scripto.config.args && 
					typeof scripto.config.args === 'object' && 
					Object.keys(scripto.config.args).length > 0;

				let userArgs: { [key: string]: any } = {};

				if (hasArgs) {
					// Open config webview
					try {
						userArgs = await scriptoConfigProvider.showConfig(scripto);
					} catch (error: any) {
						if (error.message !== 'Configuration cancelled') {
							vscode.window.showErrorMessage(`Configuration error: ${error.message}`);
						}
						return; // User cancelled
					}
				}

				// Generate code with user args
				const generatedCode = generateScriptOsCode(
					scripto.content,
					scripto.config,
					userArgs
				);

				// Check if ScriptO should run silently (for UI-based ScriptOs)
				const shouldAddSilentFlag = scripto.config.silent === true;
				const finalCode = shouldAddSilentFlag ? `# SCRIPTOS_SILENT: True\n${generatedCode}` : generatedCode;

				// Generate filename from ScriptO name
				const info = scripto.config.info || {};
				let filename = (info.name || scripto.filename.replace('.py', ''))
					.replace(/[^a-zA-Z0-9]/g, '_') + '.py';

				// Create new untitled file
				const doc = await vscode.workspace.openTextDocument({
					language: 'python',
					content: finalCode
				});
				await vscode.window.showTextDocument(doc);

				vscode.window.showInformationMessage(`Added ${scripto.config.info?.name || scripto.filename}`);
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to add Scripto: ${error.message}`);
				console.error('[Add Scripto] Error:', error);
			}
		})
	);
}

async function connectToDevice() {
	const config = vscode.workspace.getConfiguration('micropython');
	
	// Get last successful connection settings from global state
	const lastIP = context.globalState.get<string>('lastConnectionIP');
	const lastPassword = context.globalState.get<string>('lastConnectionPassword');
	
	// Use last successful settings, fallback to config, then default
	const defaultIP = lastIP || config.get<string>('defaultIP') || '192.168.4.1';
	const ipAddress = await vscode.window.showInputBox({
		prompt: 'Enter device IP address',
		value: defaultIP,
		placeHolder: '192.168.4.1'
	});

	if (!ipAddress) {
		return;
	}

	// Prompt for password (use last password if available, but don't show it for security)
	const password = await vscode.window.showInputBox({
		prompt: 'Enter WebREPL password' + (lastPassword ? ' (leave empty to use saved password)' : ''),
		value: '',
		password: true,
		placeHolder: lastPassword ? 'Press Enter to use saved password' : 'WebREPL password',
		ignoreFocusOut: false
	});

	if (password === undefined) {
		return; // User cancelled
	}

	// If user left it empty and we have a saved password, use that
	// Otherwise use what they entered (even if empty, let connection fail naturally)
	const actualPassword = (password === '' && lastPassword) ? lastPassword : password;

	try {
		const wsUrl = `ws://${ipAddress}/webrepl`;
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Connecting to device...',
				cancellable: false
			},
			async (progress) => {
				progress.report({ increment: 0 });
				await connection.connect(wsUrl, actualPassword);
				progress.report({ increment: 100 });
			}
		);
		
		// Save successful connection settings
		await context.globalState.update('lastConnectionIP', ipAddress);
		await context.globalState.update('lastConnectionPassword', actualPassword);
		
		vscode.window.showInformationMessage('Connected to device');
	} catch (error: any) {
		vscode.window.showErrorMessage(`Connection failed: ${error.message}`);
	}
}

export function deactivate() {
	if (connection) {
		connection.disconnect();
	}
}

