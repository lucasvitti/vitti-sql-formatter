# Publishing "Vitti SQL Formatter" to Chrome + Edge

Everything you need to submit. The extension formats **100% locally** (no network calls,
no data collected) — that keeps review simple. Re-sync the engine before packaging:
`..\sync-engine.cmd`, then `package.cmd` → produces `vitti-sql-formatter-v1.0.0.zip`.

> **Before submitting:** load it unpacked and try it once (`chrome://extensions` →
> Developer mode → Load unpacked → this folder). Confirm the popup formats and the
> Databricks ⚡/`Ctrl+Shift+L` flow works. Don't ship untested.

---

## A. Accounts (one-time, you do this)
- **Chrome Web Store:** https://chrome.google.com/webstore/devconsole — register with your
  Google account, pay the **one-time US$5** fee.
- **Microsoft Edge Add-ons:** https://partner.microsoft.com/dashboard/microsoftedge —
  register (free). Same `.zip` works for both.

---

## B. Store listing copy (paste-ready)

**Name:** `Vitti SQL Formatter`

**Short description (≤132, matches manifest):**
`Format SQL in one click — river layout, leading commas, where 1=1, aligned aliases. Works on Databricks and any web editor.`

**Category:** Developer Tools  **Language:** English

**Detailed description:**
```
Vitti SQL Formatter reformats messy SQL into a clean, scannable "river" layout — the
moment you paste it.

It's opinionated where it counts:
• lowercase keywords, original-case identifiers
• a vertical "river": clause keywords left, operands aligned to a fixed column
• leading commas, aligned column aliases
• every WHERE opens with 1=1, one predicate per line
• multiline CASE, window functions (OVER), and CTEs
• tabs or spaces, configurable width and keyword case

Two ways to use it:
• In a SQL editor — select your SQL and press the shortcut (Ctrl+Shift+Y) or use the
  right-click menu to replace it in place. On Databricks, copy first, then trigger.
• Popup — click the toolbar icon, paste SQL, format it, copy it back. Its Config tab
  sets your column spacing (fields / labels / joins / filter) and other preferences.

Everything runs locally in your browser. No account, no servers, no tracking — your SQL
never leaves your device.

There's also a free web version with draggable alignment rulers at
https://identar.lucas.mat.br
```

**Privacy policy URL:** `https://identar.lucas.mat.br/extension-privacy.html`
(deploy `web/extension-privacy.html` first — see section E)

**Homepage:** `https://identar.lucas.mat.br`

---

## C. Permission justifications (Chrome asks for these)
| Permission | Justification to paste |
|---|---|
| `activeTab` + `scripting` | Injects the formatter into the **current** tab only when the user invokes it (keyboard shortcut or right-click item). No automatic injection and **no host permissions** — the extension never runs on a site on its own. |
| `clipboardRead` | Reads SQL the user copied so the popup can auto-fill it and the shortcut can format the current selection. Read only on user action; never stored or transmitted. |
| `clipboardWrite` | Writes the formatted SQL back to the clipboard so the user can paste it. |
| `storage` | Stores formatting preferences (incl. column spacing) locally on the device. |
| `contextMenus` | Adds the "Format SQL → Vitti style" right-click item. |
| Remote code | **None.** All logic is bundled (`sqlfmt.js`); no remote code is loaded. |
| Data usage | "Does NOT collect or use" for every category. Single purpose: format SQL locally. |

> Note: the extension requests **no host permissions** and registers **no content scripts** — it works
> purely via `activeTab` on your action, which keeps store review minimal.

---

## D. Screenshots (1–5 required; 1280×800 or 640×400 PNG)
Show: (1) the popup **Format** tab formatting a query, (2) the popup **Config** tab (column
spacing), (3) a before/after on the live page, (4) the live page's draggable rulers. Easiest
source is the live page + popup. A 440×280 small promo tile is optional but helps.

---

## E. Deploy the privacy page (needed for the listing URL)
```
tar -C web -czf - extension-privacy.html | ssh vps "tar xzf - -C /var/www/identar.lucas.mat.br && chown www-data:www-data /var/www/identar.lucas.mat.br/extension-privacy.html"
# verify: https://identar.lucas.mat.br/extension-privacy.html
```

---

## F. Submit
**Chrome:** Dev Console → **+ New item** → upload the `.zip` → fill name/description/category
→ add screenshots + 128px icon → **Privacy practices** (single purpose + the table above +
privacy URL) → **Submit for review**. Review is usually hours–days.

**Edge:** Partner Center → **+ New extension** → upload the same `.zip` → fill listing →
**Publish**. Edge review can take a few days.

---

## G. After approval (market exposure)
- Add an **"Add to Chrome" / "Add to Edge"** button to `identar.lucas.mat.br` (drop in the
  real store URLs once issued).
- Post in r/SQL, r/dataengineering, and Product Hunt — lead with the two differentiators:
  the **draggable alignment rulers** (web) and the **river / leading-comma / where 1=1** style.
- Bump `version` in `manifest.json` for every update, re-run `package.cmd`, re-upload.
