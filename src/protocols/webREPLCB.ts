/**
 * Copyright (C) 2025 Jonathan E. Peace
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebREPL CB (Channelized Binary) Protocol Handler
 * Implements CBOR-based channelized WebREPL protocol
 */

import { encode, decode } from 'cbor-x';
import {
    WCBChannel,
    WCBFileOpcode,
    WCBMessage,
    TFTPTransfer,
    WEBREPL_CB_VERSION
} from './types';

/**
 * Channel message callback type
 */
type ChannelCallback = (opcode: number, fields: any[]) => void;

/**
 * WebREPL Binary Protocol Handler
 */
export class WebREPLCBHandler {
    private channelCallbacks = new Map<number, ChannelCallback[]>();
    private sendCallback: ((data: Uint8Array) => void) | null = null;
    private tftpTransfers = new Map<string, TFTPTransfer>();
    
    /**
     * Set the callback for sending data
     */
    setSendCallback(callback: (data: Uint8Array) => void): void {
        this.sendCallback = callback;
    }
    
    /**
     * Register a callback for a specific channel
     */
    onChannel(channel: number, callback: ChannelCallback): void {
        if (!this.channelCallbacks.has(channel)) {
            this.channelCallbacks.set(channel, []);
        }
        this.channelCallbacks.get(channel)!.push(callback);
    }
    
    /**
     * Handle incoming CBOR message
     */
    handleMessage(data: Uint8Array): void {
        try {
            // Decode CBOR array: [channel, opcode, ...fields]
            const decoded = decode(data) as any[];
            
            if (!Array.isArray(decoded) || decoded.length < 2) {
                console.warn('[WebREPL CB] Invalid message format');
                return;
            }
            
            const [channel, opcode, ...fields] = decoded;
            
            if (typeof channel !== 'number' || typeof opcode !== 'number') {
                console.warn('[WebREPL CB] Invalid channel or opcode');
                return;
            }
            
            console.log(`[WebREPL CB] Channel ${channel}, Opcode ${opcode}, Fields:`, fields);
            
            // Route to channel-specific handlers
            const callbacks = this.channelCallbacks.get(channel);
            if (callbacks) {
                for (const callback of callbacks) {
                    callback(opcode, fields);
                }
            }
            
        } catch (error) {
            console.error('[WebREPL CB] Failed to decode message:', error);
        }
    }
    
    /**
     * Send a message on a channel
     */
    sendMessage(channel: number, opcode: number, ...fields: any[]): void {
        if (!this.sendCallback) {
            throw new Error('Send callback not set');
        }
        
        try {
            // Encode as CBOR array
            const message = [channel, opcode, ...fields];
            const encoded = encode(message);
            
            console.log(`[WebREPL CB] Sending: Channel ${channel}, Opcode ${opcode}`);
            this.sendCallback(new Uint8Array(encoded));
            
        } catch (error) {
            console.error('[WebREPL CB] Failed to encode message:', error);
            throw error;
        }
    }
    
    /**
     * Probe for WebREPL CB support
     */
    async probe(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            // TODO: Implement protocol version negotiation
            // For now, assume available if CBOR messages are received
            const timeout = setTimeout(() => {
                reject(new Error('Protocol probe timeout'));
            }, 2000);
            
            // Listen for events channel
            const handler = (opcode: number, fields: any[]) => {
                clearTimeout(timeout);
                console.log('[WebREPL CB] Protocol detected, version:', fields[0] || 'unknown');
                resolve(true);
            };
            
            this.onChannel(WCBChannel.EVENTS, handler);
            
            // Request version
            this.sendMessage(WCBChannel.EVENTS, 0); // VERSION_REQUEST
        });
    }
    
    //=========================================================================
    // File Operations (TFTP-based)
    //=========================================================================
    
    /**
     * Read file using TFTP
     */
    async readFile(path: string): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            const transferId = `read:${path}`;
            const transfer: TFTPTransfer = {
                blockNum: 0,
                blockSize: 4096,
                totalBlocks: 0,
                data: [],
                complete: false
            };
            
            this.tftpTransfers.set(transferId, transfer);
            
            // Set timeout
            const timeout = setTimeout(() => {
                this.tftpTransfers.delete(transferId);
                reject(new Error(`File read timeout: ${path}`));
            }, 30000);
            
            // Register handler for DATA blocks
            const handler = (opcode: number, fields: any[]) => {
                if (opcode === WCBFileOpcode.DATA) {
                    const [blockNum, data] = fields;
                    
                    console.log(`[TFTP] Received block ${blockNum}, size ${data.length}`);
                    
                    transfer.data[blockNum] = new Uint8Array(data);
                    
                    // Send ACK
                    this.sendMessage(WCBChannel.FILES, WCBFileOpcode.ACK, blockNum);
                    
                    // Check if complete (empty block or last block marker)
                    if (data.length === 0 || data.length < transfer.blockSize) {
                        clearTimeout(timeout);
                        transfer.complete = true;
                        
                        // Concatenate all blocks
                        const totalSize = transfer.data.reduce((sum, block) => sum + block.length, 0);
                        const result = new Uint8Array(totalSize);
                        let offset = 0;
                        for (const block of transfer.data) {
                            result.set(block, offset);
                            offset += block.length;
                        }
                        
                        this.tftpTransfers.delete(transferId);
                        resolve(result);
                    }
                    
                } else if (opcode === WCBFileOpcode.ERROR) {
                    clearTimeout(timeout);
                    this.tftpTransfers.delete(transferId);
                    reject(new Error(`TFTP error: ${fields[0]}`));
                }
            };
            
            this.onChannel(WCBChannel.FILES, handler);
            
            // Send READ_REQUEST
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.READ_REQUEST, path);
        });
    }
    
    /**
     * Write file using TFTP
     */
    async writeFile(path: string, data: Uint8Array): Promise<void> {
        return new Promise((resolve, reject) => {
            const blockSize = 4096;
            const totalBlocks = Math.ceil(data.length / blockSize);
            let currentBlock = 0;
            
            const timeout = setTimeout(() => {
                reject(new Error(`File write timeout: ${path}`));
            }, 30000);
            
            // Register handler for ACKs
            const handler = (opcode: number, fields: any[]) => {
                if (opcode === WCBFileOpcode.ACK) {
                    const [blockNum] = fields;
                    
                    console.log(`[TFTP] ACK received for block ${blockNum}`);
                    
                    // Send next block
                    currentBlock++;
                    
                    if (currentBlock < totalBlocks) {
                        const start = currentBlock * blockSize;
                        const end = Math.min(start + blockSize, data.length);
                        const blockData = data.slice(start, end);
                        
                        this.sendMessage(WCBChannel.FILES, WCBFileOpcode.DATA, currentBlock, blockData);
                    } else {
                        // All blocks sent
                        clearTimeout(timeout);
                        resolve();
                    }
                    
                } else if (opcode === WCBFileOpcode.ERROR) {
                    clearTimeout(timeout);
                    reject(new Error(`TFTP error: ${fields[0]}`));
                }
            };
            
            this.onChannel(WCBChannel.FILES, handler);
            
            // Send WRITE_REQUEST
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.WRITE_REQUEST, path, data.length);
            
            // Send first block
            const firstBlock = data.slice(0, Math.min(blockSize, data.length));
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.DATA, 0, firstBlock);
        });
    }
    
    /**
     * List directory
     */
    async listDir(path: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`List directory timeout: ${path}`));
            }, 10000);
            
            const handler = (opcode: number, fields: any[]) => {
                if (opcode === WCBFileOpcode.LIST_DIR) {
                    clearTimeout(timeout);
                    const [entries] = fields;
                    resolve(entries || []);
                } else if (opcode === WCBFileOpcode.ERROR) {
                    clearTimeout(timeout);
                    reject(new Error(`List directory error: ${fields[0]}`));
                }
            };
            
            this.onChannel(WCBChannel.FILES, handler);
            
            // Send LIST_DIR request
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.LIST_DIR, path);
        });
    }
    
    /**
     * Delete file or directory
     */
    async deleteFile(path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Delete timeout: ${path}`));
            }, 10000);
            
            const handler = (opcode: number, fields: any[]) => {
                if (opcode === WCBFileOpcode.ACK) {
                    clearTimeout(timeout);
                    resolve();
                } else if (opcode === WCBFileOpcode.ERROR) {
                    clearTimeout(timeout);
                    reject(new Error(`Delete error: ${fields[0]}`));
                }
            };
            
            this.onChannel(WCBChannel.FILES, handler);
            
            // Send DELETE request
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.DELETE, path);
        });
    }
    
    /**
     * Create directory
     */
    async mkdir(path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Mkdir timeout: ${path}`));
            }, 10000);
            
            const handler = (opcode: number, fields: any[]) => {
                if (opcode === WCBFileOpcode.ACK) {
                    clearTimeout(timeout);
                    resolve();
                } else if (opcode === WCBFileOpcode.ERROR) {
                    clearTimeout(timeout);
                    reject(new Error(`Mkdir error: ${fields[0]}`));
                }
            };
            
            this.onChannel(WCBChannel.FILES, handler);
            
            // Send MKDIR request
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.MKDIR, path);
        });
    }
    
    /**
     * Rename/move file
     */
    async rename(oldPath: string, newPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Rename timeout: ${oldPath} -> ${newPath}`));
            }, 10000);
            
            const handler = (opcode: number, fields: any[]) => {
                if (opcode === WCBFileOpcode.ACK) {
                    clearTimeout(timeout);
                    resolve();
                } else if (opcode === WCBFileOpcode.ERROR) {
                    clearTimeout(timeout);
                    reject(new Error(`Rename error: ${fields[0]}`));
                }
            };
            
            this.onChannel(WCBChannel.FILES, handler);
            
            // Send RENAME request
            this.sendMessage(WCBChannel.FILES, WCBFileOpcode.RENAME, oldPath, newPath);
        });
    }
}
