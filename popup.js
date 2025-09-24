// popup.js
let dataCache = {
  channelName: 'slack',
  weekTable: [],
  senderTable: []
};

async function getActiveSlackTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:\/\/.*\.slack\.com\//.test(tab.url || '')) return null;
  return tab;
}

function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h] ?? '')).join(','))].join('\n');
}

function toTSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  return [headers.join('\t'), ...rows.map(r => headers.map(h => esc(r[h] ?? '')).join('\t'))].join('\n');
}

function toHTMLTable(rows) {
  if (!rows || !rows.length) return '<table></table>';
  const headers = Object.keys(rows[0]);
  const esc = v => String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  const thead = `<thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${esc(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function sanitiseFilename(name) {
  // Keep spaces, underscores, dashes, dots. Replace the rest.
  return String(name).trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 80);
}

async function copyTableToClipboard(rows) {
  const tsv = toTSV(rows);
  const html = toHTMLTable(rows);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([tsv], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
      setStatus('Copied to clipboard');
      return true;
    }
  } catch (e) {
    console.debug('clipboard.write failed:', e);
  }

  try {
    await navigator.clipboard.writeText(tsv);
    setStatus('Copied to clipboard');
    return true;
  } catch (e) {
    console.debug('clipboard.writeText failed:', e);
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) {
      setStatus('Copied to clipboard');
      return true;
    }
  } catch (e) {
    console.debug('execCommand copy failed:', e);
  }

  setStatus('Copy failed. You can still use Download CSV.');
  return false;
}

// Small sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Send a message to the tab, return response or null on error
async function sendTabMessage(tabId, msg, timeoutMs = 1500) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, msg, resp => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      if (chrome.runtime.lastError) {
        console.debug('sendMessage error:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(resp || null);
      }
    });
  });
}

// Ensure content.js is present and responsive
async function ensureContentInjected(tabId) {
  let ping = await sendTabMessage(tabId, { type: 'SLACK_ENGAGEMENT_PING' });
  if (ping && ping.ok) return true;

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js']
    });
  } catch (e) {
    console.debug('executeScript failed:', e?.message || e);
    return false;
  }

  await sleep(150);

  ping = await sendTabMessage(tabId, { type: 'SLACK_ENGAGEMENT_PING' });
  if (ping && ping.ok) return true;

  await sleep(200);
  ping = await sendTabMessage(tabId, { type: 'SLACK_ENGAGEMENT_PING' });
  return !!(ping && ping.ok);
}

function renderTable(elTable, rows) {
  if (!rows || rows.length === 0) {
    elTable.innerHTML = '<thead><tr><th>No data</th></tr></thead><tbody></tbody>';
    return;
  }
  const headers = Object.keys(rows[0]);
  const thead = `<thead><tr>${headers.map(h => `<th data-key="${h}">${h}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  elTable.innerHTML = thead + tbody;

  // Click header to sort
  elTable.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      const sorted = [...rows].sort((a, b) => {
        const av = a[key], bv = b[key];
        const an = typeof av === 'number' ? av : Number(av);
        const bn = typeof bv === 'number' ? bv : Number(bv);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
        return String(av).localeCompare(String(bv), undefined, { numeric: true });
      });
      renderTable(elTable, sorted);
    });
  });
}

function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseKeywords(text) {
  if (!text) return [];
  return text.split(/[;,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function applyFilter(fullRows, query) {
  if (!query) return fullRows;
  const q = query.toLowerCase();
  return fullRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
}

function getActiveTabAndRows() {
  const weeksActive = document.getElementById('tabWeeks').classList.contains('active');
  if (weeksActive) {
    return { which: 'weeks', rows: dataCache.weekTable };
  } else {
    return { which: 'senders', rows: dataCache.senderTable };
  }
}

function switchTab(which) {
  const tabWeeks = document.getElementById('tabWeeks');
  const tabSenders = document.getElementById('tabSenders');
  const panelWeeks = document.getElementById('panelWeeks');
  const panelSenders = document.getElementById('panelSenders');
  if (which === 'weeks') {
    tabWeeks.classList.add('active'); tabSenders.classList.remove('active');
    panelWeeks.style.display = ''; panelSenders.style.display = 'none';
  } else {
    tabSenders.classList.add('active'); tabWeeks.classList.remove('active');
    panelSenders.style.display = ''; panelWeeks.style.display = 'none';
  }
}

async function runAnalyse(keywordsOverride) {
  const statusEl = document.getElementById('status');
  const countsEl = document.getElementById('counts');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const tableWeeks = document.getElementById('tableWeeks');
  const tableSenders = document.getElementById('tableSenders');

  statusEl.textContent = 'Preparing...';
  countsEl.textContent = '';
  copyBtn.disabled = true;
  downloadBtn.disabled = true;

  const tab = await getActiveSlackTab();
  if (!tab) {
    statusEl.textContent = 'Open a Slack web tab (https://*.slack.com) first.';
    return;
  }

  if (tab.status !== 'complete') {
    await sleep(300);
  }

  const ready = await ensureContentInjected(tab.id);
  if (!ready) {
    statusEl.textContent = 'Could not reach the page. Reload the Slack tab and try again.';
    return;
  }

  const kwTextEl = document.getElementById('keywordsFilter');
  const kwText = kwTextEl?.value || '';
  const keywords = Array.isArray(keywordsOverride) ? keywordsOverride : parseKeywords(kwText);
  const resp = await sendTabMessage(tab.id, { type: 'SLACK_ENGAGEMENT_ANALYSE', keywords });
  if (!resp || !resp.ok) {
    statusEl.textContent = resp && resp.error ? resp.error : 'No data found. Scroll the channel and try again.';
    return;
  }

  const { channelName, rowsCount, weekTable, senderTable } = resp.data;
  dataCache = { channelName: channelName || 'slack', weekTable, senderTable };

  countsEl.textContent = `Messages analysed: ${rowsCount}. Weeks: ${weekTable.length}. Senders: ${senderTable.length}.`;
  statusEl.textContent = `Done. Channel: ${dataCache.channelName}. Use Copy or Download CSV for the selected tab.`;

  renderTable(tableWeeks, weekTable);
  renderTable(tableSenders, senderTable);

  copyBtn.disabled = false;
  downloadBtn.disabled = false;

  copyBtn.onclick = async () => {
    const { rows } = getActiveTabAndRows();
    if (!rows.length) return setStatus('Nothing to copy');
    await copyTableToClipboard(rows);
  };

  downloadBtn.onclick = () => {
    const { which, rows } = getActiveTabAndRows();
    if (!rows.length) return setStatus('Nothing to download');
    const base = sanitiseFilename(dataCache.channelName);
    const filename = which === 'weeks' ? `${base}_weeks.csv` : `${base}_senders.csv`;
    downloadCSV(filename, toCSV(rows));
  };
}

document.getElementById('analyseBtn').addEventListener('click', runAnalyse);
document.getElementById('tabWeeks').addEventListener('click', () => switchTab('weeks'));
document.getElementById('tabSenders').addEventListener('click', () => switchTab('senders'));

document.getElementById('filterWeeks').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const kwText = e.target.value || '';
    const keywords = parseKeywords(kwText);
    const kwInput = document.getElementById('keywordsFilter');
    if (kwInput) kwInput.value = kwText;
    runAnalyse(keywords);
  }
});
document.getElementById('filterSenders').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const kwText = e.target.value || '';
    const keywords = parseKeywords(kwText);
    const kwInput = document.getElementById('keywordsFilter');
    if (kwInput) kwInput.value = kwText;
    runAnalyse(keywords);
  }
});

document.getElementById('keywordsFilter')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    runAnalyse();
  }
});

// Optional, auto-run if Slack tab is active
(async () => {
  const tab = await getActiveSlackTab();
  if (tab) runAnalyse();
})();
