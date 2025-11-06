# Change Log

All notable changes to the "MicroPython WebREPL" extension will be documented in this file.

## [0.1.0] - 2025-01-XX

### Initial Release

#### Features
- WebREPL connection to MicroPython devices via WebSocket
- Device file tree view in sidebar
- File operations: upload, download, create, delete, rename
- Integrated xterm.js terminal with REPL
- Run current file or selection on device
- Device UI iframe support (DISPLAY-UI command)
- Status bar with connection indicator
- Real-time device status updates (AUTO-INFO broadcast)
- FileSystemProvider for device files (webrepl:// URI scheme)
- Full support for vscode.dev and iPad Safari
- Configuration settings for default IP, password, auto-connect

#### Architecture
- Ported from Scripto Studio web app
- Pure TypeScript implementation
- Web extension compatible (no Node.js dependencies)
- Event-driven WebREPL protocol implementation
- RAW REPL mode for reliable code execution
- Binary protocol for file transfers

#### Browser Compatibility
- Chrome/Chromium ✅
- Firefox ✅
- Safari (macOS and iPad) ✅
- Edge ✅

### Known Limitations
- No offline file caching yet
- Terminal history not persisted between sessions
- Large file transfers may be slow over WiFi

### Future Plans
- Connection history and quick connect
- Snippet library for common MicroPython code
- Device discovery via mDNS
- File diffing and sync
- Terminal command history persistence
- Multiple device connections


