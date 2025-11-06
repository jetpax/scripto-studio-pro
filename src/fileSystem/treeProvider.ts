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
 * Device Tree Provider
 * Shows device files in VS Code sidebar
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from '../webrepl/connection';

export class DeviceTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly path: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly isDirectory: boolean,
		public readonly size?: number
	) {
		super(label, collapsibleState);

		this.contextValue = isDirectory ? 'folder' : 'file';
		this.tooltip = path;

		// Command will be set in getChildren() to use micropython.openFile
		// (not set here to avoid duplicate)

		// Set icon based on file type
		if (!isDirectory) {
			this.iconPath = vscode.ThemeIcon.File;

			// Add size to description
			if (size !== undefined) {
				this.description = this.formatSize(size);
			}
		} else {
			this.iconPath = vscode.ThemeIcon.Folder;
		}
	}

	private formatSize(bytes: number): string {
		if (bytes < 1024) {
			return `${bytes} B`;
		} else if (bytes < 1024 * 1024) {
			return `${(bytes / 1024).toFixed(1)} KB`;
		} else {
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		}
	}
}

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<DeviceTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private connection: WebREPLConnection;

	constructor(connection: WebREPLConnection) {
		this.connection = connection;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: DeviceTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: DeviceTreeItem): Promise<DeviceTreeItem[]> {
		if (!this.connection.isConnected()) {
			return [];
		}

		try {
			const path = element ? element.path : '/';
			const items = await this.connection.listDir(path);

			// Sort: directories first, then files
			items.sort((a: any, b: any) => {
				if (a.type === 'dir' && b.type !== 'dir') {
					return -1;
				}
				if (a.type !== 'dir' && b.type === 'dir') {
					return 1;
				}
				return a.name.localeCompare(b.name);
			});

			return items.map((item: any) => {
				const itemPath = path === '/' ? `/${item.name}` : `${path}/${item.name}`;
				const isDir = item.type === 'dir';
				
				const treeItem = new DeviceTreeItem(
					item.name,
					itemPath,
					isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
					isDir,
					item.size
				);
				
				// Add command to open files when clicked
				if (!isDir) {
					treeItem.command = {
						command: 'micropython.openFile',
						title: 'Open File',
						arguments: [itemPath]
					};
				}
				
				return treeItem;
			});
		} catch (error) {
			console.error('Failed to get children:', error);
			return [];
		}
	}
}
