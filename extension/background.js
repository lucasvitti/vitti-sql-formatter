/* Vitti SQL Formatter — service worker: context menu + keyboard command. */
const MENU_ID = 'vitti-format-sql';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Format SQL → Vitti style',
    contexts: ['editable', 'selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) trigger(tab);
});

chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'format-sql') trigger(tab);
});

async function trigger(tab) {
  if (!tab || !tab.id) return;
  // 1) try an already-present content script (Databricks pages)
  try { await chrome.tabs.sendMessage(tab.id, { type: 'vitti-format' }); return; } catch (e) { /* not loaded */ }
  // 2) inject on demand (activeTab grants temporary access on user action) and retry
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sqlfmt.js', 'content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'vitti-format' });
  } catch (e) { /* page disallows injection (e.g. chrome:// or store) */ }
}
