# Changelog

All notable changes to the ScriptO Studio Pro extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Debug Adapter Protocol (DAP) support** - Full debugging capabilities
  - Set breakpoints in Python files
  - Step over/into/out execution
  - Continue/pause execution
  - Launch and attach modes
  - Debug toolbar integration
  - Stack trace support (requires device implementation)
  - Variable inspection (requires device implementation)

- **WebREPL CB Protocol support** - CBOR-based channelized protocol
  - TFTP file transfers (4KB blocks, faster than legacy)
  - Channel-based message routing
  - Protocol negotiation and auto-fallback
  - Directory operations via CBOR messages
  - Backward compatible with legacy WebREPL

- **Protocol Multiplexing** - Single WebSocket, multiple protocols
  - TEXT frames (opcode 0x01) → DAP
  - BINARY frames (opcode 0x02) → WebREPL CB or Legacy
  - Automatic protocol detection and routing

- **New protocol handlers**
  - `src/protocols/types.ts` - Protocol type definitions
  - `src/protocols/webREPLCB.ts` - WebREPL CB CBOR handler
  - `src/debug/dapHandler.ts` - DAP message handler
  - `src/debug/adapter.ts` - VS Code debug adapter integration

- **Debug configuration snippets** in `launch.json`
  - Launch script with debugging
  - Attach to running interpreter

### Changed
- `src/webrepl/connection.ts` - Added protocol discrimination
- `package.json` - Added debugger contribution and CBOR dependency
- `src/extension.ts` - Registered debug adapter factory

### Documentation
- `IMPLEMENTATION_PLAN.md` - Complete implementation roadmap
- `MIGRATION_SUMMARY.md` - Summary of changes and testing guide
- Updated README with debugging features
- Cross-referenced protocol specifications in webrepl repository

## [0.1.2] - 2025-01-XX

### Initial Release
- WebREPL connection management
- Terminal with interactive REPL
- File browser for device filesystem
- Run code directly from editor
- ScriptO integration
- Device UI display via iframe
- Auto-INFO status bar
- Works on vscode.dev and iPad Safari

---

## Version Guidelines

- **Major (X.0.0)**: Breaking changes, major feature additions
- **Minor (0.X.0)**: New features, backward compatible
- **Patch (0.0.X)**: Bug fixes, minor improvements

## Feature Status

- ✅ **Stable**: Production-ready, fully tested
- 🚧 **Beta**: Implemented but needs more testing
- ⏳ **Planned**: On roadmap, not yet implemented
- ❌ **Deprecated**: No longer supported

## Contributing

When adding features:
1. Update this CHANGELOG
2. Follow [Keep a Changelog](https://keepachangelog.com/) format
3. Document breaking changes clearly
4. Include migration guide if needed
