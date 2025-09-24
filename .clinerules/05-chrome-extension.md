# Chrome Extension Rules

- Use Manifest V3 only.
- Do not edit dist/ or build/ folders (generated).
- Keep background, content scripts, popup/options, and shared modules separated and clear.
- Keep permissions minimal and documented inline in manifest.json.
- No eval, new Function, or inline scripts. All scripts must be declared in manifest.json.
- Add a strict Content Security Policy in HTML pages.
- README.md must also include:
  - Section: **How to install the extension in Chrome**
    - "1. Open chrome://extensions/
       2. Enable Developer Mode
       3. Click 'Load unpacked' and select the dist/ folder
       4. Confirm the extension appears and works"
- Use typed message names for runtime messaging.
- Abstract Chrome APIs behind typed wrappers/adapters.
- Ensure background state can reload from storage on startup.
- Provide basic smoke tests to validate manifest.json and extension loading.
