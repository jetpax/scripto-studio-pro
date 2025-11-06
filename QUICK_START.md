# Quick Start: Loading Extension into vscode.dev

## Option 1: Install from VSIX (Recommended for Testing)

### Step 1: Build the Extension
```bash
cd /Users/jep/github/micropython-webrepl
npm install
npm run compile-web
```

This creates the compiled extension in `dist/web/extension.js`.

### Step 2: Package as VSIX
```bash
# Install vsce if you haven't already
npm install -g @vscode/vsce

# Package the extension
vsce package
```

This creates `micropython-webrepl-0.1.0.vsix` in the current directory.

### Step 3: Install in vscode.dev

**Method A: Direct Install (if supported)**
1. Go to https://vscode.dev
2. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Click the "..." menu (three dots) in the Extensions view
4. Select "Install from VSIX..."
5. Upload the `.vsix` file

**Method B: Local Development Server**
1. Start a local HTTP server to serve the extension:
   ```bash
   cd /Users/jep/github/micropython-webrepl
   npx http-server -p 8080
   ```
2. In vscode.dev, you may need to install via URL or use the extension development host

### Step 4: Verify Installation
1. Open vscode.dev
2. Look for the MicroPython icon in the Activity Bar (left sidebar)
3. Click it to see the "Device Files" view
4. Try connecting to your device!

---

## Option 2: Publish to Marketplace (For Distribution)

### Step 1: Create Publisher Account
1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with GitHub/Microsoft account
3. Create a publisher ID (e.g., "jetpax")

### Step 2: Update package.json
Edit `package.json` to add your publisher:
```json
{
  "publisher": "your-publisher-id",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/micropython-webrepl"
  }
}
```

### Step 3: Publish
```bash
# Login (you'll need a Personal Access Token from Azure DevOps)
vsce login your-publisher-id

# Publish
vsce publish
```

### Step 4: Install from Marketplace
1. Go to https://vscode.dev
2. Open Extensions
3. Search for "MicroPython WebREPL"
4. Click Install

---

## Option 3: Development Mode (For Active Development)

### Step 1: Build in Watch Mode
```bash
cd /Users/jep/github/micropython-webrepl
npm run watch-web
```

This watches for changes and rebuilds automatically.

### Step 2: Open in VS Code Desktop
```bash
code .
```

### Step 3: Launch Extension Development Host
1. Press F5 (or go to Run → Start Debugging)
2. A new VS Code window opens with your extension loaded
3. This loads the extension in a web extension host

### Step 4: Test in Development Host
- The extension will be loaded in the new window
- Make changes to code
- Reload the extension development host window (Ctrl+R / Cmd+R)

---

## Troubleshooting

### "Extension not found" or "Cannot load extension"
- Make sure you ran `npm run compile-web` first
- Check that `dist/web/extension.js` exists
- Verify the `browser` field in package.json points to the correct path

### "Cannot install VSIX in vscode.dev"
- VS Code web may have restrictions on local VSIX installation
- Try Option 2 (publish to marketplace) instead
- Or use Option 3 (development mode in desktop VS Code)

### "Extension loads but doesn't work"
- Check browser console for errors (F12 → Console)
- Verify WebREPL connection details
- Ensure device is on same network or connected to device AP

### Build Errors
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run compile-web
```

---

## Quick Test Checklist

Once installed in vscode.dev:

- [ ] MicroPython icon appears in Activity Bar
- [ ] "Device Files" view is visible
- [ ] Click "Connect" button works
- [ ] Can enter IP and password
- [ ] Status bar shows connection status
- [ ] Terminal view opens (if available)

---

## For iPad Testing

1. Open Safari on iPad
2. Navigate to https://vscode.dev
3. Install extension (via marketplace or if you set up local serving)
4. Connect to your ESP32 device's WiFi network
5. Use extension as normal!

---

## Next Steps

After successful installation:
1. Connect to your ESP32 device
2. Test file operations
3. Try running code
4. See TESTING.md for comprehensive test plan


