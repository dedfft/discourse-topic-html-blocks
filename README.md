# Discourse Topic HTML Blocks

A Discourse **theme component** that renders arbitrary HTML (typically an iframe) immediately below the first post on a configurable set of topics.

You define **named blocks** (e.g. `Italy`, `Career Coaching`) in the theme settings. Each block has:

- a `name` — your label
- `topic_ids` — comma-separated topic IDs to apply this HTML to
- `html` — the markup to inject after post #1

Multiple topic IDs can share the same block. Different blocks can target different topics with different HTML. Order doesn't matter; the first matching block per topic wins.

---

## Install

1. Admin → **Customize** → **Themes** → **Components** → **Install** → **From a git repository**
2. URL: `https://github.com/dedfft/discourse-topic-html-blocks`
3. Add the component to whichever theme(s) you want it active in.

## Configure

In the component's settings, edit the `blocks` setting. Example:

```json
[
  {
    "name": "Italy",
    "topic_ids": "123, 456, 789",
    "html": "<iframe src=\"https://example.com/italy-form\" width=\"100%\" height=\"600\"></iframe>"
  },
  {
    "name": "Career Coaching",
    "topic_ids": "201, 202",
    "html": "<iframe src=\"https://example.com/career-form\" width=\"100%\" height=\"600\"></iframe>"
  }
]
```

The HTML is injected as-is via `innerHTML` (it bypasses Discourse's post sanitizer). Only admins can edit theme settings, so this is intentional — but it does mean you can include scripts, styles, and iframes from any origin without onebox/CSP gymnastics.

## How it works

A small JS initializer hooks into `decorateCookedElement`, checks `post.post_number === 1`, looks up the topic ID in the configured map, and inserts a `<div class="topic-html-block">` after the topic's first post container. Re-renders are idempotent.

## License

MIT
