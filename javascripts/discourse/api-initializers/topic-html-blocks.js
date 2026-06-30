import { apiInitializer } from "discourse/lib/api";

// Zero-config: set remote_base_url and the component fetches ALL blocks from the
// CMS and renders each at the slot the CMS reports (top strip / bottom card /
// embedded form). Nothing to paste or configure per topic — papers.eliteskillset.com
// fully controls content, language, on/off, and placement.
export default apiInitializer("0.9.4", (api) => {
  const enabled = settings.enable_remote !== false;
  const remoteBase = String(
    settings.remote_base_url || "https://papers.eliteskillset.com"
  ).replace(/\/+$/, "");
  const compactMaxRaw = parseInt(settings.compact_max_chars, 10);
  const compactMax = isNaN(compactMaxRaw) ? 600 : compactMaxRaw;
  if (!enabled || !remoteBase) return;

  // Fallback slot mapping when the API doesn't report one; render order too.
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

  // --- paid-source marker (sp) ------------------------------------------------
  // Sets sp=1 on the CMS fetch when the entry URL carries a paid click marker
  // (any of the markers below, or the source/medium pair). The marker only rides
  // the ENTRY url, so a positive hit is remembered for the SESSION. The param
  // name and storage key are intentionally non-descriptive. All storage/URL
  // access is try/catch-guarded for private-mode safety.
  //
  // Timing note: Discourse's server 301s the short /t/<id> form to the canonical
  // /t/<slug>/<id> and DROPS the query string, and the SPA re-writes the URL on
  // route transitions. So we read the entry URL as EARLY as possible (the boot
  // call below) and persist the verdict to sessionStorage for the rest of the
  // session. The #sp hash is a QA override: a fragment survives the 301 (the
  // browser re-attaches it to the redirect target), so /t/<id>#sp is a shareable
  // test link that flips the gate on without real ad params.
  var SP_KEYS = ["gclid", "gbraid", "wbraid", "gad_source", "gad_campaignid"];
  var SP_STORE = "es_sp";
  function isSp() {
    try {
      try {
        if (window.sessionStorage.getItem(SP_STORE) === "1") return true;
      } catch (e) {}
      var q = new URLSearchParams(window.location.search);
      var hit =
        (window.location.hash || "").toLowerCase() === "#sp" ||
        SP_KEYS.some(function (k) {
          return !!q.get(k);
        }) ||
        (q.get("utm_source") === "google" && q.get("utm_medium") === "cpc");
      if (hit) {
        try {
          window.sessionStorage.setItem(SP_STORE, "1");
        } catch (e) {}
      }
      return hit;
    } catch (e) {
      return false;
    }
  }

  // Capture the marker at BOOT (full page load), before the SPA router can
  // normalize the topic URL and discard the query. fetchAll re-reads it (from
  // sessionStorage) on every decorate for the rest of the session.
  isSp();

  // --- fetch (the whole bundle in one request, cached) ----------------------
  const inflight = new Map();
  // IN-MEMORY cache (not sessionStorage): it's cleared on every full page reload,
  // so a refresh always refetches fresh content. The short TTL only dedups the
  // repeated decorateCookedElement calls within a single page render / SPA nav.
  const memCache = new Map();
  function cacheGet(url) {
    const o = memCache.get(url);
    if (!o) return null;
    if (Date.now() - o.t > 10000) return null; // 10s
    return o.data;
  }
  function cacheSet(url, data) {
    memCache.set(url, { data, t: Date.now() });
  }
  function fetchAll(lang) {
    // sp is part of the URL, so the two render variants get separate cache
    // entries (memCache/inflight key off the full URL) and never cross-serve.
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
    // Trust boundary: html comes only from the first-party CMS over HTTPS.
    // <script> never executes via innerHTML. Harden via DOMPurify here if needed.
    el.innerHTML = html;
  }
  function applyCompact(scope, isShort) {
    if (!isShort) return;
    const card = scope.querySelector(".gtc");
    if (card) card.classList.add("gtc--compact");
  }

  // Top strip → ABOVE the topic title (below any banner, above the title),
  // full-width (the --top CSS overrides the pill's centering so it lines up
  // with the title instead of floating in the middle). One strip per page;
  // content is identical on every topic, so no per-topic tracking is needed.
  // Size the title-area strip to the POST content column (the cooked element),
  // not the full-page title container — match its width and left edge. Re-runs
  // on window resize so it stays aligned.
  let topStrip = null;
  let stripObserver = null;
  function matchPostWidth() {
    if (!topStrip || !topStrip.wrap.isConnected || !topStrip.cooked.isConnected) return;
    try {
      const c = topStrip.cooked.getBoundingClientRect();
      const host = topStrip.wrap.parentElement;
      const h = host.getBoundingClientRect();
      // marginLeft is measured from the host's CONTENT box, but getBoundingClientRect
      // is border-box — subtract the host's left border + padding so the strip's left
      // edge lands on the post column even when the title host has inline padding.
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
      // Re-measure after layout settles, and whenever the post column reflows
      // (sidebar toggle, zoom, font/image load) — not only on window resize.
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
    // Fallback: top of the post body (guarded as a cooked child).
    if (cooked.querySelector(`:scope > [data-thb-key="${cssEscape(key)}"]`)) return;
    const wrap = document.createElement("div");
    wrap.className = "topic-html-strip";
    wrap.dataset.thbKey = key;
    renderHtml(wrap, html);
    cooked.prepend(wrap);
  }

  // Remove any wrapper we previously injected for a key (post body card/form
  // AND the title-area strip) — used when the CMS disables or drops a block.
  function removeBlock(cooked, key) {
    const sel = `[data-thb-key="${cssEscape(key)}"]`;
    cooked.querySelectorAll(`:scope > ${sel}`).forEach((n) => n.remove());
    document.querySelectorAll(`.topic-html-strip${sel}`).forEach((n) => n.remove());
  }

  // --- lead-form iframe + postMessage auto-resize ---------------------------
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

  // Post body length, EXCLUDING blocks we injected (stable across re-decoration).
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

  window.__topicHtmlBlocksDebug = { remoteBase, compactMax, locale: getCurrentLocale() };

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
          // Iterate ALL known keys (+ any extras) so a disabled/removed block is
          // actively cleaned up, not merely skipped.
          const keys = ORDER.concat(
            Object.keys(blocks).filter((k) => ORDER.indexOf(k) === -1)
          );

          for (const key of keys) {
            const b = blocks[key];
            const slot = (b && b.slot) || SLOT[key] || "bottom";

            // Disabled / removed / no content -> remove any wrapper we injected.
            if (!b || b.enabled === false || (slot !== "form" && !b.html)) {
              removeBlock(cooked, key);
              continue;
            }

            // Top strip → above the topic title (its own guard inside that fn).
            if (slot === "top") {
              insertTopStrip(cooked, key, b.html);
              continue;
            }

            // bottom / form: children of the post body, guarded per key.
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
        .catch(() => {
          /* network error / timeout -> render nothing */
        });
    },
    { id: "topic-html-blocks" }
  );

  // Clean up the title-area strip when navigating OFF a topic so it never
  // lingers on /latest, categories, user pages, etc. On topics the decorator
  // (re)inserts and dedupes it; remove-on-disable handles the disabled case.
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
