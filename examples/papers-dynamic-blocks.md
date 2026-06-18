# Dynamic blocks from papers.eliteskillset.com

Content is edited in the visual builder at `papers.eliteskillset.com/admin/blocks`
and served as rendered HTML. Each block's `html` is a thin **marker**
(`<div data-papers-src="…">`); on every page load the component fetches the URL
and fills the element. The marker's inner HTML is the **offline fallback** shown
if the fetch fails. Editing in the dashboard reflects on the next forum refresh —
no theme rebuild.

Two theme settings decide placement (placement is NOT set in papers):
- **`blocks`** → rendered at the **bottom** of the first post (the community card).
- **`top_blocks`** → rendered as a **strip at the top** of the article (the PR strip).

Requires `enable_remote` = on (default).

---

## Community card → `blocks` (bottom)

Per-language (paste each into its own block, targeted by topic/category):
```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/community-promo?lang=ru">Сообщество в Telegram — https://t.me/talentvisahelp</div>
```
…and `?lang=en`, `?lang=it`.

Or one unified marker that auto-appends the viewer's language:
```html
<div data-papers-src-base="https://papers.eliteskillset.com/api/forum-blocks/community-promo">Сообщество — https://t.me/talentvisahelp</div>
```

Friendly alias also works: `https://papers.eliteskillset.com/api/form/card-ru`.

---

## PR-manager strip → `top_blocks` (top)

```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/pr-manager-strip?lang=ru">Проверенный PR-менеджер — https://papers.eliteskillset.com/</div>
```
Alias: `https://papers.eliteskillset.com/api/form/strip-ru`.

---

## Optional embedded form → `blocks`

```html
<div data-papers-src="https://papers.eliteskillset.com/api/forum-blocks/lead-form?lang=ru" data-papers-embed-src="https://papers.eliteskillset.com/embed/lead-form?lang=ru"></div>
```

---

## Sample settings

`blocks` (bottom):
```json
[
  {
    "name": "community-ru",
    "all_topics": true,
    "html": "<div data-papers-src-base=\"https://papers.eliteskillset.com/api/forum-blocks/community-promo\">Сообщество — https://t.me/talentvisahelp</div>"
  }
]
```

`top_blocks` (top):
```json
[
  {
    "name": "pr-strip-ru",
    "all_topics": true,
    "html": "<div data-papers-src-base=\"https://papers.eliteskillset.com/api/forum-blocks/pr-manager-strip\">Проверенный PR-менеджер — https://papers.eliteskillset.com/</div>"
  }
]
```

Notes:
- **Compact on short posts:** when the first post's text is under `compact_max_chars`
  (default 600), the card hides the sections you toggled "hide on short posts" in
  the builder (by default: profession chats + support). Long posts show everything.
- A topic-specific block (with `topic_ids`) overrides an `all_topics` block **in the
  same slot** (top or bottom).
- `enable_remote: off` → every block renders the static fallback inside its marker.
