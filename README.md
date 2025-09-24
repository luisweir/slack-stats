# Slack Engagement Summary

A Chrome extension that analyses the currently open Slack channel view and produces compact engagement summaries. Export as CSV, copy as HTML/TSV, and filter by keywords (comma/semicolon separated) to focus on topics like AI, LLM, OpenAI.

## 📖 Overview
Analyse Slack messages you’ve scrolled into view in the browser and aggregate:
- Weeks table: messages, unique senders, reactions, files, replies, average message length (ISO week)
- Senders table: per-sender totals (messages, reactions, files, replies)

No backend, no Slack API tokens — everything runs locally in the browser.

## 📂 Project Structure
```
.
├─ manifest.json           # MV3 manifest
├─ popup.html              # Popup UI (no inline scripts)
├─ popup.js                # Popup logic (rendering, messaging, CSV/clipboard)
├─ content.js              # Content script (scrapes + aggregates Slack messages)
├─ slack-stats.png         # Extension icon
├─ .clinerules.yaml        # Project rules configuration
└─ README.md               # This document
```

## 🛠️ Setup
- Requirements: Google Chrome (or Chromium-based browser with Manifest V3 support)
- No Node.js or external dependencies required
- No environment variables needed

## ▶️ Development
Load the extension unpacked for quick iteration:
1. Open chrome://extensions/
2. Enable Developer Mode
3. Click “Load unpacked”
4. Select this project folder

Tip: Keep a Slack channel open and scroll to load messages before analysing.

## 📦 Build
Create a minimal distributable folder:
```bash
mkdir -p dist
cp manifest.json popup.html popup.js content.js slack-stats.png dist/
```
Optionally zip:
```bash
cd dist
zip -r ../slack-engagement-summary.zip .
```

## 🌐 How to Use
1. Open a Slack channel in your browser (URL must match https://*.slack.com/).
2. Click the extension icon to open the popup.
3. (Optional) Enter keywords in “Message keywords (comma/semicolon separated, e.g. ai, llm)”.
   - Example: ai, llm;openai; genai
   - Messages are included if they contain any of the keywords (OR semantics, case-insensitive).
4. Click “Analyse current Slack view”.
5. Switch between the Weeks and Senders tabs.
6. Use “Filter weeks/senders” inputs to filter visible rows in the rendered table.
7. Use “Copy” (HTML/TSV) or “Download CSV” to export the currently selected table.

## 🧪 Tests
There is currently no automated test suite; use the following smoke tests (as required by the Chrome Extension rules):
- Manifest/popup smoke test:
  1. Load the extension via chrome://extensions/ (see Development).
  2. Open the popup and confirm UI renders (tabs, filters, buttons).
- Content script smoke test:
  1. Open a Slack channel, scroll to load messages.
  2. Click “Analyse current Slack view”.
  3. Confirm Weeks and Senders tables populate and sorting works.
- Clipboard/CSV smoke test:
  1. Click “Copy” and paste into a spreadsheet (HTML/TSV).
  2. Click “Download CSV” and open the file to verify headers/rows.

Optional CLI to launch Chrome with a temp profile and load the unpacked extension (update the path):
```bash
open -na "Google Chrome" --args \
  --user-data-dir="/tmp/chrome-slack-stats" \
  --load-extension="/absolute/path/to/this/project"
```

## 🚀 Deployment
- Build and zip the extension (see 📦 Build).
- Go to the Chrome Web Store Developer Dashboard and create/update an item.
- Upload the zip, fill in listing details, provide screenshots/icons, and submit for review.
- For internal distribution, you can share the zip for manual installation in Developer Mode.

## 📝 Changelog
Changes, fixes, and new features are tracked per version. See [CHANGELOG.md](CHANGELOG.md) for the full history.

- Current highlights:
  - 1.0.6 — Added keyword-based message filtering (comma/semicolon separated) and updated documentation.
  - 1.0.0 — Initial release with Weeks/Senders tables, Copy, and CSV export.

## 👥 Authors / Maintainers
- Maintainer: lweir
- Contributors: Community contributions welcome

## 📌 Roadmap
- Keyword presets and saved filters
- Export JSON in addition to CSV
- Basic unit tests for table transforms and filtering
- Optional date range filter (from/to)
- Per-channel settings persistence

## 🤝 Contributing
Ideas, feedback, and contributions are welcome. Feel free to open an issue or submit a pull request.

## 📜 License
This project is licensed under the [Universal Permissive License v 1.0](https://oss.oracle.com/licenses/upl).

## ⚠️ Disclaimer
These scripts are provided for learning and demonstration purposes only. They are not part of any Oracle product or service, and should not be used for commercial, production, or business activities. Outputs may not be reliable and should not be reused beyond personal experimentation. Use is at your own discretion.

## 🧩 How to install the extension in Chrome
1. Open chrome://extensions/
2. Enable Developer Mode
3. Click 'Load unpacked' and select the dist/ folder
4. Confirm the extension appears and works
