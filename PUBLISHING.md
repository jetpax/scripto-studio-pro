# Publishing Guide

## Prerequisites

1. **Visual Studio Code Publisher Account**
   - Create account at https://marketplace.visualstudio.com/manage
   - Create a publisher ID

2. **Install vsce** (VS Code Extension Manager)
   ```bash
   npm install -g @vscode/vsce
   ```

3. **Test Extension Thoroughly**
   - Complete all tests in TESTING.md
   - Verify on multiple platforms

## Pre-Publishing Checklist

### Required Files
- [x] README.md with clear documentation
- [x] CHANGELOG.md with version history
- [x] LICENSE file
- [x] package.json with correct metadata
- [ ] High-quality icon (PNG, 128x128px minimum)
- [ ] Screenshots for README
- [ ] Repository link in package.json

### Code Quality
- [x] No TypeScript errors
- [x] No linting errors
- [x] Webpack builds successfully
- [ ] Tested on real device
- [ ] No console errors in browser

### Documentation
- [x] Clear installation instructions
- [x] Usage examples
- [x] Configuration guide
- [x] Troubleshooting section
- [ ] Screenshots/GIFs of features
- [ ] Demo video (optional)

## Update Package.json

Before publishing, update these fields:

```json
{
  "name": "micropython-webrepl",
  "displayName": "MicroPython WebREPL",
  "description": "MicroPython development via WebREPL for ESP32 - Works on vscode.dev and iPad",
  "version": "0.1.0",
  "publisher": "YOUR_PUBLISHER_ID",
  "icon": "media/icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/micropython-webrepl"
  },
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/micropython-webrepl/issues"
  },
  "homepage": "https://github.com/YOUR_USERNAME/micropython-webrepl#readme"
}
```

## Create Marketplace Assets

### Icon (128x128 PNG)
Create a professional icon:
- PNG format
- 128x128 pixels minimum
- Transparent background
- Related to MicroPython/ESP32

### Screenshots
Capture these screenshots for the marketplace:
1. Extension sidebar with device files
2. Code editor with Python file
3. Terminal showing REPL output
4. File operations in action
5. Device UI iframe
6. Running on iPad (if possible)

Save as `media/screenshots/` and add to README.

### Banner (Optional)
- 980x90 pixels
- Related theme

## Build Extension

### Development Build
```bash
npm run compile-web
```

### Production Build
```bash
npm run package-web
```

### Package as VSIX
```bash
vsce package
```

This creates `micropython-webrepl-0.1.0.vsix`

## Test VSIX Locally

### In VS Code Desktop
1. Open Extensions view
2. Click "..." menu → "Install from VSIX"
3. Select the .vsix file
4. Test all features

### In vscode.dev
1. Go to https://vscode.dev
2. Install from VSIX (if supported)
3. Or publish to marketplace and install from there

## Publish to Marketplace

### First Time Setup

1. **Create Personal Access Token** (PAT) in Azure DevOps:
   - Go to https://dev.azure.com
   - Click User Settings → Personal Access Tokens
   - Create new token with "Marketplace" scope
   - Copy token (you won't see it again!)

2. **Login with vsce**:
   ```bash
   vsce login YOUR_PUBLISHER_ID
   # Enter your PAT when prompted
   ```

### Publish Extension

```bash
# Dry run (checks without publishing)
vsce publish --dry-run

# Publish
vsce publish
```

Or publish specific version:
```bash
vsce publish 0.1.0
```

### Patch/Minor/Major Updates

```bash
# Patch (0.1.0 → 0.1.1)
vsce publish patch

# Minor (0.1.0 → 0.2.0)
vsce publish minor

# Major (0.1.0 → 1.0.0)
vsce publish major
```

## Post-Publishing

### Verify Listing
1. Visit https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.micropython-webrepl
2. Check description renders correctly
3. Test installation from marketplace
4. Verify screenshots display properly

### Announce
- Tweet about it
- Post on Reddit (r/esp32, r/micropython)
- MicroPython forum
- ESP32 forum
- Blog post

### Monitor
- Watch for issues on GitHub
- Respond to marketplace Q&A
- Check download/rating statistics

## Update Workflow

When releasing updates:

1. **Make Changes**
   ```bash
   # Edit code
   npm run compile-web
   # Test changes
   ```

2. **Update Version**
   - Update `package.json` version
   - Add entry to CHANGELOG.md
   - Commit changes

3. **Build and Test**
   ```bash
   npm run package-web
   vsce package
   # Test .vsix locally
   ```

4. **Publish**
   ```bash
   vsce publish
   ```

5. **Tag Release**
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

## Troubleshooting Publishing

### "Publisher not found"
- Create publisher at https://marketplace.visualstudio.com/manage
- Update `publisher` field in package.json

### "Missing icon"
- Add icon file referenced in package.json
- Ensure it's a PNG (not SVG)
- Check file path is correct

### "Repository not found"
- Create GitHub repository first
- Update package.json with correct URL
- Make repository public

### "Invalid manifest"
- Run `vsce package --dry-run` to check
- Validate package.json syntax
- Ensure all required fields present

### "Build fails"
- Check TypeScript errors: `npm run compile-web`
- Check linting: `npm run lint`
- Ensure all dependencies installed

## Maintenance

### Regular Tasks
- [ ] Respond to issues within 48 hours
- [ ] Review and merge PRs
- [ ] Update dependencies monthly
- [ ] Test with new VS Code versions
- [ ] Monitor MicroPython updates

### Version Strategy
- **Patch** (0.1.x): Bug fixes only
- **Minor** (0.x.0): New features, backward compatible
- **Major** (x.0.0): Breaking changes

## Marketing

### VS Code Marketplace
- Use clear, searchable title
- Add relevant tags/categories
- Write compelling description
- Include quality screenshots
- Respond to Q&A promptly

### GitHub
- Create detailed README
- Add topics/tags
- Enable discussions
- Add contributing guide
- Set up issue templates

### Community
- MicroPython forums
- ESP32 forums
- Reddit communities
- Twitter/Mastodon
- YouTube demos

## Success Metrics

Track these metrics:
- Download count
- Active installs
- Rating (aim for 4.5+)
- GitHub stars
- Issue resolution time
- User feedback

## Support Channels

Provide support via:
1. GitHub Issues (bug reports)
2. GitHub Discussions (questions)
3. Marketplace Q&A
4. Documentation/FAQ

## Legal

Ensure you have rights to:
- All code you've written
- Third-party dependencies (check licenses)
- Any assets (icons, images)

All clear for this project:
- Code: MIT License ✓
- xterm.js: MIT License ✓
- Based on Scripto Studio: Attribution given ✓

## Ready to Publish?

Final checklist:
- [ ] All tests pass
- [ ] Documentation complete
- [ ] Icon created
- [ ] Screenshots added
- [ ] Repository created
- [ ] Package.json updated
- [ ] CHANGELOG.md updated
- [ ] Version number correct
- [ ] Publisher account created
- [ ] vsce installed
- [ ] Build succeeds
- [ ] VSIX tested locally

If all checked, you're ready to publish! 🚀


