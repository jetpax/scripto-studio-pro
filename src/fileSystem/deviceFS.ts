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
 * Device File System Provider
 * Implements VS Code FileSystemProvider for device files via WebREPL
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from '../webrepl/connection';

export class DeviceFileSystemProvider implements vscode.FileSystemProvider {
	private connection: WebREPLConnection;
	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	constructor(connection: WebREPLConnection) {
		this.connection = connection;
	}

	watch(uri: vscode.Uri): vscode.Disposable {
		// File watching not supported yet
		return new vscode.Disposable(() => {});
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const path = uri.path;
		
		// Check if connection is available
		if (!this.connection.isConnected()) {
			// Instead of throwing, return a placeholder stat
			// This prevents errors when VS Code tries to restore previous session files
			// The file will be closed by the extension if connection doesn't happen
			return {
				type: path.endsWith('/') || path === '/' || path === '' 
					? vscode.FileType.Directory 
					: vscode.FileType.File,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}

		// For root path, return directory stat
		if (path === '/' || path === '') {
			return {
				type: vscode.FileType.Directory,
				ctime: 0,
				mtime: 0,
				size: 0
			};
		}

		// Try to get file info via listDir on parent
		const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
		const fileName = path.substring(path.lastIndexOf('/') + 1);

		try {
			// Use a timeout for listDir to prevent hanging
			const listDirPromise = this.connection.listDir(parentPath);
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('listDir timeout')), 5000);
			});
			
			const items = await Promise.race([listDirPromise, timeoutPromise]) as any[];
			const item = items.find((i: any) => i.name === fileName);

			if (!item) {
				console.error(`[DeviceFS] stat() - file not found: ${fileName} in ${parentPath}`);
				console.error(`[DeviceFS] Available items:`, items.map((i: any) => i.name));
				throw vscode.FileSystemError.FileNotFound(uri);
			}

			return {
				type: item.type === 'dir' ? vscode.FileType.Directory : vscode.FileType.File,
				ctime: 0,
				mtime: 0,
				size: item.size || 0
			};
		} catch (error: any) {
			console.error(`[DeviceFS] stat() failed for ${path}:`, error);
			if (error instanceof vscode.FileSystemError) {
				throw error;
			}
			// If listDir failed or timed out, try to read the file directly as a fallback
			// This allows opening files even if listDir fails
			try {
				await this.readFile(uri);
				// File exists and can be read, return a basic file stat
				return {
					type: vscode.FileType.File,
					ctime: 0,
					mtime: 0,
					size: 0 // Size unknown
				};
			} catch (readError) {
				// File doesn't exist or can't be read
				if (error.message && (error.message.includes('timeout') || error.message.includes('listDir timeout'))) {
					// For timeout, try the readFile fallback first, then throw
					throw vscode.FileSystemError.FileNotFound(uri);
				}
				throw vscode.FileSystemError.FileNotFound(uri);
			}
		}
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const path = uri.path || '/';

		try {
			const items = await this.connection.listDir(path);
			return items.map((item: any) => [
				item.name,
				item.type === 'dir' ? vscode.FileType.Directory : vscode.FileType.File
			]);
		} catch (error) {
			console.error('Failed to read directory:', error);
			return [];
		}
	}

	async createDirectory(uri: vscode.Uri): Promise<void> {
		const path = uri.path;
		await this.connection.mkdir(path);
		this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const path = uri.path;

		// Check if connection is available
		if (!this.connection.isConnected()) {
			// Return empty file to prevent errors during restore
			// The extension will close it if connection doesn't happen
			return new TextEncoder().encode('');
		}

		try {
			const data = await this.connection.getFile(path);
			if (!data || data.length === 0) {
				// Return empty array for empty files
				return new Uint8Array(0);
			}
			return data;
		} catch (error: any) {
			console.error(`[DeviceFS] readFile() failed for ${path}:`, error);
			if (error instanceof vscode.FileSystemError) {
				throw error;
			}
			throw vscode.FileSystemError.FileNotFound(uri);
		}
	}

	async writeFile(
		uri: vscode.Uri,
		content: Uint8Array,
		options: { create: boolean; overwrite: boolean }
	): Promise<void> {
		const path = uri.path;

		try {
			await this.connection.putFile(path, content);
			this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable('Failed to write file');
		}
	}

	async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
		const path = uri.path;

		try {
			await this.connection.deleteFile(path);
			this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable('Failed to delete file');
		}
	}

	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
		const oldPath = oldUri.path;
		const newPath = newUri.path;

		try {
			await this.connection.rename(oldPath, newPath);
			this._emitter.fire([
				{ type: vscode.FileChangeType.Deleted, uri: oldUri },
				{ type: vscode.FileChangeType.Created, uri: newUri }
			]);
		} catch (error) {
			throw vscode.FileSystemError.Unavailable('Failed to rename file');
		}
	}
}


