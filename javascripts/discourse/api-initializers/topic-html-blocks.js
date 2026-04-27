import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.8.41", (api) => {
  let blocksRaw = [];
  try {
    blocksRaw = JSON.parse(JSON.stringify(settings.blocks || []));
  } catch (e) {
    blocksRaw = [];
  }

  const topicMap = new Map();
  for (const b of blocksRaw) {
    if (!b || !b.topic_ids || !b.html) continue;
    const ids = String(b.topic_ids)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    for (const id of ids) {
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

  window.__topicHtmlBlocksDebug = {
    raw: blocksRaw,
    topicIds: Array.from(topicMap.keys()),
    locale: getCurrentLocale(),
  };

  if (topicMap.size === 0) return;

  api.decorateCookedElement(
    (cooked, helper) => {
      if (!helper) return;
      const post = helper.getModel && helper.getModel();
      if (!post || post.post_number !== 1) return;

      const block = topicMap.get(post.topic_id);
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
