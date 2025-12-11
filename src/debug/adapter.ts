/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * MicroPython Debug Adapter
 * Bridges VS Code debug UI to DAP handler
 */

import * as vscode from 'vscode';
import { DAPHandler } from './dapHandler';
import { WebREPLConnection } from '../webrepl/connection';

/**
 * Debug adapter session
 * Implements vscode.DebugAdapter to bridge VS Code UI to our DAP handler
 */
export class MicroPythonDebugSession implements vscode.DebugAdapter {
    private dapHandler: DAPHandler;
    
    constructor(
        private connection: WebREPLConnection
    ) {
        const handler = connection.getDAPHandler();
        if (!handler) {
            throw new Error('DAP handler not available');
        }
        this.dapHandler = handler;
    }
    
    /**
     * Handle messages from VS Code debug UI
     */
    handleMessage(message: vscode.DebugProtocolMessage): void {
        // Convert VS Code message to DAP format
        const dapMessage = JSON.stringify(message);
        const withHeader = `Content-Length: ${dapMessage.length}\r\n\r\n${dapMessage}`;
        
        // Forward to DAP handler
        this.dapHandler.handleMessage(withHeader);
    }
    
    /**
     * Dispose resources
     */
    dispose(): void {
        // Cleanup if needed
    }
}

/**
 * Debug adapter factory
 * Creates debug adapter sessions
 */
export class MicroPythonDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    constructor(
        private connection: WebREPLConnection
    ) {}
    
    createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        // Check if connected
        if (!this.connection.isConnected()) {
            vscode.window.showErrorMessage('Please connect to device before debugging');
            return undefined;
        }
        
        // Return inline adapter using existing WebSocket connection
        return new vscode.DebugAdapterInlineImplementation(
            new MicroPythonDebugSession(this.connection)
        );
    }
}

/**
 * Debug configuration provider
 * Provides default debug configurations
 */
export class MicroPythonDebugConfigProvider implements vscode.DebugConfigurationProvider {
    /**
     * Resolve debug configuration
     */
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // If no configuration, provide defaults
        if (!config.type && !config.request && !config.name) {
            // Empty launch.json - provide default attach config
            return {
                type: 'micropython-esp32',
                name: 'Attach to MicroPython',
                request: 'attach'
            };
        }
        
        // Ensure required fields
        if (!config.type) {
            config.type = 'micropython-esp32';
        }
        
        if (!config.request) {
            config.request = 'attach';
        }
        
        if (!config.name) {
            config.name = config.request === 'launch' ? 'Launch MicroPython' : 'Attach to MicroPython';
        }
        
        // Set defaults for launch
        if (config.request === 'launch') {
            if (!config.program) {
                config.program = '/main.py';
            }
            if (config.stopOnEntry === undefined) {
                config.stopOnEntry = true;
            }
        }
        
        return config;
    }
    
    /**
     * Provide initial configurations
     */
    provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
        return [
            {
                type: 'micropython-esp32',
                request: 'launch',
                name: 'Launch MicroPython Script',
                program: '/main.py',
                stopOnEntry: true
            },
            {
                type: 'micropython-esp32',
                request: 'attach',
                name: 'Attach to Running MicroPython'
            }
        ];
    }
}

