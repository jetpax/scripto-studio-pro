# Testing Extension in vscode.dev

Since vscode.dev cannot directly load `.vsix` files, here are the best ways to test your extension in a browser-based environment:

## Method 1: Extension Development Host (Recommended) ⭐

This is the **easiest and best** way to test in a browser context that matches vscode.dev:

### Step 1: Build the Extension
```bash
cd /Users/jep/github/micropython-webrepl
npm install
npm run compile-web
```

This creates `dist/web/extension.js`.

### Step 2: Open in VS Code Desktop
```bash
code .
```

### Step 3: Launch Extension Development Host
1. Press **F5** (or Run → Start Debugging)
2. A new browser window will open with VS Code running in the browser
3. This is a **web extension host** - it runs in a browser just like vscode.dev!

### Step 4: Test Your Extension
- The extension is automatically loaded in the browser window
- Open the MicroPython sidebar to see your extension
- Test WebSocket connections - they work because it's in a browser context
- Use browser DevTools (F12) to debug if needed

### Step 5: Watch Mode (Optional)
For active development, keep a terminal running:
```bash
npm run watch-web
```

Then reload the extension development host window (Ctrl+R / Cmd+R) after making changes.

---

## Method 2: Publish to Marketplace (For Distribution)

If you want to test in actual vscode.dev (not the dev host):

### Step 1: Publish to Marketplace
```bash
# First time setup - create publisher account at:
# https://marketplace.visualstudio.com/manage

# Login
vsce login YOUR_PUBLISHER_ID

# Publish (you can publish a private/unlisted version)
vsce publish
```

### Step 2: Install from Marketplace
1. Go to https://vscode.dev (or http://vscode.dev to avoid HTTPS mixed content)
2. Open Extensions (Ctrl+Shift+X)
3. Search for "MicroPython WebREPL"
4. Click Install

**Note:** This requires you to publish, which makes it public. You can always unpublish later.

---

## Method 3: Local Development Server (Advanced)

You can serve the extension locally and potentially load it, though this is more complex:

### Step 1: Build Extension
```bash
npm run compile-web
```

### Step 2: Serve Extension
```bash
# Serve the entire extension directory
npx http-server -p 8080 -c-1
```

### Step 3: Try Loading (Experimental)
This method is less reliable, but you could try:
1. Open vscode.dev
2. Use browser DevTools console
3. Try to load extension manually (not officially supported)

**Recommendation:** Use Method 1 instead - it's much easier and more reliable.

---

## Quick Development Workflow

For active development, use this workflow:

### Terminal 1: Watch Mode
```bash
npm run watch-web
```
Keeps rebuilding on file changes.

### Terminal 2: VS Code Desktop
```bash
code .
```

### VS Code: Debug
1. Press **F5** to launch Extension Development Host
2. Browser window opens with extension loaded
3. Make changes to code
4. Reload browser window (Ctrl+R / Cmd+R) to see changes
5. Repeat!

---

## Troubleshooting

### "Extension not found" or "Cannot load extension"
- Make sure you ran `npm run compile-web` first
- Check that `dist/web/extension.js` exists
- Verify the `browser` field in `package.json` points to `./dist/web/extension.js`

### Extension Development Host Opens Desktop VS Code Instead of Browser
- Make sure you selected "Run Web Extension" configuration
- Check that `launch.json` has `"debugWebWorkerHost": true`
- Try selecting the configuration manually from the Run dropdown

### WebSocket Connection Fails
- Make sure you're using **http://vscode.dev** not **https://vscode.dev** (mixed content)
- Or use the Extension Development Host (Method 1) which handles this better
- Check browser console for errors (F12)

### Build Errors
```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run compile-web
```

---

## Why Method 1 is Best

1. ✅ **Exact same environment** as vscode.dev (browser-based)
2. ✅ **No publishing required** - test locally
3. ✅ **Hot reload** - just refresh browser window
4. ✅ **Full debugging** - use VS Code debugger + browser DevTools
5. ✅ **WebSocket works** - browser context supports ws:// connections
6. ✅ **No .vsix needed** - loads directly from source

The Extension Development Host with `--extensionDevelopmentKind=web` is essentially vscode.dev running locally!



























