# Dynamic blocks from papers.eliteskillset.com

These blocks pull their content live from the CMS at
`papers.eliteskillset.com/admin/blocks`. Each block's `html` is a thin **marker**
(`<div data-papers-src="…">`). On every page load the component fetches the URL
and fills the element; the marker's inner HTML is the **offline fallback** shown
if the fetch fails. Edit the text/links in the dashboard — changes appear on the
next forum page load, no theme rebuild.

Requires the theme setting **`enable_remote`** = on (default).

---

## The three language snippets — community card (`community-promo`)

Paste each as the `html` of its own block, and target it at the topics/categories
in that language (via `topic_ids` / `category_ids`). Language is chosen by *which
snippet you put where* — not by the viewer's UI locale.

**RU**
```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/community-promo?lang=ru">Сообщество в Telegram — https://t.me/talentvisahelp</div>
```

**EN**
```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/community-promo?lang=en">Community on Telegram — https://t.me/talentvisahelp</div>
```

**IT**
```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/community-promo?lang=it">Community su Telegram — https://t.me/talentvisahelp</div>
```

The text inside each `<div>` is a minimal fallback link; replace it with a full
static card if you want a richer offline fallback.

---

## Top strip — verified PR manager (`pr-manager-strip`)

A short one-line strip rendered **above** the article body. Set the block's
**`position` = top**.

**RU** (use `?lang=en` / `?lang=it` for the other languages)
```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/pr-manager-strip?lang=ru">Проверенный PR-менеджер — https://papers.eliteskillset.com/</div>
```

---

## Optional embedded form (`lead-form`)

Shows the lead form in an iframe, but only while the block is **enabled** in the
dashboard (master toggle). Auto-resizes via postMessage.

```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/lead-form?lang=ru" data-papers-embed-src="https://papers.eliteskillset.com/embed/lead-form?lang=ru"></div>
```

---

## Sample `blocks` setting (paste into the theme component settings)

```json
[
  {
    "name": "community-ru",
    "topic_ids": "",
    "all_topics": true,
    "category_ids": [],
    "position": "bottom",
    "html": "<div data-papers-src=\"https://papers.eliteskillset.com/api/forum-blocks/community-promo?lang=ru\">Сообщество в Telegram — https://t.me/talentvisahelp</div>"
  },
  {
    "name": "pr-strip-ru",
    "all_topics": true,
    "position": "top",
    "html": "<div data-papers-src=\"https://papers.eliteskillset.com/api/forum-blocks/pr-manager-strip?lang=ru\">Проверенный PR-менеджер — https://papers.eliteskillset.com/</div>"
  },
  {
    "name": "lead-form-ru",
    "topic_ids": "123,456",
    "position": "bottom",
    "html": "<div data-papers-src=\"https://papers.eliteskillset.com/api/forum-blocks/lead-form?lang=ru\" data-papers-embed-src=\"https://papers.eliteskillset.com/embed/lead-form?lang=ru\"></div>"
  }
]
```

Notes:
- Two `all_topics` blocks at **different** positions (top strip + bottom card)
  coexist on every topic. To run several languages, give each language block its
  own `topic_ids`/`category_ids` (don't make all three `all_topics` bottom — they
  would stack).
- A topic-specific block overrides an `all_topics` block **at the same position**.
- Set `enable_remote` off to fall back to the static `html` (the fallback inside
  each marker) everywhere — useful as a kill-switch.
```
