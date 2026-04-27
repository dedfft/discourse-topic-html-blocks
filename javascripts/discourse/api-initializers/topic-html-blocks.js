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
      topicMap.set(id, { name: b.name || "", html: b.html });
    }
  }

  window.__topicHtmlBlocksDebug = {
    raw: blocksRaw,
    topicIds: Array.from(topicMap.keys()),
  };

  if (topicMap.size === 0) return;

  api.decorateCookedElement(
    (cooked, helper) => {
      if (!helper) return;
      const post = helper.getModel && helper.getModel();
      if (!post || post.post_number !== 1) return;

      const block = topicMap.get(post.topic_id);
      if (!block) return;

      if (cooked.querySelector(":scope > .topic-html-block")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "topic-html-block";
      wrapper.dataset.blockName = block.name;
      wrapper.innerHTML = block.html;
      cooked.appendChild(wrapper);
    },
    { id: "topic-html-blocks" }
  );
});
