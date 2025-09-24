// content.js
(() => {
  // Ping so the popup can verify the script is injected
  chrome.runtime?.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'SLACK_ENGAGEMENT_PING') {
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  // Helpers
  function collectRoots(rootDoc = document, seen = new Set()) {
    const roots = [];
    const queue = [rootDoc];
    while (queue.length) {
      const d = queue.shift();
      if (!d || seen.has(d)) continue;
      seen.add(d);
      roots.push(d);
      const allEls = d.querySelectorAll('*');
      for (const el of allEls) {
        if (el.shadowRoot && !seen.has(el.shadowRoot)) queue.push(el.shadowRoot);
        if (el.tagName === 'IFRAME') {
          try {
            if (el.contentDocument && !seen.has(el.contentDocument)) queue.push(el.contentDocument);
          } catch (_) {}
        }
      }
    }
    return roots;
  }

  function findMessageNodes(root) {
    return Array.from(root.querySelectorAll('.c-message_kit__background.p-message_pane_message__message'));
  }

  function isoWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 1 - day);
    const weekStart = date;
    const thursday = new Date(weekStart);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const jan1Day = jan1.getUTCDay() || 7;
    const week = Math.floor(((thursday - jan1) / 86400000 + jan1Day - 1) / 7) + 1;
    const key = `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    return { key, weekStart };
  }

  function toCSV(arr) {
    if (!arr || !arr.length) return '';
    const headers = Object.keys(arr[0]);
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    return [headers.join(','), ...arr.map(o => headers.map(h => esc(o[h] ?? '')).join(','))].join('\n');
  }

  // Best effort channel name
  function getChannelName() {
    // Try common header selectors
    const sels = [
      '[data-qa="channel_name"]',
      '[data-qa="page_heading"]',
      '[data-qa="channel_heading__name"]',
      'div.p-view_header__title h1',
      'div.p-view_header__entity_name',
      'h1.p-classic_nav__channel_header__channel_name'
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const txt = el.textContent.trim();
        if (txt) return txt;
      }
    }
    // Fallback to title like "general | Slack" or "thread | general | Slack"
    const t = document.title || '';
    const parts = t.split('|').map(s => s.trim()).filter(Boolean);
    const filtered = parts.filter(p => !/^slack$/i.test(p) && !/^thread$/i.test(p));
    if (filtered.length) return filtered[filtered.length - 1];
    return 'slack';
  }

  function analyse(keywords = []) {
    const channelName = getChannelName();

    const allRoots = collectRoots(document);
    let candidates = allRoots.flatMap(findMessageNodes);

    if (candidates.length === 0) {
      return { ok: false, error: 'No Slack-like message nodes found in the current view. Scroll the channel to load more.' };
    }

    const rowsRaw = candidates.map(node => {
      const senderBtn = node.querySelector('.c-message__sender_button');
      const sender = senderBtn ? senderBtn.textContent.trim() : '(unknown)';

      // Timestamp
      const tsEl = node.querySelector('[data-ts]');
      let tsMs = Date.now();
      if (tsEl && tsEl.getAttribute('data-ts')) {
        const sec = parseFloat(tsEl.getAttribute('data-ts'));
        if (isFinite(sec)) tsMs = Math.floor(sec * 1000);
      } else {
        const aria = node.querySelector('.c-timestamp')?.getAttribute('aria-label') || '';
        const parsed = Date.parse(aria.replace(/ at /i, ' '));
        if (!isNaN(parsed)) tsMs = parsed;
      }
      const date = new Date(tsMs);

      // Reactions
      const reactionCounts = Array.from(node.querySelectorAll('.c-reaction__count'))
        .map(s => parseInt(s.textContent.trim(), 10) || 0);
      const reactions = reactionCounts.reduce((a, b) => a + b, 0);

      // Files
      const files = node.querySelectorAll('.p-message_file, [data-qa="message_kit_files"] .c-pillow_file_container').length;

      // Replies
      let replies = 0;
      const replyEl = Array.from(node.querySelectorAll('button, a')).find(el => /reply|repl(y|ies)/i.test(el.textContent));
      if (replyEl) {
        const m = replyEl.textContent.match(/\d+/);
        if (m) replies = parseInt(m[0], 10);
      }

      // Text length
      const text = node.querySelector('[data-qa="message-text"]')?.innerText || '';
      const chars = text.trim().length;

      return { sender, date, reactions, files, replies, chars, _text: text.toLowerCase() };
    });

    const rows = (Array.isArray(keywords) && keywords.length)
      ? rowsRaw.filter(r => keywords.some(k => r._text.includes(String(k).toLowerCase())))
      : rowsRaw;

    // Group by ISO week
    const byWeek = new Map();
    for (const r of rows) {
      const { key, weekStart } = isoWeekKey(r.date);
      if (!byWeek.has(key)) {
        byWeek.set(key, {
          week: key,
          week_start_iso: weekStart.toISOString().slice(0, 10),
          messages: 0,
          unique_senders: new Set(),
          reactions: 0,
          files: 0,
          replies: 0,
          _chars_sum: 0
        });
      }
      const g = byWeek.get(key);
      g.messages++;
      g.unique_senders.add(r.sender);
      g.reactions += r.reactions;
      g.files += r.files;
      g.replies += r.replies;
      g._chars_sum += r.chars;
    }

    const weekTable = Array.from(byWeek.values()).map(g => ({
      Week: g.week,
      'Week start': g.week_start_iso,
      Messages: g.messages,
      'Unique senders': g.unique_senders.size,
      Reactions: g.reactions,
      'Files shared': g.files,
      Replies: g.replies,
      'Avg msg length': g.messages ? Math.round(g._chars_sum / g.messages) : 0
    }));

    const senderTable = Object.values(
      rows.reduce((acc, r) => {
        if (!acc[r.sender]) acc[r.sender] = { Sender: r.sender, Messages: 0, Reactions: 0, 'Files shared': 0, Replies: 0 };
        acc[r.sender].Messages++;
        acc[r.sender].Reactions += r.reactions;
        acc[r.sender]['Files shared'] += r.files;
        acc[r.sender].Replies += r.replies;
        return acc;
      }, {})
    );

    return {
      ok: true,
      data: {
        channelName,
        rowsCount: rows.length,
        weekTable,
        senderTable,
        weeksCSV: toCSV(weekTable),
        sendersCSV: toCSV(senderTable)
      }
    };
  }

  // Message handler for the popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'SLACK_ENGAGEMENT_ANALYSE') {
      try {
        const result = analyse(Array.isArray(msg.keywords) ? msg.keywords : []);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
      return true;
    }
    return false;
  });
})();
