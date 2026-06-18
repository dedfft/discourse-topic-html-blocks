# Zero-config dynamic blocks

There is nothing to paste. Set **`remote_base_url`** (default
`https://papers.eliteskillset.com`) and the component does the rest: on every
topic's first post it fetches `{base}/api/forum-blocks?lang=<locale>` and renders
each block at the slot the CMS reports:

- `pr-manager-strip` → a strip **above** the article
- `community-promo` → the community card **below** the first post
- `lead-form` → an embedded form (iframe), only when enabled in the CMS

Everything — content, languages (RU/EN/IT), on/off, and placement — is controlled
in the CMS at **papers.eliteskillset.com/admin/blocks**. Edit there and it shows on
the next forum page load; no theme change, no rebuild.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `enable_remote` | on | Master on/off for the whole component. |
| `remote_base_url` | `https://papers.eliteskillset.com` | The CMS to fetch from. Usually the only thing you set. |
| `compact_max_chars` | `600` | On a first post shorter than this, the card hides the sections marked "hide on short posts" in the builder (default: profession chats + support). `0` disables compact mode. |

## How it works

- One cached request per page (`/api/forum-blocks?lang=<locale>`); each block is
  injected once and is safe across SPA navigation.
- A block disabled (or its language disabled) in the CMS simply isn't rendered.
- The CMS response includes a `slot` per block, so new blocks added in the CMS
  render in the right place without any theme update.
- Locale is auto-detected from the viewer (`<html lang>` / Discourse locale),
  falling back to `ru`.
