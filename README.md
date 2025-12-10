# ScriptO Studio Pro

VS Code extension for MicroPython development via WebREPL. Works on vscode.dev and iPad Safari.

## Features

- **🔌 Connect** to MicroPython devices via WebREPL (WiFi or USB)
- **🖥️ Terminal** with interactive REPL
- **📁 File Browser** for device filesystem
- **▶️ Run Code** directly from editor (no save required)
- **🐛 Debug** with breakpoints, stepping, and variable inspection (NEW!)
- **📦 Protocol Support:**
  - WebREPL CB (CBOR-based, channelized)
  - Debug Adapter Protocol (DAP) over WebSocket
  - Legacy WebREPL (backward compatible)
- **🎨 ScriptO Integration** - Add ScriptOs from workspace
- **📱 Device UI** display via iframe
- **ℹ️ Auto-INFO** status bar display

## Installation

### From Marketplace (Coming Soon)
1. Search for "ScriptO Studio Pro" in VS Code Extensions
2. Click Install

### From Source
```bash
git clone https://github.com/jetpax/scripto-studio-pro
cd scripto-studio-pro
npm install
npm run compile-web
```

Then press F5 to launch Extension Development Host

## Usage

### Connecting to Device

1. Click "Connect to Device" in the Device Files sidebar
2. Enter device IP address (default: 192.168.4.1)
3. Enter WebREPL password
4. Connection status shown in status bar

### Running Code

- **Click the Play button** in the editor toolbar to run the current file
- **No save required** - code runs directly from editor memory
- Code executes on the connected device via WebREPL

### Adding ScriptOs

1. Click the "Add Scripto" button (folder-library icon) in editor toolbar
2. Select a ScriptO from the list
3. Configure parameters
4. Generated code opens in a new editor tab

### Debugging (NEW!)

1. **Connect to device** first
2. **Open a Python file** you want to debug
3. **Set breakpoints** by clicking the left gutter (red dots)
4. **Press F5** or click Run → Start Debugging
5. **Use debug toolbar** to step, continue, or pause

**Launch Configuration (`.vscode/launch.json`):**
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "micropython-esp32",
            "request": "launch",
            "name": "Launch /main.py",
            "program": "/main.py",
            "stopOnEntry": true
        }
    ]
}
```

**Debug Features:**
- ✅ Breakpoints
- ✅ Step over/into/out
- ✅ Continue/pause execution
- ⏳ Variable inspection (coming soon - requires device support)
- ⏳ Stack traces (coming soon - requires device support)

## Important Notes

### Python Extension Not Required

**You do NOT need the VS Code Python extension** for MicroPython development. This extension provides everything needed:

- ✅ Syntax highlighting (built into VS Code)
- ✅ Code execution via WebREPL
- ✅ File management
- ✅ Terminal/REPL

The Python extension adds:
- ❌ Default "Run Python File" commands (require saving)
- ❌ Python language server (not needed for MicroPython)
- ❌ Local interpreter management (not needed)

**To avoid save dialogs and combo buttons:**
- Disable the Python extension for this workspace
- Or use our Play button (preferred action) instead of the dropdown

### Running Unsaved Files

Our extension runs code directly from editor memory - **no save required**. If VS Code shows a save dialog:

1. **Click Cancel** - our command will still run using in-memory content
2. Or enable auto-save in VS Code settings: `"files.autoSave": "afterDelay"`

## Configuration

### Connection Settings
- `micropython.defaultIP`: Default device IP (default: "192.168.4.1")
- `micropython.defaultPassword`: Default WebREPL password
- `micropython.autoConnect`: Auto-connect on startup
- `micropython.terminalFontSize`: Terminal font size

### AI Agent Settings
- `micropython.ai.provider`: AI service provider (openai, anthropic, grok, etc.)
- `micropython.ai.apiKey`: API key for selected provider
- `micropython.ai.model`: Model to use (e.g., gpt-4o)
- `micropython.ai.endpoint`: Custom endpoint URL (for custom provider)
- `micropython.ai.systemPrompt`: Custom system prompt

### Debug Settings
Debug configurations are in `.vscode/launch.json` (see Debugging section above)

## Development

### Building
```bash
npm install           # Install dependencies
npm run compile-web   # Compile extension
npm run watch-web     # Watch mode for development
npm run package-web   # Package for production
```

### Testing
Press F5 in VS Code to launch Extension Development Host with your extension loaded.

### Architecture
- **Protocol Multiplexing:** WebSocket TEXT frames (DAP) + BINARY frames (WebREPL CB/Legacy)
- **Debug Adapter:** Implements VS Code Debug Adapter Protocol
- **WebREPL CB:** CBOR-based channelized protocol for efficient communication
- **Backward Compatible:** Supports legacy WebREPL (WA/WB) as fallback

See [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) for detailed implementation notes.

## Documentation

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Development roadmap
- [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) - What's been implemented
- [../webrepl/](../webrepl/) - Protocol specifications
  - `dap_websocket_advocacy.md` - Why DAP over WebSocket
  - `webrepl_cb_rfc.md` - WebREPL CB protocol spec
  - `docs/VSCODE_INTEGRATION.md` - VS Code integration guide

## Contributing

Contributions welcome! Please read the implementation docs first to understand the architecture.

## License

AGPL-3.0
