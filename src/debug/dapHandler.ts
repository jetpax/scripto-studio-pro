/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Debug Adapter Protocol (DAP) Handler
 * Implements DAP for MicroPython debugging
 */

import * as vscode from 'vscode';
import {
    DAPMessage,
    DAPRequest,
    DAPResponse,
    DAPEvent,
    DAPCapabilities,
    DAPBreakpoint,
    DAPStackFrame,
    parseDAPMessage,
    encodeDAPMessage
} from '../protocols/types';

/**
 * Breakpoint storage
 */
interface BreakpointInfo {
    id: number;
    file: string;
    line: number;
    verified: boolean;
}

/**
 * Debug Adapter Protocol Handler
 */
export class DAPHandler {
    private seq: number = 1;
    private initialized: boolean = false;
    private breakpoints = new Map<string, BreakpointInfo[]>();
    private breakpointIdCounter: number = 1;
    private stopped: boolean = false;
    private stopReason: string = '';
    private threadId: number = 1;
    
    // Callback for sending DAP messages (TEXT frames)
    private sendCallback: ((message: string) => void) | null = null;
    
    // Event emitters for VS Code integration
    private _onInitialized = new vscode.EventEmitter<void>();
    public readonly onInitialized = this._onInitialized.event;
    
    private _onStopped = new vscode.EventEmitter<{ reason: string; threadId: number }>();
    public readonly onStopped = this._onStopped.event;
    
    private _onContinued = new vscode.EventEmitter<{ threadId: number }>();
    public readonly onContinued = this._onContinued.event;
    
    private _onTerminated = new vscode.EventEmitter<void>();
    public readonly onTerminated = this._onTerminated.event;
    
    /**
     * Set the callback for sending DAP messages
     */
    setSendCallback(callback: (message: string) => void): void {
        this.sendCallback = callback;
    }
    
    /**
     * Handle incoming DAP message (TEXT frame)
     */
    handleMessage(text: string): void {
        const message = parseDAPMessage(text);
        if (!message) {
            console.error('[DAP] Failed to parse message');
            return;
        }
        
        if (message.type === 'request') {
            this.handleRequest(message as DAPRequest);
        } else if (message.type === 'response') {
            this.handleResponse(message as DAPResponse);
        }
    }
    
    /**
     * Handle DAP request
     */
    private handleRequest(request: DAPRequest): void {
        console.log(`[DAP] Request: ${request.command} (seq=${request.seq})`);
        
        switch (request.command) {
            case 'initialize':
                this.handleInitialize(request);
                break;
            case 'launch':
                this.handleLaunch(request);
                break;
            case 'attach':
                this.handleAttach(request);
                break;
            case 'setBreakpoints':
                this.handleSetBreakpoints(request);
                break;
            case 'configurationDone':
                this.handleConfigurationDone(request);
                break;
            case 'threads':
                this.handleThreads(request);
                break;
            case 'stackTrace':
                this.handleStackTrace(request);
                break;
            case 'scopes':
                this.handleScopes(request);
                break;
            case 'variables':
                this.handleVariables(request);
                break;
            case 'continue':
                this.handleContinue(request);
                break;
            case 'next':
                this.handleNext(request);
                break;
            case 'stepIn':
                this.handleStepIn(request);
                break;
            case 'stepOut':
                this.handleStepOut(request);
                break;
            case 'pause':
                this.handlePause(request);
                break;
            case 'disconnect':
                this.handleDisconnect(request);
                break;
            default:
                console.warn(`[DAP] Unhandled command: ${request.command}`);
                this.sendErrorResponse(request, `Command '${request.command}' not implemented`);
        }
    }
    
    /**
     * Handle DAP response (from device)
     */
    private handleResponse(response: DAPResponse): void {
        console.log(`[DAP] Response: ${response.command} (success=${response.success})`);
        // Responses from device are forwarded to VS Code UI
        // This is handled by the debug adapter session
    }
    
    //=========================================================================
    // DAP Command Handlers
    //=========================================================================
    
    /**
     * Initialize request - capability negotiation
     */
    private handleInitialize(request: DAPRequest): void {
        const capabilities: DAPCapabilities = {
            supportsConfigurationDoneRequest: true,
            supportsFunctionBreakpoints: false,
            supportsConditionalBreakpoints: false,
            supportsHitConditionalBreakpoints: false,
            supportsEvaluateForHovers: false,
            supportsStepBack: false,
            supportsSetVariable: false,
            supportsRestartFrame: false,
            supportsGotoTargetsRequest: false,
            supportsStepInTargetsRequest: false,
            supportsCompletionsRequest: false,
            supportsModulesRequest: false,
            supportsRestartRequest: false,
            supportsExceptionOptions: false,
            supportsValueFormattingOptions: false,
            supportsExceptionInfoRequest: false,
            supportTerminateDebuggee: true,
            supportsDelayedStackTraceLoading: false,
            supportsLoadedSourcesRequest: false,
            supportsLogPoints: false,
            supportsTerminateThreadsRequest: false,
            supportsSetExpression: false,
            supportsTerminateRequest: true,
            supportsDataBreakpoints: false,
            supportsReadMemoryRequest: false,
            supportsDisassembleRequest: false
        };
        
        this.sendResponse(request, capabilities);
        
        // Send initialized event
        this.sendEvent('initialized', {});
        this.initialized = true;
        this._onInitialized.fire();
    }
    
    /**
     * Launch request - start debugging a script
     */
    private handleLaunch(request: DAPRequest): void {
        const args = request.arguments || {};
        const program = args.program || '/main.py';
        const stopOnEntry = args.stopOnEntry !== false;
        const noDebug = args.noDebug === true;
        
        console.log(`[DAP] Launch: program=${program}, stopOnEntry=${stopOnEntry}, noDebug=${noDebug}`);
        
        // TODO: Send command to device to start script with debugging
        // This would involve:
        // 1. Installing sys.settrace() callback
        // 2. Executing the specified program
        // 3. Stopping at first line if stopOnEntry=true
        
        this.sendResponse(request);
        
        // If stopOnEntry, send stopped event
        if (stopOnEntry && !noDebug) {
            this.stopped = true;
            this.stopReason = 'entry';
            this.sendEvent('stopped', {
                reason: 'entry',
                threadId: this.threadId,
                description: 'Paused on entry',
                preserveFocusHint: false,
                allThreadsStopped: true
            });
            this._onStopped.fire({ reason: 'entry', threadId: this.threadId });
        }
    }
    
    /**
     * Attach request - attach to running MicroPython
     */
    private handleAttach(request: DAPRequest): void {
        console.log('[DAP] Attach to running MicroPython');
        
        // TODO: Install sys.settrace() callback on running interpreter
        
        this.sendResponse(request);
    }
    
    /**
     * Set breakpoints request
     */
    private handleSetBreakpoints(request: DAPRequest): void {
        const args = request.arguments || {};
        const source = args.source || {};
        const sourcePath = source.path || '';
        const requestedBreakpoints = args.breakpoints || [];
        
        console.log(`[DAP] setBreakpoints: ${sourcePath}, count=${requestedBreakpoints.length}`);
        
        // Clear existing breakpoints for this file
        this.breakpoints.delete(sourcePath);
        
        // Set new breakpoints
        const verifiedBreakpoints: DAPBreakpoint[] = [];
        const fileBreakpoints: BreakpointInfo[] = [];
        
        for (const bp of requestedBreakpoints) {
            const line = bp.line || 0;
            const id = this.breakpointIdCounter++;
            
            fileBreakpoints.push({
                id,
                file: sourcePath,
                line,
                verified: true  // TODO: Verify with device
            });
            
            verifiedBreakpoints.push({
                id,
                verified: true,
                line
            });
        }
        
        if (fileBreakpoints.length > 0) {
            this.breakpoints.set(sourcePath, fileBreakpoints);
        }
        
        // TODO: Send breakpoints to device via WebREPL
        
        this.sendResponse(request, { breakpoints: verifiedBreakpoints });
    }
    
    /**
     * Configuration done request
     */
    private handleConfigurationDone(request: DAPRequest): void {
        console.log('[DAP] Configuration done');
        this.sendResponse(request);
    }
    
    /**
     * Threads request - MicroPython is single-threaded
     */
    private handleThreads(request: DAPRequest): void {
        this.sendResponse(request, {
            threads: [
                { id: this.threadId, name: 'main' }
            ]
        });
    }
    
    /**
     * Stack trace request
     */
    private handleStackTrace(request: DAPRequest): void {
        const args = request.arguments || {};
        const threadId = args.threadId;
        
        // TODO: Get actual stack trace from device via sys.settrace()
        // For now, return empty stack
        
        const stackFrames: DAPStackFrame[] = [];
        
        this.sendResponse(request, {
            stackFrames,
            totalFrames: stackFrames.length
        });
    }
    
    /**
     * Scopes request
     */
    private handleScopes(request: DAPRequest): void {
        // TODO: Return locals, globals scopes
        
        this.sendResponse(request, {
            scopes: []
        });
    }
    
    /**
     * Variables request
     */
    private handleVariables(request: DAPRequest): void {
        // TODO: Return variable values for given variablesReference
        
        this.sendResponse(request, {
            variables: []
        });
    }
    
    /**
     * Continue request
     */
    private handleContinue(request: DAPRequest): void {
        console.log('[DAP] Continue');
        
        this.stopped = false;
        this.stopReason = '';
        
        // TODO: Tell device to continue execution
        
        this.sendResponse(request, {
            allThreadsContinued: true
        });
        
        this._onContinued.fire({ threadId: this.threadId });
    }
    
    /**
     * Next (step over) request
     */
    private handleNext(request: DAPRequest): void {
        console.log('[DAP] Step over');
        
        // TODO: Tell device to step to next line
        
        this.sendResponse(request);
    }
    
    /**
     * Step in request
     */
    private handleStepIn(request: DAPRequest): void {
        console.log('[DAP] Step in');
        
        // TODO: Tell device to step into function
        
        this.sendResponse(request);
    }
    
    /**
     * Step out request
     */
    private handleStepOut(request: DAPRequest): void {
        console.log('[DAP] Step out');
        
        // TODO: Tell device to step out of function
        
        this.sendResponse(request);
    }
    
    /**
     * Pause request
     */
    private handlePause(request: DAPRequest): void {
        console.log('[DAP] Pause');
        
        // TODO: Tell device to pause execution
        
        this.sendResponse(request);
        
        this.stopped = true;
        this.stopReason = 'pause';
        this.sendEvent('stopped', {
            reason: 'pause',
            threadId: this.threadId,
            allThreadsStopped: true
        });
        this._onStopped.fire({ reason: 'pause', threadId: this.threadId });
    }
    
    /**
     * Disconnect request
     */
    private handleDisconnect(request: DAPRequest): void {
        console.log('[DAP] Disconnect');
        
        this.initialized = false;
        this.stopped = false;
        this.breakpoints.clear();
        
        this.sendResponse(request);
        this.sendEvent('terminated', {});
        this._onTerminated.fire();
    }
    
    //=========================================================================
    // DAP Message Sending
    //=========================================================================
    
    /**
     * Send response to request
     */
    private sendResponse(request: DAPRequest, body?: any): void {
        const response: DAPResponse = {
            seq: this.seq++,
            type: 'response',
            request_seq: request.seq,
            success: true,
            command: request.command
        };
        
        if (body !== undefined) {
            response.body = body;
        }
        
        this.sendMessage(response);
    }
    
    /**
     * Send error response
     */
    private sendErrorResponse(request: DAPRequest, message: string): void {
        const response: DAPResponse = {
            seq: this.seq++,
            type: 'response',
            request_seq: request.seq,
            success: false,
            command: request.command,
            message
        };
        
        this.sendMessage(response);
    }
    
    /**
     * Send event
     */
    sendEvent(event: string, body?: any): void {
        const eventMessage: DAPEvent = {
            seq: this.seq++,
            type: 'event',
            event
        };
        
        if (body !== undefined) {
            eventMessage.body = body;
        }
        
        this.sendMessage(eventMessage);
    }
    
    /**
     * Send DAP message
     */
    private sendMessage(message: DAPMessage): void {
        if (!this.sendCallback) {
            console.error('[DAP] Send callback not set');
            return;
        }
        
        const encoded = encodeDAPMessage(message);
        this.sendCallback(encoded);
    }
    
    //=========================================================================
    // Public API for device-side integration
    //=========================================================================
    
    /**
     * Notify that execution stopped (e.g., breakpoint hit)
     */
    notifyStopped(reason: string, description?: string): void {
        this.stopped = true;
        this.stopReason = reason;
        
        this.sendEvent('stopped', {
            reason,
            threadId: this.threadId,
            description,
            preserveFocusHint: false,
            allThreadsStopped: true
        });
        
        this._onStopped.fire({ reason, threadId: this.threadId });
    }
    
    /**
     * Check if debugger is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
    
    /**
     * Check if execution is stopped
     */
    isStopped(): boolean {
        return this.stopped;
    }
    
    /**
     * Get all breakpoints
     */
    getAllBreakpoints(): Map<string, BreakpointInfo[]> {
        return this.breakpoints;
    }
}

