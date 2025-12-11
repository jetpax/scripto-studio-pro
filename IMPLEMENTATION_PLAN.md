# Implementation Plan: WebREPL CB + DAP Support

## Overview

Enhance scripto-studio-pro to support:
1. **WebREPL Binary Protocol** (CBOR, channels) - Enhanced file ops, M2M
2. **Debug Adapter Protocol** (DAP) - Native debugging in VS Code

**Key Insight:** Use WebSocket opcode multiplexing:
- TEXT frames (0x01) → DAP
- BINARY frames (0x02) → WebREPL CB (new) or Legacy WA/WB (fallback)

## Current State (v0.1.2)

✅ **Already Working:**
- WebSocket connection to WebREPL
- RAW REPL execution
- Legacy file operations (WA/WB protocol)
- Terminal with xterm.js
- Browser compatibility (vscode.dev)
- File browser UI
- Command palette integration

❌ **Missing:**
- WebREPL Binary Protocol (CBOR, channels)
- Debug Adapter Protocol support
- Protocol discrimination by opcode
- Breakpoint management

## Phase 1: Protocol Infrastructure (Days 1-2)

### 1.1 Add CBOR Dependency

**Files to modify:**
- `package.json`

**Changes:**
```json
{
  "dependencies": {
    "cbor2": "^1.5.0",  // CBOR encoder/decoder
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  }
}
```

**Testing:** Import and encode/decode test message

### 1.2 Add Protocol Types

**New file:** `src/protocols/types.ts`

**Contents:**
- WebREPL CB channel constants
- Message type definitions
- Protocol version constants

### 1.3 Update WebSocket Message Router

**File to modify:** `src/webrepl/connection.ts`

**Changes:**
- Add opcode discrimination in `_onWebSocketMessage()`
- Route TEXT frames to DAP handler
- Route BINARY frames to protocol detector
- Keep legacy WA/WB support as fallback

**Pseudocode:**
```typescript
private _onWebSocketMessage(rawData: string | ArrayBuffer): void {
    // TEXT frame → Check for DAP
    if (typeof rawData === 'string') {
        if (this.isDAPMessage(rawData)) {
            this.dapHandler?.handleMessage(rawData);
            return;
        }
        // Existing JSON/REPL logic...
    }
    
    // BINARY frame → Discriminate protocol
    if (rawData instanceof ArrayBuffer) {
        const data = new Uint8Array(rawData);
        
        // Check for CBOR (WebREPL CB)
        if (this.isCBORMessage(data)) {
            this.wcbHandler?.handleMessage(data);
            return;
        }
        
        // Fallback to legacy WA/WB
        this._handleBinaryMessage(data);
    }
}
```

## Phase 2: WebREPL Binary Protocol (Days 3-5)

### 2.1 Create WebREPL CB Handler

**New file:** `src/protocols/webREPLCB.ts`

**Class:** `WebREPLCBHandler`

**Methods:**
- `handleMessage(data: Uint8Array)` - Parse CBOR, route by channel
- `sendMessage(channel: number, opcode: number, ...fields)` - Encode and send
- `onChannelMessage(channel: number, callback)` - Register channel listeners

**Channel handlers:**
- Channel 0: Events (auth, logs, notifications)
- Channel 1: Terminal REPL
- Channel 2: M2M RPC
- Channel 23: File operations (TFTP-based)

### 2.2 Implement TFTP File Operations

**File to modify:** `src/protocols/webREPLCB.ts`

**New class:** `TFTPFileTransfer`

**Methods:**
- `readFile(path: string): Promise<Uint8Array>` - TFTP-based download
- `writeFile(path: string, data: Uint8Array): Promise<void>` - TFTP-based upload
- `handleBlock(blockNum: number, data: Uint8Array)` - Block reassembly

**Features:**
- 4KB blocks (aligned with ESP32 flash)
- Resume support (block-level)
- Progress tracking

### 2.3 Update Connection Class

**File to modify:** `src/webrepl/connection.ts`

**Changes:**
- Add `wcbHandler: WebREPLCBHandler`
- Add `wcbEnabled: boolean` flag
- Update `getFile()` to use WCB if available
- Update `putFile()` to use WCB if available
- Keep legacy fallback

**Protocol negotiation:**
```typescript
async connect(wsUrl: string, password: string): Promise<void> {
    // ...existing connection...
    
    // After auth, probe for WebREPL CB support
    try {
        await this.wcbHandler.probe();
        this.wcbEnabled = true;
        console.log('[WebREPL] WebREPL Binary Protocol available');
    } catch {
        this.wcbEnabled = false;
        console.log('[WebREPL] Using legacy protocol');
    }
}
```

## Phase 3: Debug Adapter Protocol (Days 6-10)

### 3.1 Create DAP Handler

**New file:** `src/debug/dapHandler.ts`

**Class:** `DAPHandler`

**Properties:**
```typescript
class DAPHandler {
    private connection: WebREPLConnection;
    private seq: number = 1;
    private initialized: boolean = false;
    private breakpoints: Map<string, number[]>;
    private stopped: boolean = false;
    
    // Event emitters for VS Code
    private _onInitialized: vscode.EventEmitter<void>;
    private _onStopped: vscode.EventEmitter<StoppedEvent>;
    private _onContinued: vscode.EventEmitter<void>;
}
```

**Key methods:**
- `handleMessage(message: string)` - Parse incoming DAP
- `sendRequest(command: string, args: any)` - Send DAP request
- `sendResponse(request: any, body?: any)` - Send DAP response
- `sendEvent(event: string, body?: any)` - Send DAP event

**Command handlers:**
- `handleInitialize()` - Capability negotiation
- `handleLaunch()` - Start debugging a script
- `handleAttach()` - Attach to running REPL
- `handleSetBreakpoints()` - Manage breakpoints
- `handleContinue()` - Resume execution
- `handleNext()`, `handleStepIn()`, `handleStepOut()` - Stepping
- `handleStackTrace()` - Get call stack
- `handleScopes()`, `handleVariables()` - Inspect state

### 3.2 Create Debug Adapter

**New file:** `src/debug/adapter.ts`

**Class:** `MicroPythonDebugSession`

Implements `vscode.DebugAdapter` interface

**Methods:**
```typescript
class MicroPythonDebugSession implements vscode.DebugAdapter {
    constructor(
        private connection: WebREPLConnection,
        private dapHandler: DAPHandler
    ) {}
    
    handleMessage(message: vscode.DebugProtocolMessage): void {
        // Route to DAP handler
        this.dapHandler.handleMessage(JSON.stringify(message));
    }
    
    dispose(): void {
        // Cleanup
    }
}
```

### 3.3 Create Debug Adapter Factory

**New file:** `src/debug/factory.ts`

**Class:** `MicroPythonDebugAdapterFactory`

```typescript
class MicroPythonDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    constructor(
        private connection: WebREPLConnection
    ) {}
    
    createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        // Return inline adapter using existing WebSocket
        return new vscode.DebugAdapterInlineImplementation(
            new MicroPythonDebugSession(this.connection)
        );
    }
}
```

### 3.4 Create Debug Configuration Provider

**New file:** `src/debug/configProvider.ts`

**Class:** `MicroPythonDebugConfigProvider`

```typescript
class MicroPythonDebugConfigProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // Provide defaults
        if (!config.type) {
            config.type = 'micropython-esp32';
        }
        
        if (!config.request) {
            config.request = 'attach';
        }
        
        if (!config.program && config.request === 'launch') {
            config.program = '/main.py';
        }
        
        return config;
    }
}
```

### 3.5 Register Debug Support

**File to modify:** `src/extension.ts`

**Changes:**
```typescript
export function activate(context: vscode.ExtensionContext) {
    // ...existing activation...
    
    const webreplConnection = new WebREPLConnection(outputChannel, bridgeWebview);
    
    // NEW: Register debug adapter
    const debugFactory = new MicroPythonDebugAdapterFactory(webreplConnection);
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory(
            'micropython-esp32',
            debugFactory
        )
    );
    
    // NEW: Register debug config provider
    const configProvider = new MicroPythonDebugConfigProvider();
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider(
            'micropython-esp32',
            configProvider
        )
    );
}
```

### 3.6 Update package.json

**File to modify:** `package.json`

**Add debugger contribution:**
```json
{
  "contributes": {
    "debuggers": [{
      "type": "micropython-esp32",
      "label": "MicroPython ESP32 Debug",
      "languages": ["python"],
      "configurationAttributes": {
        "launch": {
          "required": ["program"],
          "properties": {
            "program": {
              "type": "string",
              "description": "Path to Python file on device",
              "default": "/main.py"
            },
            "stopOnEntry": {
              "type": "boolean",
              "description": "Stop at first line",
              "default": true
            },
            "noDebug": {
              "type": "boolean",
              "description": "Run without debugging",
              "default": false
            }
          }
        },
        "attach": {
          "properties": {}
        }
      },
      "initialConfigurations": [
        {
          "type": "micropython-esp32",
          "request": "launch",
          "name": "Launch MicroPython",
          "program": "/main.py",
          "stopOnEntry": true
        },
        {
          "type": "micropython-esp32",
          "request": "attach",
          "name": "Attach to MicroPython"
        }
      ],
      "configurationSnippets": [
        {
          "label": "MicroPython: Launch",
          "description": "Launch MicroPython script with debugging",
          "body": {
            "type": "micropython-esp32",
            "request": "launch",
            "name": "Launch MicroPython",
            "program": "/main.py",
            "stopOnEntry": true
          }
        }
      ]
    }]
  }
}
```

## Phase 4: Integration & Testing (Days 11-14)

### 4.1 Update Status Bar

**File to modify:** `src/statusBar.ts`

**Changes:**
- Show protocol version (Legacy vs WebREPL CB)
- Show debug state (running, paused, stopped)
- Click to toggle debug view

### 4.2 Add Debug Commands

**File to modify:** `src/extension.ts`

**New commands:**
- `micropython.debug.toggleBreakpoint` - Set/clear breakpoint
- `micropython.debug.continue` - Resume execution
- `micropython.debug.stepOver` - Step to next line
- `micropython.debug.stepInto` - Step into function
- `micropython.debug.stepOut` - Step out of function

### 4.3 Create Test Suite

**New directory:** `src/test/`

**Test files:**
- `protocols/webREPLCB.test.ts` - CBOR encoding/decoding
- `protocols/tftp.test.ts` - File transfer
- `debug/dapHandler.test.ts` - DAP message handling
- `integration/connection.test.ts` - Full protocol flow

### 4.4 Documentation

**Files to create:**
- `docs/WEBREPL_CB.md` - WebREPL Binary Protocol usage
- `docs/DEBUGGING.md` - Debugging guide
- `docs/PROTOCOL_MIGRATION.md` - Legacy → WCB migration

**Files to update:**
- `README.md` - Add debugging features
- `CHANGELOG.md` - Document changes

## Success Criteria

### Phase 1 (Protocol Infrastructure)
- ✅ CBOR library integrated
- ✅ Protocol types defined
- ✅ Message router updated
- ✅ TEXT/BINARY discrimination working

### Phase 2 (WebREPL CB)
- ✅ CBOR messages encode/decode correctly
- ✅ Channel routing works
- ✅ File transfers use TFTP
- ✅ Legacy protocol still works as fallback
- ✅ Performance improvement measured

### Phase 3 (DAP)
- ✅ DAP messages parse correctly
- ✅ Breakpoints can be set
- ✅ Stepping commands work
- ✅ Stack traces display
- ✅ Variables can be inspected
- ✅ Launch and attach both work

### Phase 4 (Integration)
- ✅ All tests pass
- ✅ Documentation complete
- ✅ Works in vscode.dev (browser)
- ✅ Works in VS Code Desktop
- ✅ No breaking changes to existing features

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | Days 1-2 | Protocol infrastructure |
| Phase 2 | Days 3-5 | WebREPL CB working |
| Phase 3 | Days 6-10 | DAP working |
| Phase 4 | Days 11-14 | Tested, documented |
| **Total** | **~2 weeks** | **v0.2.0 release** |

## Risk Mitigation

**Risk:** Breaking existing users
**Mitigation:** 
- Keep legacy protocol as fallback
- Feature flags for new protocols
- Gradual rollout (beta channel)

**Risk:** Browser compatibility issues
**Mitigation:**
- Test in vscode.dev early and often
- Use browser-compatible CBOR library
- Polyfills for missing APIs

**Risk:** DAP spec complexity
**Mitigation:**
- Start with minimal DAP commands
- Reference ESP-IDF adapter implementation
- Test with standard VS Code UI

## Next Steps

1. ✅ Create implementation plan (this document)
2. 🔄 Install dependencies (cbor2)
3. 🔄 Create protocol types
4. 🔄 Update message router
5. 🔄 Implement WebREPL CB handler
6. 🔄 Implement DAP handler
7. 🔄 Test in vscode.dev
8. 🔄 Write documentation
9. 🔄 Release v0.2.0

---

**Status:** Ready to begin Phase 1
**Target Release:** v0.2.0 (2 weeks)
**Breaking Changes:** None (backward compatible)
