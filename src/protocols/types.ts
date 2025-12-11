/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Protocol Types and Constants
 * Defines WebREPL CB, DAP, and Legacy protocol types
 */

//=============================================================================
// WebREPL Binary Protocol (WBP)
//=============================================================================

/**
 * WebREPL Binary Protocol version
 */
export const WEBREPL_CB_VERSION = '1.0';
export const WEBREPL_CB_SUBPROTOCOL = 'webrepl.binary.v1';

/**
 * WebREPL CB Channel Assignments
 */
export enum WCBChannel {
    /** Events: Auth, logs, system notifications */
    EVENTS = 0,
    
    /** Terminal REPL (Human-Machine Interface) */
    TERMINAL = 1,
    
    /** Machine-to-Machine RPC */
    M2M = 2,
    
    /** Debug output */
    DEBUG = 3,
    
    /** File operations (TFTP-based) */
    FILES = 23,
    
    /** First application-defined channel */
    APP_START = 24,
    
    /** Last application-defined channel */
    APP_END = 254,
    
    /** Reserved for future use */
    RESERVED = 255
}

/**
 * Channel 0 (Events) opcodes
 */
export enum WCBEventOpcode {
    AUTH_CHALLENGE = 0,
    AUTH_RESPONSE = 1,
    LOG = 2,
    NOTIFICATION = 3,
    STATUS = 4
}

/**
 * Channel 1 (Terminal) opcodes
 */
export enum WCBTerminalOpcode {
    EXECUTE = 0,
    OUTPUT = 1,
    ERROR = 2,
    INTERRUPT = 3
}

/**
 * Channel 2 (M2M) opcodes
 */
export enum WCBM2MOpcode {
    REQUEST = 0,
    RESPONSE = 1,
    ERROR = 2
}

/**
 * Channel 23 (Files) opcodes - TFTP-based
 */
export enum WCBFileOpcode {
    /** Read request (RRQ) */
    READ_REQUEST = 1,
    
    /** Write request (WRQ) */
    WRITE_REQUEST = 2,
    
    /** Data block */
    DATA = 3,
    
    /** Acknowledgment */
    ACK = 4,
    
    /** Error */
    ERROR = 5,
    
    /** List directory */
    LIST_DIR = 6,
    
    /** Delete file */
    DELETE = 7,
    
    /** Rename/move */
    RENAME = 8,
    
    /** Make directory */
    MKDIR = 9,
    
    /** Get metadata */
    STAT = 10
}

/**
 * WebREPL CB message structure
 * Format: [channel, opcode, ...fields]
 */
export interface WCBMessage {
    channel: number;
    opcode: number;
    fields: any[];
}

/**
 * TFTP transfer state
 */
export interface TFTPTransfer {
    blockNum: number;
    blockSize: number;
    totalBlocks: number;
    data: Uint8Array[];
    complete: boolean;
}

//=============================================================================
// Debug Adapter Protocol (DAP)
//=============================================================================

/**
 * DAP message types
 */
export enum DAPMessageType {
    REQUEST = 'request',
    RESPONSE = 'response',
    EVENT = 'event'
}

/**
 * DAP base message
 */
export interface DAPMessage {
    seq: number;
    type: string;
}

/**
 * DAP request
 */
export interface DAPRequest extends DAPMessage {
    type: 'request';
    command: string;
    arguments?: any;
}

/**
 * DAP response
 */
export interface DAPResponse extends DAPMessage {
    type: 'response';
    request_seq: number;
    success: boolean;
    command: string;
    message?: string;
    body?: any;
}

/**
 * DAP event
 */
export interface DAPEvent extends DAPMessage {
    type: 'event';
    event: string;
    body?: any;
}

/**
 * DAP capabilities
 */
export interface DAPCapabilities {
    supportsConfigurationDoneRequest?: boolean;
    supportsFunctionBreakpoints?: boolean;
    supportsConditionalBreakpoints?: boolean;
    supportsHitConditionalBreakpoints?: boolean;
    supportsEvaluateForHovers?: boolean;
    supportsStepBack?: boolean;
    supportsSetVariable?: boolean;
    supportsRestartFrame?: boolean;
    supportsGotoTargetsRequest?: boolean;
    supportsStepInTargetsRequest?: boolean;
    supportsCompletionsRequest?: boolean;
    supportsModulesRequest?: boolean;
    supportsRestartRequest?: boolean;
    supportsExceptionOptions?: boolean;
    supportsValueFormattingOptions?: boolean;
    supportsExceptionInfoRequest?: boolean;
    supportTerminateDebuggee?: boolean;
    supportsDelayedStackTraceLoading?: boolean;
    supportsLoadedSourcesRequest?: boolean;
    supportsLogPoints?: boolean;
    supportsTerminateThreadsRequest?: boolean;
    supportsSetExpression?: boolean;
    supportsTerminateRequest?: boolean;
    supportsDataBreakpoints?: boolean;
    supportsReadMemoryRequest?: boolean;
    supportsDisassembleRequest?: boolean;
}

/**
 * Breakpoint information
 */
export interface DAPBreakpoint {
    id: number;
    verified: boolean;
    line: number;
    column?: number;
    source?: {
        path: string;
        name?: string;
    };
}

/**
 * Stack frame information
 */
export interface DAPStackFrame {
    id: number;
    name: string;
    source?: {
        path: string;
        name?: string;
    };
    line: number;
    column: number;
}

/**
 * Scope information
 */
export interface DAPScope {
    name: string;
    variablesReference: number;
    expensive: boolean;
}

/**
 * Variable information
 */
export interface DAPVariable {
    name: string;
    value: string;
    type?: string;
    variablesReference: number;
}

//=============================================================================
// Legacy WebREPL Protocol (WA/WB)
//=============================================================================

/**
 * Legacy WebREPL opcodes
 */
export enum LegacyWebREPLOp {
    PUT_FILE = 1,
    GET_FILE = 2,
    GET_VER = 3
}

/**
 * Legacy WebREPL response codes
 */
export enum LegacyWebREPLResp {
    OK = 0,
    ERROR = 1
}

/**
 * Legacy file transfer header (82 bytes fixed)
 */
export interface LegacyFileHeader {
    magic: string;  // "WA" or "WB"
    op: number;
    pathLen: number;
    path: string;
    fileSize?: number;
}

//=============================================================================
// Protocol Detection
//=============================================================================

/**
 * Protocol type detected from message
 */
export enum ProtocolType {
    /** Legacy WA/WB protocol */
    LEGACY_WEBREPL = 'legacy',
    
    /** WebREPL CB (CBOR) */
    WEBREPL_CB = 'wcb',
    
    /** Debug Adapter Protocol */
    DAP = 'dap',
    
    /** Unknown/unparseable */
    UNKNOWN = 'unknown'
}

/**
 * Protocol capabilities negotiated during connection
 */
export interface ProtocolCapabilities {
    /** Legacy WA/WB file transfer */
    legacyFiles: boolean;
    
    /** WebREPL CB channelized protocol */
    wcb: boolean;
    
    /** DAP debugging */
    dap: boolean;
    
    /** Protocol version string */
    version?: string;
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Check if data is CBOR-encoded
 */
export function isCBORData(data: Uint8Array): boolean {
    if (data.length === 0) {
        return false;
    }
    
    // CBOR array starts with 0x80-0x9F (major type 4)
    // or indefinite array 0x9F
    const firstByte = data[0];
    
    // Check for CBOR array (major type 4, values 0-23 or indefinite)
    if ((firstByte >= 0x80 && firstByte <= 0x9F) || firstByte === 0x9F) {
        return true;
    }
    
    return false;
}

/**
 * Check if data is legacy WebREPL (WA/WB magic bytes)
 */
export function isLegacyWebREPL(data: Uint8Array): boolean {
    if (data.length < 2) {
        return false;
    }
    
    const magic1 = String.fromCharCode(data[0]);
    const magic2 = String.fromCharCode(data[1]);
    
    return (magic1 === 'W' && (magic2 === 'A' || magic2 === 'B'));
}

/**
 * Check if string is DAP message (Content-Length header)
 */
export function isDAPMessage(text: string): boolean {
    return text.startsWith('Content-Length:') || text.startsWith('content-length:');
}

/**
 * Parse DAP message (Content-Length + JSON)
 */
export function parseDAPMessage(text: string): DAPMessage | null {
    try {
        // Find Content-Length header
        const headerMatch = text.match(/Content-Length:\s*(\d+)/i);
        if (!headerMatch) {
            return null;
        }
        
        const contentLength = parseInt(headerMatch[1], 10);
        
        // Find \r\n\r\n separator
        const separatorIndex = text.indexOf('\r\n\r\n');
        if (separatorIndex === -1) {
            return null;
        }
        
        // Extract JSON
        const jsonStart = separatorIndex + 4;
        const jsonText = text.substring(jsonStart, jsonStart + contentLength);
        
        return JSON.parse(jsonText);
    } catch (e) {
        return null;
    }
}

/**
 * Encode DAP message (add Content-Length header)
 */
export function encodeDAPMessage(message: DAPMessage): string {
    const json = JSON.stringify(message);
    return `Content-Length: ${json.length}\r\n\r\n${json}`;
}

/**
 * Detect protocol type from message data
 */
export function detectProtocol(data: string | ArrayBuffer): ProtocolType {
    // TEXT frames
    if (typeof data === 'string') {
        if (isDAPMessage(data)) {
            return ProtocolType.DAP;
        }
        return ProtocolType.UNKNOWN;
    }
    
    // BINARY frames
    if (data instanceof ArrayBuffer) {
        const bytes = new Uint8Array(data);
        
        if (isCBORData(bytes)) {
            return ProtocolType.WEBREPL_CB;
        }
        
        if (isLegacyWebREPL(bytes)) {
            return ProtocolType.LEGACY_WEBREPL;
        }
        
        return ProtocolType.UNKNOWN;
    }
    
    return ProtocolType.UNKNOWN;
}
