import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.8.41", () => {
  const HTML_LABEL_RE = /^html\*?$/i;

  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  ).set;

  function enhance(input) {
    if (input.dataset.thbEnhanced) return;
    input.dataset.thbEnhanced = "1";

    const textarea = document.createElement("textarea");
    textarea.value = input.value;
    textarea.rows = 10;
    textarea.spellcheck = false;
    textarea.className = (input.className || "") + " thb-html-textarea";

    input.style.display = "none";
    input.insertAdjacentElement("afterend", textarea);

    textarea.addEventListener("input", () => {
      nativeSetter.call(input, textarea.value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function scan() {
    const labels = document.querySelectorAll(
      ".schema-theme-setting-editor label, .schema-theme-setting-editor__label, .form-kit__label"
    );
    labels.forEach((label) => {
      const text = (label.textContent || "").trim();
      if (!HTML_LABEL_RE.test(text)) return;
      const container =
        label.closest(
          ".schema-theme-setting-editor__field, .form-kit__field, .form-kit__container"
        ) || label.parentElement;
      if (!container) return;
      const input = container.querySelector(
        "input[type='text']:not([data-thb-enhanced])"
      );
      if (input) enhance(input);
    });
  }

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 50);
  }

  const obs = new MutationObserver(scheduleScan);
  obs.observe(document.body, { childList: true, subtree: true });
  scan();
});
