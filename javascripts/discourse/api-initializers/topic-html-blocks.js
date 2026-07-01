import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.9.6", (api) => {
  const enabled = settings.enable_remote !== false;
  const remoteBase = String(
    settings.remote_base_url || "https://papers.eliteskillset.com"
  ).replace(/\/+$/, "");
  const compactMaxRaw = parseInt(settings.compact_max_chars, 10);
  const compactMax = isNaN(compactMaxRaw) ? 600 : compactMaxRaw;
  if (!enabled || !remoteBase) return;

  const SLOT = {
    "pr-manager-strip": "top",
    "community-promo": "bottom",
    "lead-form": "form",
  };
  const ORDER = ["pr-manager-strip", "community-promo", "lead-form"];

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
  function baseLang() {
    const loc = getCurrentLocale().split(/[-_]/)[0];
    return loc === "ru" || loc === "en" || loc === "it" ? loc : "ru";
  }
  function cssEscape(s) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
    return String(s).replace(/["\\\]]/g, "\\$&");
  }

  var SP_KEYS = ["gclid", "gbraid", "wbraid", "gad_source", "gad_campaignid"];
  function isSp() {
    try {
      var q = new URLSearchParams(window.location.search);
      return (
        (window.location.hash || "").toLowerCase() === "#sp" ||
        SP_KEYS.some(function (k) {
          return !!q.get(k);
        }) ||
        (q.get("utm_source") === "google" && q.get("utm_medium") === "cpc")
      );
    } catch (e) {
      return false;
    }
  }

  const inflight = new Map();
  const memCache = new Map();
  function cacheGet(url) {
    const o = memCache.get(url);
    if (!o) return null;
    if (Date.now() - o.t > 10000) return null;
    return o.data;
  }
  function cacheSet(url, data) {
    memCache.set(url, { data, t: Date.now() });
  }
  function fetchAll(lang) {
    const spQ = isSp() ? "&sp=1" : "";
    const url = remoteBase + "/api/forum-blocks?lang=" + encodeURIComponent(lang) + spQ;
    const cached = cacheGet(url);
    if (cached) return Promise.resolve(cached);
    if (inflight.has(url)) return inflight.get(url);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const p = fetch(url, { signal: ctrl.signal, credentials: "omit", mode: "cors", cache: "no-store" })
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
    el.innerHTML = html;
  }
  function applyCompact(scope, isShort) {
    if (!isShort) return;
    const card = scope.querySelector(".gtc");
    if (card) card.classList.add("gtc--compact");
  }

  let topStrip = null;
  let stripObserver = null;
  function matchPostWidth() {
    if (!topStrip || !topStrip.wrap.isConnected || !topStrip.cooked.isConnected) return;
    try {
      const c = topStrip.cooked.getBoundingClientRect();
      const host = topStrip.wrap.parentElement;
      const h = host.getBoundingClientRect();
      const hs = getComputedStyle(host);
      const inset = (host.clientLeft || 0) + (parseFloat(hs.paddingLeft) || 0);
      if (c.width > 0) {
        topStrip.wrap.style.maxWidth = Math.round(c.width) + "px";
        topStrip.wrap.style.marginLeft = Math.round(Math.max(0, c.left - h.left - inset)) + "px";
      }
    } catch (e) {}
  }
  let resizeBound = false;
  function insertTopStrip(cooked, key, html) {
    const titleEl =
      document.querySelector("#topic-title") || document.querySelector(".topic-title");
    const host = titleEl && titleEl.parentElement;
    if (titleEl && host) {
      let wrap = host.querySelector(`:scope > .topic-html-strip[data-thb-key="${cssEscape(key)}"]`);
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "topic-html-strip topic-html-strip--top";
        wrap.dataset.thbKey = key;
        renderHtml(wrap, html);
        host.insertBefore(wrap, titleEl);
      }
      topStrip = { wrap, cooked };
      matchPostWidth();
      if (window.requestAnimationFrame) requestAnimationFrame(matchPostWidth);
      if (window.ResizeObserver) {
        if (stripObserver) stripObserver.disconnect();
        stripObserver = new ResizeObserver(matchPostWidth);
        stripObserver.observe(cooked);
      }
      if (!resizeBound) {
        resizeBound = true;
        window.addEventListener("resize", matchPostWidth);
      }
      return;
    }
    if (cooked.querySelector(`:scope > [data-thb-key="${cssEscape(key)}"]`)) return;
    const wrap = document.createElement("div");
    wrap.className = "topic-html-strip";
    wrap.dataset.thbKey = key;
    renderHtml(wrap, html);
    cooked.prepend(wrap);
  }

  function removeBlock(cooked, key) {
    const sel = `[data-thb-key="${cssEscape(key)}"]`;
    cooked.querySelectorAll(`:scope > ${sel}`).forEach((n) => n.remove());
    document.querySelectorAll(`.topic-html-strip${sel}`).forEach((n) => n.remove());
  }

  const formOrigins = new Set();
  let formListenerAdded = false;
  function ensureFormListener() {
    if (formListenerAdded) return;
    formListenerAdded = true;
    window.addEventListener("message", (e) => {
      if (!formOrigins.has(e.origin)) return;
      const d = e.data;
      if (!d || d.type !== "thb-form-height" || typeof d.height !== "number") return;
      document.querySelectorAll("iframe.topic-html-form-iframe").forEach((f) => {
        try {
          if (new URL(f.src).origin === e.origin) {
            f.style.height = Math.min(4000, Math.max(200, d.height)) + "px";
          }
        } catch (err) {}
      });
    });
  }
  function mountFormInto(wrapper, embedSrc) {
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
    iframe.style.height = "520px";
    wrapper.appendChild(iframe);
    formOrigins.add(origin);
    ensureFormListener();
  }

  function postTextLen(cooked) {
    let len = 0;
    cooked.childNodes.forEach((n) => {
      if (
        n.nodeType === 1 &&
        (n.classList.contains("topic-html-block") || n.classList.contains("topic-html-strip"))
      ) {
        return;
      }
      len += (n.textContent || "").length;
    });
    return len;
  }

  api.decorateCookedElement(
    (cooked, helper) => {
      if (!helper) return;
      const post = helper.getModel && helper.getModel();
      if (!post || post.post_number !== 1) return;

      const isShort = compactMax > 0 && postTextLen(cooked) < compactMax;
      const lang = baseLang();

      fetchAll(lang)
        .then((data) => {
          if (!cooked.isConnected) return;
          const blocks = (data && data.blocks) || {};
          const keys = ORDER.concat(
            Object.keys(blocks).filter((k) => ORDER.indexOf(k) === -1)
          );

          for (const key of keys) {
            const b = blocks[key];
            const slot = (b && b.slot) || SLOT[key] || "bottom";

            if (!b || b.enabled === false || (slot !== "form" && !b.html)) {
              removeBlock(cooked, key);
              continue;
            }

            if (slot === "top") {
              insertTopStrip(cooked, key, b.html);
              continue;
            }

            if (cooked.querySelector(`:scope > [data-thb-key="${cssEscape(key)}"]`)) {
              continue;
            }
            if (slot === "form") {
              const wrap = document.createElement("div");
              wrap.className = "topic-html-block";
              wrap.dataset.thbKey = key;
              mountFormInto(wrap, remoteBase + "/embed/lead-form?lang=" + encodeURIComponent(lang));
              cooked.appendChild(wrap);
            } else {
              const wrap = document.createElement("div");
              wrap.className = "topic-html-block";
              wrap.dataset.thbKey = key;
              renderHtml(wrap, b.html);
              applyCompact(wrap, isShort);
              cooked.appendChild(wrap);
            }
          }
        })
        .catch(() => {});
    },
    { id: "topic-html-blocks" }
  );

  api.onPageChange((url) => {
    const onTopic = typeof url === "string" && url.includes("/t/");
    if (!onTopic) {
      document.querySelectorAll(".topic-html-strip--top").forEach((n) => n.remove());
      if (stripObserver) {
        stripObserver.disconnect();
        stripObserver = null;
      }
      topStrip = null;
    }
  });
});
