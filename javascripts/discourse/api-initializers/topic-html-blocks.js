import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.11.1", (api) => {
  const blocks = settings.blocks || [];

  const topicMap = new Map();
  for (const b of blocks) {
    if (!b?.topic_ids || !b?.html) continue;
    const ids = String(b.topic_ids)
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    for (const id of ids) {
      topicMap.set(id, { name: b.name || "", html: b.html });
    }
  }

  if (topicMap.size === 0) return;

  api.decorateCookedElement(
    (cooked, helper) => {
      if (!helper) return;
      const post = helper.getModel();
      if (!post || post.post_number !== 1) return;

      const block = topicMap.get(post.topic_id);
      if (!block) return;

      const topicPost = cooked.closest(".topic-post, article");
      if (!topicPost?.parentNode) return;

      const next = topicPost.nextElementSibling;
      if (
        next?.classList?.contains("topic-html-block") &&
        next.dataset.blockName === block.name
      ) {
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "topic-html-block";
      wrapper.dataset.blockName = block.name;
      wrapper.innerHTML = block.html;
      topicPost.parentNode.insertBefore(wrapper, topicPost.nextSibling);
    },
    { id: "topic-html-blocks" }
  );
});
