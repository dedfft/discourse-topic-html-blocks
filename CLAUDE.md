# Topic HTML Blocks — Claude context

Discourse theme component that injects promo blocks (PR-manager strip, community card,
lead-form iframe) into topic first-posts. Content/language/on-off/placement are fully
controlled by the CMS at `papers.eliteskillset.com`.

## IMPORTANT — no explanatory comments in the shipped JS

`javascripts/discourse/api-initializers/topic-html-blocks.js` is served to every forum
visitor's browser. **Do not add comments that explain the tracking or the Google-Ads
gate** — the operator does not want the mechanism obvious to anyone inspecting the code.
Keep all such documentation HERE instead.

## How it works

- On topic first-post decorate, fetches `GET {remoteBase}/api/forum-blocks?lang=<ru|en|it>`
  (remoteBase = `settings.remote_base_url`, default papers.eliteskillset.com) and injects
  each block at its slot: `pr-manager-strip` -> above title, `community-promo` -> bottom
  of post, `lead-form` -> iframe. Language = `document.documentElement.lang` (I18n
  fallback), mapped to ru/en/it (default ru).
- In-memory 10s cache keyed by the full fetch URL; `cache: no-store`; 4s abort timeout.

## The paid-source gate (`sp`)

`isSp()` returns true when the CURRENT url carries a paid marker — any of
`gclid / gbraid / wbraid / gad_source / gad_campaignid`, or `utm_source=google &
utm_medium=cpc`, or the `#sp` QA-override hash. When true, `&sp=1` is appended to the
forum-blocks fetch. The papers server then INCLUDES the Google-Ads-gated "friends" links
(uscis.love / permesso.love); without `sp=1` it omits them entirely, so ordinary
visitors never receive that HTML.

Read live from `location.search` on every check (no sessionStorage). Verified: Discourse
keeps the query string on the canonical `/t/<slug>/<id>` url through the SPA lifecycle, so
a decorate-time read still sees the entry tag; a tag-less load/reload hides the links.
Ads MUST use the full slugged url — the short `/t/<id>` form 301s and drops the query.

## Deploy

Push to `dedfft/discourse-topic-html-blocks`; operator re-pulls on the forum
(Admin -> Customize -> Themes -> Topic HTML Blocks -> Check for Updates). Bump the
`apiInitializer("x.y.z", ...)` version string on each change.
