/* Vitti SQL Formatter — content script (injected on demand when you trigger it).
 *
 * Select SQL → Ctrl+Shift+L (or right-click "Format SQL → Vitti style") → the
 * selection is replaced in place.
 *   - Plain <textarea>/<input>/contenteditable: the selection is replaced directly.
 *   - Databricks' Monaco editor exposes no API here, so the selection is read via a
 *     synthetic copy and written back with execCommand('insertText'). If the copy
 *     can't capture it, press Ctrl+C first; if the write-back can't apply, it leaves
 *     the formatted SQL on your clipboard to paste with Ctrl+V.
 *
 * Uses the options saved by the popup's Config tab (column spacing etc.).
 */
(function () {
  if (window.__vittiSqlLoaded) return;            // re-injected — listener already set
  window.__vittiSqlLoaded = true;

  var DEFAULT_OPT = {
    keywordCase: 'lower', functionCase: 'lower', useTabs: true, tabWidth: 4,
    riverWidth: 12, aliasColumn: 0, joinColumn: 0, filterColumn: 0,
    where11: true, bannerComments: true, alignAliases: true, blankBetweenClauses: true
  };
  var OPT = Object.assign({}, DEFAULT_OPT);
  try {
    chrome.storage && chrome.storage.sync.get('vittiOpt', function (r) { if (r && r.vittiOpt) OPT = Object.assign({}, DEFAULT_OPT, r.vittiOpt); });
    chrome.storage && chrome.storage.onChanged.addListener(function (c) { if (c.vittiOpt) OPT = Object.assign({}, DEFAULT_OPT, c.vittiOpt.newValue); });
  } catch (e) { }

  function fmt(sql) { return window.SQLFmt.format(sql, OPT); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;z-index:2147483647;bottom:24px;right:18px;max-width:340px;' +
      'background:' + (kind === 'err' ? '#e3593b' : '#1a9e76') + ';color:#fff;padding:9px 13px;border-radius:9px;' +
      'font:600 13px system-ui,Segoe UI,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transition:opacity .15s';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 250); }, 2000);
  }

  function isMonaco(el) { return !!(el && ((el.classList && el.classList.contains('inputarea')) || (el.closest && el.closest('.monaco-editor')))); }
  function isPlainEditable(el) {
    if (!el || isMonaco(el)) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT' && /^(text|search|url|email|)$/i.test(el.type || '')) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  async function formatHere() {
    var ae = document.activeElement;

    // (a) plain editable — replace the selection directly, no clipboard needed
    if (isPlainEditable(ae)) {
      try {
        if (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') {
          var s = ae.selectionStart, e = ae.selectionEnd;
          if (e > s) ae.setRangeText(fmt(ae.value.slice(s, e)), s, e, 'end');
          else if (ae.value.trim()) ae.value = fmt(ae.value);
          else { toast('Select some SQL first', 'err'); return; }
          ae.dispatchEvent(new Event('input', { bubbles: true }));
          toast('Replaced in place'); return;
        }
        if (ae.isContentEditable) {
          var sel = window.getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) {
            var range = sel.getRangeAt(0);
            range.deleteContents(); range.insertNode(document.createTextNode(fmt(sel.toString()))); sel.collapseToEnd();
          } else if (ae.textContent.trim()) { ae.textContent = fmt(ae.textContent); }
          else { toast('Select some SQL first', 'err'); return; }
          ae.dispatchEvent(new Event('input', { bubbles: true }));
          toast('Replaced in place'); return;
        }
      } catch (err) { /* fall through to the clipboard/Monaco path */ }
    }

    // (b) Monaco / Databricks (or any unknown editor): read selection via clipboard, write back via insertText
    try {
      var before = ''; try { before = await navigator.clipboard.readText(); } catch (e) { }
      try { document.execCommand('copy'); } catch (e) { }      // ask the editor to copy the current selection
      await sleep(40);
      var after = ''; try { after = await navigator.clipboard.readText(); } catch (e) { }
      var txt = (after && after.trim()) ? after : before;      // prefer the fresh copy; fall back to existing clipboard
      if (!txt || !txt.trim()) { toast('Select SQL (Ctrl+C if needed), then trigger again', 'err'); return; }

      var out = fmt(txt);
      var replaced = false;
      try { replaced = document.execCommand('insertText', false, out); } catch (e) { }   // replace selection in place
      if (replaced) { toast('Replaced in place'); }
      else { await navigator.clipboard.writeText(out); toast('Formatted — press Ctrl+V to paste it back'); }
    } catch (err) {
      toast('Couldn’t access the clipboard — use the toolbar popup', 'err');
    }
  }

  chrome.runtime.onMessage.addListener(function (msg) { if (msg && msg.type === 'vitti-format') formatHere(); });
})();
