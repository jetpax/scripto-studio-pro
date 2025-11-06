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
 * ScriptO File Scanner
 * Scans workspace for ScriptOs in ScriptOs/ folder
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseScriptOsConfig } from './parser';

export interface ScriptOFile {
	filename: string;
	fullPath: string;
	content: string;
	config: any;
}

/**
 * Scan workspace for ScriptOs files
 * @param outputChannel Optional output channel for logging
 * @returns Array of ScriptO files with parsed config
 */
export async function scanScriptOsFiles(outputChannel?: vscode.OutputChannel): Promise<ScriptOFile[]> {
	const scriptOsList: ScriptOFile[] = [];
	const log = (message: string) => {
		console.log(message); // Always log to console
		if (outputChannel) {
			outputChannel.appendLine(message);
		}
	};
	const warn = (message: string) => {
		console.warn(message); // Always log to console
		if (outputChannel) {
			outputChannel.appendLine(`WARN: ${message}`);
		}
	};
	const error = (message: string, e?: any) => {
		console.error(message, e); // Always log to console
		if (outputChannel) {
			outputChannel.appendLine(`ERROR: ${message}`);
			if (e) {
				outputChannel.appendLine(`  ${e.message || e}`);
				if (e.stack) {
					outputChannel.appendLine(`  ${e.stack}`);
				}
			}
		}
	};
	
	log('[ScriptOs Scanner] scanScriptOsFiles called');

	// Get workspace folders
	let workspaceFolders = vscode.workspace.workspaceFolders;
	
	// Helper function to check if ScriptOs folder exists at a path
	async function findScriptOsFolder(startDir: vscode.Uri): Promise<vscode.Uri | null> {
		let currentDir = startDir;
		
		// Walk up the directory tree to find ScriptOs folder
		for (let i = 0; i < 10; i++) { // Max 10 levels up
			log(`[ScriptOs Scanner] Checking directory: ${currentDir.fsPath}`);
			
			// Try uppercase ScriptOs
			const testScriptOsPath = vscode.Uri.joinPath(currentDir, 'ScriptOs');
			try {
				const stat = await vscode.workspace.fs.stat(testScriptOsPath);
				if (stat.type === vscode.FileType.Directory) {
					log(`[ScriptOs Scanner] ✓ Found ScriptOs folder: ${testScriptOsPath.fsPath}`);
					return currentDir;
				}
			} catch (e: any) {
				log(`[ScriptOs Scanner] ScriptOs not found at: ${testScriptOsPath.fsPath} (${e.message})`);
			}
			
			// Try lowercase scriptos
			const testScriptOsPathLower = vscode.Uri.joinPath(currentDir, 'scriptos');
			try {
				const stat = await vscode.workspace.fs.stat(testScriptOsPathLower);
				if (stat.type === vscode.FileType.Directory) {
					log(`[ScriptOs Scanner] ✓ Found scriptos folder (lowercase): ${testScriptOsPathLower.fsPath}`);
					return currentDir;
				}
			} catch {
				// Not found, continue up
			}
			
			// Go up one level
			const parentDir = vscode.Uri.joinPath(currentDir, '..');
			if (parentDir.fsPath === currentDir.fsPath) {
				// Reached root, stop
				log(`[ScriptOs Scanner] Reached filesystem root at: ${currentDir.fsPath}`);
				break;
			}
			currentDir = parentDir;
		}
		
		return null;
	}
	
	// If no workspace folders, try to find ScriptOs folder by searching up from active file
	if (!workspaceFolders || workspaceFolders.length === 0) {
		warn('[ScriptOs Scanner] No workspace folders found, searching from active editor...');
		
		// Strategy 1: Check if there's an active file editor
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && activeEditor.document.uri.scheme === 'file') {
			const filePath = activeEditor.document.uri;
			const fileDir = vscode.Uri.joinPath(filePath, '..');
			log(`[ScriptOs Scanner] Active file: ${filePath.fsPath}`);
			log(`[ScriptOs Scanner] Starting search from: ${fileDir.fsPath}`);
			
			const foundDir = await findScriptOsFolder(fileDir);
			if (foundDir) {
				const fakeFolder: vscode.WorkspaceFolder = {
					uri: foundDir,
					name: path.basename(foundDir.fsPath),
					index: 0
				};
				workspaceFolders = [fakeFolder];
			}
		} else {
			warn('[ScriptOs Scanner] No active file editor found');
		}
		
		if (!workspaceFolders || workspaceFolders.length === 0) {
			warn('[ScriptOs Scanner] Could not find ScriptOs folder');
			warn('[ScriptOs Scanner] Please open a workspace folder (File > Open Folder) that contains a ScriptOs/ directory');
			warn('[ScriptOs Scanner] Or open a file from the project directory');
			return scriptOsList;
		}
	}

	// Helper function to search subdirectories for ScriptOs folder
	async function searchSubdirectories(rootDir: vscode.Uri, maxDepth: number): Promise<vscode.Uri | null> {
		if (maxDepth <= 0) return null;
		
		try {
			const entries = await vscode.workspace.fs.readDirectory(rootDir);
			for (const [name, type] of entries) {
				if (type === vscode.FileType.Directory) {
					// Skip hidden directories and common ignore patterns
					if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') {
						continue;
					}
					
					const subDir = vscode.Uri.joinPath(rootDir, name);
					const scriptOsPath = vscode.Uri.joinPath(subDir, 'ScriptOs');
					const scriptOsPathLower = vscode.Uri.joinPath(subDir, 'scriptos');
					
					// Check for ScriptOs in this subdirectory
					try {
						const stat = await vscode.workspace.fs.stat(scriptOsPath);
						if (stat.type === vscode.FileType.Directory) {
							log(`[ScriptOs Scanner] ✓ Found ScriptOs in subdirectory: ${scriptOsPath.fsPath}`);
							return subDir;
						}
					} catch {
						try {
							const stat = await vscode.workspace.fs.stat(scriptOsPathLower);
							if (stat.type === vscode.FileType.Directory) {
								log(`[ScriptOs Scanner] ✓ Found scriptos (lowercase) in subdirectory: ${scriptOsPathLower.fsPath}`);
								return subDir;
							}
						} catch {
							// Not found, recurse deeper
							const found = await searchSubdirectories(subDir, maxDepth - 1);
							if (found) return found;
						}
					}
				}
			}
		} catch (e: any) {
			log(`[ScriptOs Scanner] Error searching subdirectories in ${rootDir.fsPath}: ${e.message}`);
		}
		
		return null;
	}

	log(`[ScriptOs Scanner] Scanning ${workspaceFolders.length} workspace folder(s)`);

	// Try each workspace folder
	for (const folder of workspaceFolders) {
		log(`[ScriptOs Scanner] Processing workspace folder: ${folder.name} (${folder.uri.fsPath})`);
		
		// Check if the workspace folder itself is named "ScriptOs" or "scriptos"
		const folderName = path.basename(folder.uri.fsPath);
		const isScriptOsFolder = folderName === 'ScriptOs' || folderName === 'scriptos';
		
		let scriptOsPath: vscode.Uri | null = null;
		
		if (isScriptOsFolder) {
			// The workspace folder IS the ScriptOs folder - scan it directly
			log(`[ScriptOs Scanner] Workspace folder is the ScriptOs folder itself - scanning directly`);
			scriptOsPath = folder.uri;
		} else {
			// Look for ScriptOs folder inside the workspace
			const directPath = vscode.Uri.joinPath(folder.uri, 'ScriptOs');
			const lowerPath = vscode.Uri.joinPath(folder.uri, 'scriptos');
			
			// Try uppercase first
			try {
				const stat = await vscode.workspace.fs.stat(directPath);
				if (stat.type === vscode.FileType.Directory) {
					scriptOsPath = directPath;
					log(`[ScriptOs Scanner] ✓ Found ScriptOs folder at: ${directPath.fsPath}`);
				} else {
					warn(`[ScriptOs Scanner] ${directPath.fsPath} exists but is not a directory`);
				}
			} catch (e: any) {
				// Try lowercase
				try {
					const stat = await vscode.workspace.fs.stat(lowerPath);
					if (stat.type === vscode.FileType.Directory) {
						scriptOsPath = lowerPath;
						log(`[ScriptOs Scanner] ✓ Found scriptos folder (lowercase) at: ${lowerPath.fsPath}`);
					}
				} catch (e2: any) {
					log(`[ScriptOs Scanner] ScriptOs folder not found in workspace root: ${folder.uri.fsPath}`);
					// Try searching subdirectories (max 2 levels deep)
					const found = await searchSubdirectories(folder.uri, 2);
					if (found) {
						// Found ScriptOs in a subdirectory, use that as the base
						const foundScriptOsPath = vscode.Uri.joinPath(found, 'ScriptOs');
						const foundScriptOsPathLower = vscode.Uri.joinPath(found, 'scriptos');
						try {
							await vscode.workspace.fs.stat(foundScriptOsPath);
							scriptOsPath = foundScriptOsPath;
						} catch {
							try {
								await vscode.workspace.fs.stat(foundScriptOsPathLower);
								scriptOsPath = foundScriptOsPathLower;
							} catch {
								// Shouldn't happen, but just in case
								warn(`[ScriptOs Scanner] ScriptOs path not found even though directory was detected`);
							}
						}
					}
				}
			}
		}
		
		// If ScriptOs folder found, process it
		if (scriptOsPath) {
			try {
				const files = await vscode.workspace.fs.readDirectory(scriptOsPath);
				log(`[ScriptOs Scanner] Found ${files.length} items in ScriptOs directory`);
				await processScriptOsFiles(scriptOsPath, files, scriptOsList, log, warn, error);
			} catch (e: any) {
				error(`[ScriptOs Scanner] Error reading ScriptOs directory ${scriptOsPath.fsPath}`, e);
			}
		} else {
			warn(`[ScriptOs Scanner] No ScriptOs folder found in workspace: ${folder.uri.fsPath}`);
		}
	}

	log(`[ScriptOs Scanner] Successfully loaded ${scriptOsList.length} ScriptOs`);
	return scriptOsList;
}

async function processScriptOsFiles(
	scriptOsPath: vscode.Uri,
	files: [string, vscode.FileType][],
	scriptOsList: ScriptOFile[],
	log: (msg: string) => void,
	warn: (msg: string) => void,
	error: (msg: string, e?: any) => void
): Promise<void> {
	// Process each file
	let pyFileCount = 0;
	for (const [fileName, fileType] of files) {
		if (fileType === vscode.FileType.File && fileName.endsWith('.py')) {
			pyFileCount++;
			log(`[ScriptOs Scanner] Processing file ${pyFileCount}: ${fileName}`);
			try {
				const fileUri = vscode.Uri.joinPath(scriptOsPath, fileName);
				const fileContent = await vscode.workspace.fs.readFile(fileUri);
				const content = new TextDecoder().decode(fileContent);

				log(`[ScriptOs Scanner] File ${fileName} read, ${content.length} bytes`);

				// Parse config
				const config = parseScriptOsConfig(content);

				if (config) {
					// Normalize args: if args is null (from None), convert to undefined/empty
					if (config.args === null) {
						config.args = undefined;
					}

					scriptOsList.push({
						filename: fileName,
						fullPath: fileUri.fsPath,
						content: content,
						config: config
					});
					log(`[ScriptOs Scanner] ✓ Loaded ScriptO: ${config.info?.name || fileName}`);
				} else {
					warn(`[ScriptOs Scanner] No valid config found in: ${fileName}`);
					warn(`[ScriptOs Scanner] File content preview (first 300 chars): ${content.substring(0, 300)}`);
				}
			} catch (e: any) {
				error(`[ScriptOs Scanner] Error loading ScriptO ${fileName}`, e);
			}
		} else {
			log(`[ScriptOs Scanner] Skipping ${fileName} (type: ${fileType === vscode.FileType.Directory ? 'directory' : 'other'})`);
		}
	}
	log(`[ScriptOs Scanner] Processed ${pyFileCount} Python files`);
}

