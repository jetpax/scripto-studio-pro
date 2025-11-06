# ScriptO Studio Pro

VS Code extension for MicroPython development via WebREPL. Works on vscode.dev and iPad Safari.

## Features

- Connect to MicroPython devices via WebREPL
- Terminal with interactive REPL
- File browser for device filesystem
- Run code directly from editor (no save required)
- Add ScriptOs from workspace
- Device UI display via iframe
- Auto-INFO status bar display

## Installation

1. Install from VS Code marketplace (when published)
2. Or install from source: `npm install && npm run compile-web`

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

- `micropython.defaultIP`: Default device IP (default: "192.168.4.1")
- `micropython.defaultPassword`: Default WebREPL password
- `micropython.autoConnect`: Auto-connect on startup
- `micropython.terminalFontSize`: Terminal font size

## Development

```bash
npm install
npm run compile-web    # Compile extension
npm run watch-web      # Watch mode for development
```

## License

AGPL-3.0
