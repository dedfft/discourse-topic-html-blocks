import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.8.43", (api) => {
  let bottomRaw = [];
  let topRaw = [];
  try {
    bottomRaw = JSON.parse(JSON.stringify(settings.blocks || []));
  } catch (e) {
    bottomRaw = [];
  }
  try {
    topRaw = JSON.parse(JSON.stringify(settings.top_blocks || []));
  } catch (e) {
    topRaw = [];
  }

  const enableRemote = settings.enable_remote !== false;
  const remoteBase = String(
    settings.remote_base_url || "https://papers.eliteskillset.com"
  ).replace(/\/+$/, "");
  const compactMaxRaw = parseInt(settings.compact_max_chars, 10);
  const compactMax = isNaN(compactMaxRaw) ? 600 : compactMaxRaw;

  function parseIds(val) {
    // Accepts a native categories array ([4, 8]) or a comma string ("4,8").
    const arr = Array.isArray(val) ? val : String(val || "").split(",");
    return arr.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  }

  // topic_id -> [blocks]; blocks with all_topics render on every first post.
  // Each block is tagged with _slot ('top' | 'bottom') by which list it's in.
  const topicMap = new Map();
  const globalBlocks = [];
  let uidCounter = 0;

  function ingest(list, slot) {
    list.forEach((b) => {
      if (!b || !b.html) return;
      b._uid = "b" + uidCounter++;
      b._slot = slot;

      const isGlobal = b.all_topics === true || String(b.all_topics) === "true";
      if (isGlobal) {
        b._cats = new Set(parseIds(b.category_ids));
        b._exclude = new Set(parseIds(b.exclude_topic_ids));
        globalBlocks.push(b);
      }
      for (const id of parseIds(b.topic_ids)) {
        if (!topicMap.has(id)) topicMap.set(id, []);
        topicMap.get(id).push(b);
      }
    });
  }
  ingest(topRaw, "top");
  ingest(bottomRaw, "bottom");

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

  // ru/en/it base of the current locale (default ru) — for data-papers-src-base.
  function baseLang() {
    const loc = getCurrentLocale().split(/[-_]/)[0];
    return loc === "ru" || loc === "en" || loc === "it" ? loc : "ru";
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
    const base = locale.split(/[-_]/)[0];
    if (base && base !== locale) {
      for (const o of overrides) {
        if (!o || !o.locale || !o.html) continue;
        if (String(o.locale).toLowerCase() === base) return o.html;
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

  function pickGlobalBlocks(post) {
    if (globalBlocks.length === 0) return [];
    const catId = getCategoryId(post);
    const out = [];
    for (const g of globalBlocks) {
      if (g._exclude.has(post.topic_id)) continue;
      if (g._cats.size > 0 && (catId == null || !g._cats.has(catId))) continue;
      out.push(g);
    }
    return out;
  }

  function cssEscape(s) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
    return String(s).replace(/["\\\]]/g, "\\$&");
  }

  // --- Remote content (dynamic blocks fetched from the CMS) -----------------

  const inflight = new Map();

  function cacheGet(url) {
    try {
      const raw = sessionStorage.getItem("thb:" + url);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (Date.now() - o.t > 60000) return null; // 60s TTL
      return o.data;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(url, data) {
    try {
      sessionStorage.setItem("thb:" + url, JSON.stringify({ data, t: Date.now() }));
    } catch (e) {}
  }

  // One request per url even if decorateCookedElement fires several times.
  function fetchBlock(url) {
    const cached = cacheGet(url);
    if (cached) return Promise.resolve(cached);
    if (inflight.has(url)) return inflight.get(url);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const p = fetch(url, { signal: ctrl.signal, credentials: "omit", mode: "cors" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        cacheSet(url, data);
        return data;
      })
      .finally(() => {
        clearTimeout(timer);
        inflight.delete(url);
      });

    inflight.set(url, p);
    return p;
  }

  function renderHtml(el, html) {
    // Trust boundary: `html` comes only from the admin-configured first-party
    // CMS (data-papers-src URL) over HTTPS, the same trust level as the
    // admin-pasted static `html` setting. <script> does NOT execute via
    // innerHTML. To harden, route this through DOMPurify (ADD_TAGS:['style',
    // 'svg',...]) in this one place.
    el.innerHTML = html;
  }

  // On a short first post, collapse the sections the CMS marked .gtc__hide-short
  // by toggling the card root into compact mode.
  function applyCompact(scope, isShort) {
    if (!isShort) return;
    const card = scope.querySelector(".gtc");
    if (card) card.classList.add("gtc--compact");
  }

  function removeWrapper(el) {
    const w = el.closest(".topic-html-block, .topic-html-strip");
    (w || el).remove();
  }

  // Resize lead-form iframes from their postMessage height reports. One
  // module-scope listener, origin-checked against the embed origins we created.
  const formOrigins = new Set();
  let formListenerAdded = false;
  function ensureFormListener() {
    if (formListenerAdded) return;
    formListenerAdded = true;
    window.addEventListener("message", (e) => {
      if (!formOrigins.has(e.origin)) return;
      const d = e.data;
      if (!d || d.type !== "thb-form-height" || typeof d.height !== "number") {
        return;
      }
      document.querySelectorAll("iframe.topic-html-form-iframe").forEach((f) => {
        try {
          if (new URL(f.src).origin === e.origin) {
            f.style.height = Math.max(200, d.height) + "px";
          }
        } catch (err) {}
      });
    });
  }

  function mountForm(el, embedSrc) {
    let origin;
    try {
      origin = new URL(embedSrc).origin;
    } catch (e) {
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.className = "topic-html-form-iframe";
    iframe.src = embedSrc;
    iframe.loading = "lazy";
    iframe.setAttribute("title", "Lead form");
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.height = "520px"; // fallback until postMessage reports height
    el.innerHTML = "";
    el.appendChild(iframe);
    formOrigins.add(origin);
    ensureFormListener();
  }

  // Fill every marker inside a freshly-injected wrapper:
  //   - data-papers-src="<full url>"            -> fetch that url
  //   - data-papers-src-base="<base url>"       -> append ?lang=<locale>
  //   - data-papers-embed-src present           -> mount the form iframe
  //   - otherwise                               -> replace innerHTML with html
  // Disabled-from-CMS drops the wrapper; fetch error keeps the inner fallback.
  function hydrateMarkers(wrapper, isShort) {
    const markers = wrapper.querySelectorAll(
      "[data-papers-src],[data-papers-src-base]"
    );
    markers.forEach((el) => {
      if (el.dataset.thbHydrated) return;
      el.dataset.thbHydrated = "1";

      let url = el.getAttribute("data-papers-src");
      const base = el.getAttribute("data-papers-src-base");
      if (!url && base) {
        url = base.replace(/\/+$/, "") + "?lang=" + baseLang();
      }
      if (!url) return;

      const embedSrc = el.getAttribute("data-papers-embed-src");
      el.setAttribute("data-thb-pending", "1");
      fetchBlock(url)
        .then((data) => {
          if (!el.isConnected) return;
          const enabled = !data || data.enabled !== false;
          if (!enabled) {
            removeWrapper(el);
            return;
          }
          if (embedSrc) {
            mountForm(el, embedSrc);
          } else if (data && data.html) {
            renderHtml(el, data.html);
            applyCompact(el, isShort);
          }
          // else: leave the fallback inner html in place
        })
        .catch(() => {
          /* network error / timeout -> keep fallback inner html */
        })
        .finally(() => {
          if (el.isConnected) el.removeAttribute("data-thb-pending");
        });
    });
  }

  window.__topicHtmlBlocksDebug = {
    bottom: bottomRaw,
    top: topRaw,
    topicIds: Array.from(topicMap.keys()),
    globalBlocks: globalBlocks.map((g) => g.name || ""),
    locale: getCurrentLocale(),
    enableRemote,
    remoteBase,
    compactMax,
  };

  if (topicMap.size === 0 && globalBlocks.length === 0) return;

  api.decorateCookedElement(
    (cooked, helper) => {
      if (!helper) return;
      const post = helper.getModel && helper.getModel();
      if (!post || post.post_number !== 1) return;

      // Measure the post body length BEFORE injecting (so the card's own text
      // never counts). On SPA re-decoration the wrappers already exist and the
      // idempotency guard skips them, so isShort is only used on first inject.
      const postLen = (cooked.textContent || "").trim().length;
      const isShort = compactMax > 0 && postLen < compactMax;

      // Topic-specific blocks always render. Global (all_topics) blocks render
      // only in slots not already claimed by a topic-specific block.
      const specific = topicMap.get(post.topic_id) || [];
      const specificSlots = new Set(specific.map((b) => b._slot));
      const matched = specific.concat(
        pickGlobalBlocks(post).filter((g) => !specificSlots.has(g._slot))
      );
      if (matched.length === 0) return;

      for (const block of matched) {
        const html = pickHtml(block);
        if (!html) continue;

        const isTop = block._slot === "top";
        const cls = isTop ? "topic-html-strip" : "topic-html-block";
        const name = block.name || "";
        const uid = block._uid || "b";

        // Per-block idempotency (keyed by the stable uid) so multiple blocks can
        // share a name and SPA re-decoration never duplicates a block.
        if (cooked.querySelector(`:scope > [data-thb-uid="${cssEscape(uid)}"]`)) {
          continue;
        }

        const wrapper = document.createElement("div");
        wrapper.className = cls;
        wrapper.dataset.blockName = name;
        wrapper.dataset.thbUid = uid;
        wrapper.innerHTML = html;
        applyCompact(wrapper, isShort); // static (non-remote) cards

        if (isTop) {
          cooked.prepend(wrapper);
        } else {
          cooked.appendChild(wrapper);
        }

        if (enableRemote) hydrateMarkers(wrapper, isShort);
      }
    },
    { id: "topic-html-blocks" }
  );
});
