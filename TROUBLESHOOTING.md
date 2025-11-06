# Troubleshooting WebSocket Connection Errors

## Common Issue: "WebSocket connection error" when connecting

### Most Common Cause: Mixed Content (HTTPS → WS)

**Problem**: If you're using `https://vscode.dev`, browsers block `ws://` connections for security reasons (mixed content policy).

**Solutions**:

1. **Use HTTP instead of HTTPS** (for testing)
   - Go to `http://vscode.dev` instead of `https://vscode.dev`
   - Note: This is less secure but works for local development

2. **Use VS Code Desktop** (Recommended)
   - Desktop VS Code has no mixed content restrictions
   - Download from: https://code.visualstudio.com/

3. **Configure device for WSS** (Advanced)
   - If your device supports `wss://` (WebSocket Secure), use that
   - Change URL to: `wss://192.168.1.32/webrepl`
   - Requires SSL certificate on device

### Other Common Issues

#### 1. Device Not Reachable

**Check connectivity**:
```bash
# Ping the device
ping 192.168.1.32

# Try opening HTTP interface
# Open in browser: http://192.168.1.32
```

**If ping fails**:
- Device might be powered off
- You're on wrong WiFi network
- Device IP changed (check router admin)

#### 2. WebREPL Not Enabled

**Verify on device**:
```python
# Connect via USB serial
import webrepl
webrepl.start()
# Should see: "WebREPL server started on ws://0.0.0.0:8266/"
```

**Enable WebREPL**:
```python
import webrepl_setup
# Follow prompts to set password
# Reboot device after setup
```

#### 3. Wrong URL Format

**Correct formats**:
- ✅ `ws://192.168.1.32/webrepl`
- ✅ `ws://192.168.1.32:8266/webrepl` (if custom port)
- ❌ `http://192.168.1.32/webrepl` (wrong protocol)
- ❌ `ws://192.168.1.32` (missing /webrepl path)

#### 4. Firewall Blocking Connection

**Check firewall**:
- Windows: Check Windows Firewall settings
- Mac: Check System Preferences → Security
- Router: Check router firewall settings

**Test**:
- Try from another device on same network
- Temporarily disable firewall to test

#### 5. Device in AP Mode

**If device creates its own WiFi network**:
- Connect your computer to device's WiFi network first
- Device IP is usually `192.168.4.1` in AP mode
- Use: `ws://192.168.4.1/webrepl`

#### 6. Wrong Password

**Error message**: "Authentication failed - incorrect password"

**Solutions**:
- Reset password: `import webrepl_setup`
- Default password might be `rtyu4567`
- Check password doesn't have special characters that need escaping

### Debug Steps

1. **Check browser console** (F12 → Console)
   - Look for WebSocket errors
   - Check for CORS errors
   - Look for mixed content warnings

2. **Verify device is running WebREPL**:
   ```python
   # On device via USB serial
   import webrepl
   webrepl.start()
   ```

3. **Test WebSocket manually**:
   ```javascript
   // In browser console on http://vscode.dev
   const ws = new WebSocket('ws://192.168.1.32/webrepl');
   ws.onopen = () => console.log('Connected!');
   ws.onerror = (e) => console.error('Error:', e);
   ```

4. **Check network**:
   - Are you on same WiFi as device?
   - Can you access device's web interface?
   - Is device IP static or does it change?

### Platform-Specific Notes

#### vscode.dev (Browser)
- **Mixed content**: Use `http://vscode.dev` or VS Code Desktop
- **CORS**: Usually not an issue for WebSockets
- **Network**: Must be on same network as device

#### VS Code Desktop
- **No mixed content issues**: Can use `ws://` from any context
- **Network**: Same requirements as browser
- **Firewall**: May need to allow VS Code through firewall

#### iPad/Tablet
- **Use Safari**: Works best on iPad
- **Network**: Connect to device WiFi or same network
- **Mixed content**: Same as browser (use http://vscode.dev)

### Still Having Issues?

1. Check browser console for detailed errors
2. Verify device is actually running WebREPL
3. Test with Scripto Studio or original web client first
4. Try connecting from another device/computer
5. Check device logs if available

### Getting More Help

If you're still stuck:
1. Check browser console errors (F12)
2. Note the exact error message
3. Check device serial output for errors
4. Verify device firmware supports WebREPL
5. Try connecting with original webrepl client first


