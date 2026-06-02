import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.8.41", (api) => {
  let blocksRaw = [];
  try {
    blocksRaw = JSON.parse(JSON.stringify(settings.blocks || []));
  } catch (e) {
    blocksRaw = [];
  }

  function parseIds(val) {
    // Accepts a native categories array ([4, 8]) or a comma string ("4,8").
    const arr = Array.isArray(val) ? val : String(val || "").split(",");
    return arr.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  }

  // Specific topic_id -> block (always wins over a forum-wide block).
  const topicMap = new Map();
  // Blocks with all_topics: true, rendered on every first post (optionally
  // narrowed by category_ids, and minus any exclude_topic_ids).
  const globalBlocks = [];

  for (const b of blocksRaw) {
    if (!b || !b.html) continue;

    const isGlobal = b.all_topics === true || String(b.all_topics) === "true";
    if (isGlobal) {
      b._cats = new Set(parseIds(b.category_ids));
      b._exclude = new Set(parseIds(b.exclude_topic_ids));
      globalBlocks.push(b);
    }

    for (const id of parseIds(b.topic_ids)) {
      topicMap.set(id, b);
    }
  }

  function getCurrentLocale() {
    try {
      const docLang = document.documentElement && document.documentElement.lang;
      if (docLang) return String(docLang).toLowerCase();
    } catch (e) {}
    try {
      const I18n = window.I18n;
      if (I18n && typeof I18n.currentLocale === "function") {
        return String(I18n.currentLocale()).toLowerCase();
      }
      if (I18n && I18n.locale) return String(I18n.locale).toLowerCase();
    } catch (e) {}
    return "";
  }

  function pickHtml(block) {
    const overrides = Array.isArray(block.locale_overrides)
      ? block.locale_overrides
      : [];
    if (overrides.length === 0) return block.html;

    const locale = getCurrentLocale();
    if (!locale) return block.html;

    for (const o of overrides) {
      if (!o || !o.locale || !o.html) continue;
      if (String(o.locale).toLowerCase() === locale) return o.html;
    }
    const baseLang = locale.split(/[-_]/)[0];
    if (baseLang && baseLang !== locale) {
      for (const o of overrides) {
        if (!o || !o.locale || !o.html) continue;
        if (String(o.locale).toLowerCase() === baseLang) return o.html;
      }
    }
    return block.html;
  }

  function getCategoryId(post) {
    if (post && post.category_id != null) return post.category_id;
    try {
      const t = post && post.topic;
      if (t && t.category_id != null) return t.category_id;
    } catch (e) {}
    try {
      const model = api.container.lookup("controller:topic")?.model;
      if (model && model.id === post.topic_id) return model.category_id;
    } catch (e) {}
    return null;
  }

  function pickGlobalBlock(post) {
    if (globalBlocks.length === 0) return null;
    const catId = getCategoryId(post);
    for (const g of globalBlocks) {
      if (g._exclude.has(post.topic_id)) continue;
      if (g._cats.size > 0 && (catId == null || !g._cats.has(catId))) continue;
      return g;
    }
    return null;
  }

  window.__topicHtmlBlocksDebug = {
    raw: blocksRaw,
    topicIds: Array.from(topicMap.keys()),
    globalBlocks: globalBlocks.map((g) => g.name || ""),
    locale: getCurrentLocale(),
  };

  if (topicMap.size === 0 && globalBlocks.length === 0) return;

  api.decorateCookedElement(
    (cooked, helper) => {
      if (!helper) return;
      const post = helper.getModel && helper.getModel();
      if (!post || post.post_number !== 1) return;

      const block = topicMap.get(post.topic_id) || pickGlobalBlock(post);
      if (!block) return;

      const html = pickHtml(block);
      if (!html) return;

      if (cooked.querySelector(":scope > .topic-html-block")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "topic-html-block";
      wrapper.dataset.blockName = block.name || "";
      wrapper.innerHTML = html;
      cooked.appendChild(wrapper);
    },
    { id: "topic-html-blocks" }
  );
});
