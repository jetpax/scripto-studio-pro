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
 * Status Bar Manager
 * Shows connection status and device info
 */

import * as vscode from 'vscode';
import { WebREPLConnection } from './webrepl/connection';

export class StatusBarManager implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;
	private connection: WebREPLConnection;

	constructor(connection: WebREPLConnection) {
		this.connection = connection;
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		
		this.statusBarItem.command = 'micropython.connect';
		this.update();
		this.statusBarItem.show();

		// Listen for connection events
		this.connection.onConnected(() => this.update());
		this.connection.onDisconnected(() => this.update());
	}

	private update(): void {
		if (this.connection.isConnected()) {
			this.statusBarItem.text = '$(plug) Device Connected';
			this.statusBarItem.tooltip = 'Click to disconnect';
			this.statusBarItem.command = 'micropython.disconnect';
			this.statusBarItem.backgroundColor = undefined;
		} else {
			this.statusBarItem.text = '$(debug-disconnect) Device Disconnected';
			this.statusBarItem.tooltip = 'Click to connect';
			this.statusBarItem.command = 'micropython.connect';
			this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		}
	}

	updateDeviceInfo(info: any): void {
		// Update status bar with AUTO-INFO data (matches Scripto Studio format)
		if (this.connection.isConnected() && info) {
			const mem = info.mem || {};
			const temp = info.temp;
			const uptime = info.uptime || 0;
			
			// Calculate memory percentage
			const memAlloc = mem.alloc || 0;
			const memFree = mem.free || 0;
			const memTotal = memAlloc + memFree;
			const memPercent = memTotal > 0 ? Math.round((memAlloc / memTotal) * 100) : 0;
			
			// Build status text - start with "Device Connected" instead of "MicroPython: Connected"
			let statusText = `$(plug) Device Connected`;
			
			// Add memory info
			if (memTotal > 0) {
				statusText += ` | Mem: ${memPercent}%`;
			}
			
			// Add temperature if available (check for both celsius and value properties)
			if (temp) {
				let tempValue: number | undefined;
				if (typeof temp === 'object') {
					tempValue = temp.celsius !== undefined ? temp.celsius : temp.value;
				}
				if (tempValue !== undefined) {
					statusText += ` | Temp: ${tempValue}°C`;
				}
			}
			
			// Add uptime
			if (uptime > 0) {
				statusText += ` | Uptime: ${uptime}m`;
			}
			
			this.statusBarItem.text = statusText;
		}
	}

	dispose(): void {
		this.statusBarItem.dispose();
	}
}

