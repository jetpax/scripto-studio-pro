# Testing Guide for MicroPython WebREPL Extension

This document outlines the testing procedures for the VS Code extension on different platforms.

## Test Environments

### 1. VS Code Desktop
- Windows 10/11
- macOS 
- Linux (Ubuntu/Debian)

### 2. vscode.dev (Browser)
- Chrome/Chromium
- Firefox
- Safari (macOS)
- Edge

### 3. iPad/Tablet
- Safari on iPad (primary target)
- Chrome on Android tablet

## Prerequisites

### Device Setup
1. **ESP32 with MicroPython** installed
2. **WebREPL enabled** on device:
   ```python
   import webrepl_setup
   # Follow prompts, set password
   # Reboot device
   ```
3. **Connect to device WiFi** or ensure device is on same network
4. **Verify WebREPL works** using original web client first

### Test Files
Create these test files in your workspace:
- `test_simple.py` - Simple print statements
- `test_led.py` - Blink built-in LED
- `test_error.py` - Code that raises exception
- `test_large.py` - Large file (>10KB)

## Test Cases

### Phase 1: Connection Tests

#### TC-01: Basic Connection
- [ ] Open extension sidebar
- [ ] Click "Connect" button
- [ ] Enter device IP (e.g., `192.168.4.1`)
- [ ] Enter password
- [ ] Verify: Status bar shows "Connected"
- [ ] Verify: Connection icon changes
- [ ] Verify: Files appear in tree view

#### TC-02: Connection Failure
- [ ] Try connecting with wrong password
- [ ] Verify: Error message displayed
- [ ] Try connecting to wrong IP
- [ ] Verify: Timeout error shown

#### TC-03: Disconnect
- [ ] Click disconnect in status bar
- [ ] Verify: Status changes to "Disconnected"
- [ ] Verify: File tree clears

#### TC-04: Reconnect
- [ ] Connect, then disconnect
- [ ] Use "Reconnect" command
- [ ] Verify: Uses saved credentials
- [ ] Verify: Connection restored

### Phase 2: File Operations

#### TC-05: View Device Files
- [ ] Connect to device
- [ ] Verify: All files/folders visible in tree
- [ ] Expand folders
- [ ] Verify: Nested files shown
- [ ] Verify: File sizes displayed

#### TC-06: Open Device File
- [ ] Click `boot.py` in tree
- [ ] Verify: File opens in editor
- [ ] Verify: Content is correct
- [ ] Verify: Syntax highlighting works

#### TC-07: Edit and Save Device File
- [ ] Open file from device
- [ ] Make changes
- [ ] Save (Ctrl+S / Cmd+S)
- [ ] Reopen file
- [ ] Verify: Changes persisted

#### TC-08: Upload File
- [ ] Create `test_simple.py` in workspace
- [ ] Right-click → "Upload File to Device"
- [ ] Enter path: `/test_simple.py`
- [ ] Verify: Success message
- [ ] Verify: File appears in tree
- [ ] Open from device and verify content

#### TC-09: Download File
- [ ] Select device file in tree
- [ ] Click to open (downloads automatically)
- [ ] Verify: Content displayed correctly
- [ ] Save to workspace folder
- [ ] Verify: File saved locally

#### TC-10: Create New File
- [ ] Click "+" icon in tree view
- [ ] Enter name: `test_new.py`
- [ ] Verify: File created with template
- [ ] Verify: File opens in editor
- [ ] Verify: File exists on device

#### TC-11: Delete File
- [ ] Create test file on device
- [ ] Right-click → "Delete"
- [ ] Confirm deletion
- [ ] Verify: File removed from tree
- [ ] Try to open (should fail)

#### TC-12: Rename File
- [ ] Select file in tree
- [ ] Right-click → "Rename"
- [ ] Enter new name
- [ ] Verify: File renamed in tree
- [ ] Open file to confirm

#### TC-13: Create Folder
- [ ] Use "Create New Folder" command
- [ ] Enter name: `test_folder`
- [ ] Verify: Folder appears in tree
- [ ] Create file inside folder
- [ ] Verify: Nested properly

#### TC-14: Large File Transfer
- [ ] Upload file >10KB
- [ ] Verify: Progress indication
- [ ] Verify: Complete file transferred
- [ ] Download same file
- [ ] Compare contents

### Phase 3: Terminal Tests

#### TC-15: Terminal Opens
- [ ] Connect to device
- [ ] Open terminal view
- [ ] Verify: Terminal displays
- [ ] Verify: Welcome message shown

#### TC-16: REPL Commands
- [ ] Type: `print("Hello")`
- [ ] Press Enter
- [ ] Verify: Output appears
- [ ] Try: `1+1`
- [ ] Verify: Result `2` shown

#### TC-17: Multi-line Input
- [ ] Enter multi-line code:
  ```python
  for i in range(3):
      print(i)
  ```
- [ ] Verify: Output shows 0, 1, 2

#### TC-18: Error Handling
- [ ] Enter: `undefined_variable`
- [ ] Verify: Error shown in red
- [ ] Verify: Terminal still responsive

#### TC-19: Interrupt Execution
- [ ] Run infinite loop:
  ```python
  while True:
      pass
  ```
- [ ] Press Ctrl+C
- [ ] Verify: Loop interrupted
- [ ] Verify: REPL prompt returns

#### TC-20: Terminal Copy/Paste
- [ ] Select text in terminal
- [ ] Copy (Ctrl+C / Cmd+C)
- [ ] Paste (Ctrl+V / Cmd+V)
- [ ] Verify: Text pasted correctly

### Phase 4: Code Execution

#### TC-21: Run Current File
- [ ] Open `test_simple.py`:
  ```python
  print("Test 1")
  print("Test 2")
  ```
- [ ] Press Ctrl+Shift+Enter
- [ ] Verify: Output in terminal
- [ ] Verify: Both prints appear

#### TC-22: Run Selection
- [ ] Open file with multiple functions
- [ ] Select one function
- [ ] Run selection command
- [ ] Verify: Only selected code runs

#### TC-23: Run File with Imports
- [ ] Create file importing `machine`:
  ```python
  import machine
  print(machine.freq())
  ```
- [ ] Run file
- [ ] Verify: Frequency printed

#### TC-24: Run File with Errors
- [ ] Create `test_error.py`:
  ```python
  print("Before error")
  x = 1 / 0
  print("After error")
  ```
- [ ] Run file
- [ ] Verify: "Before error" printed
- [ ] Verify: Error message shown
- [ ] Verify: "After error" NOT printed

### Phase 5: Device UI Tests

#### TC-25: Manual Device UI
- [ ] Command: "Show Device UI"
- [ ] Enter: `http://192.168.4.1/`
- [ ] Verify: UI opens in panel
- [ ] Verify: Device webpage loads

#### TC-26: Automatic Device UI
- [ ] From device REPL:
  ```python
  import json
  print(json.dumps({"CMD": "DISPLAY-UI", "ARG": {"url": "http://192.168.4.1", "title": "Test"}}))
  ```
- [ ] Verify: UI opens automatically
- [ ] Verify: Title shows "Test"

#### TC-27: Close Device UI
- [ ] Open device UI
- [ ] Use "Close Device UI" command
- [ ] Verify: Panel closes

### Phase 6: Settings Tests

#### TC-28: Default IP
- [ ] Set `micropython.defaultIP` to device IP
- [ ] Disconnect and reconnect
- [ ] Verify: IP pre-filled in dialog

#### TC-29: Default Password
- [ ] Set `micropython.defaultPassword`
- [ ] Reconnect
- [ ] Verify: Password pre-filled

#### TC-30: Auto-Connect
- [ ] Enable `micropython.autoConnect`
- [ ] Reload VS Code
- [ ] Verify: Automatically connects

#### TC-31: Terminal Font Size
- [ ] Change `micropython.terminalFontSize` to 16
- [ ] Open terminal
- [ ] Verify: Font size changed

### Phase 7: Platform-Specific Tests

#### TC-32: vscode.dev Desktop Browser
- [ ] Open vscode.dev in Chrome
- [ ] Install extension
- [ ] Run TC-01 through TC-27
- [ ] Verify: All features work

#### TC-33: iPad Safari
- [ ] Open vscode.dev on iPad
- [ ] Install extension
- [ ] Connect to device
- [ ] Test file operations (TC-06 to TC-13)
- [ ] Test terminal with on-screen keyboard
- [ ] Verify: Touch interface works
- [ ] Test split view (editor + terminal)

#### TC-34: Firefox
- [ ] Open vscode.dev in Firefox
- [ ] Run core tests (TC-01, TC-06, TC-15, TC-21)
- [ ] Verify: WebSocket works
- [ ] Verify: File operations work

#### TC-35: Safari macOS
- [ ] Open vscode.dev in Safari
- [ ] Run core tests
- [ ] Verify: No File System Access API issues

### Phase 8: Stress Tests

#### TC-36: Multiple Files
- [ ] Upload 10+ files rapidly
- [ ] Verify: All succeed
- [ ] Verify: No crashes

#### TC-37: Large Terminal Output
- [ ] Run code that prints 1000+ lines
- [ ] Verify: Terminal handles it
- [ ] Verify: Scrolling works

#### TC-38: Connection Loss
- [ ] Connect to device
- [ ] Turn off device WiFi
- [ ] Verify: Disconnect detected
- [ ] Turn on WiFi
- [ ] Reconnect
- [ ] Verify: Connection restored

#### TC-39: Rapid Connect/Disconnect
- [ ] Connect and disconnect 10 times rapidly
- [ ] Verify: No memory leaks
- [ ] Verify: Extension still responsive

### Phase 9: Error Recovery

#### TC-40: Invalid File Path
- [ ] Try to open non-existent file
- [ ] Verify: Error message shown
- [ ] Verify: Extension still works

#### TC-41: Out of Memory
- [ ] Try to upload very large file
- [ ] Verify: Proper error handling
- [ ] Verify: Connection maintained

#### TC-42: Malformed JSON
- [ ] Send invalid JSON command from device
- [ ] Verify: Ignored gracefully
- [ ] Verify: Terminal still works

## Test Results Template

```markdown
## Test Run: [Date]

**Tester**: [Name]
**Platform**: [Desktop/vscode.dev/iPad]
**Browser**: [Chrome/Firefox/Safari]
**Device**: [ESP32 model]
**MicroPython Version**: [version]

### Results Summary
- Total Tests: 42
- Passed: X
- Failed: Y
- Skipped: Z

### Failed Tests
- TC-XX: [Description]
  - Expected: [...]
  - Actual: [...]
  - Screenshot: [link]

### Notes
- [Any additional observations]
```

## Automated Testing (Future)

Consider adding:
- Unit tests for connection logic
- Mock WebSocket for integration tests
- CI/CD pipeline for builds
- Automated UI tests with Playwright

## Bug Reporting

When reporting bugs, include:
1. Test case number (TC-XX)
2. Platform and browser
3. Steps to reproduce
4. Expected vs actual behavior
5. Screenshots/logs
6. Device and MicroPython version


