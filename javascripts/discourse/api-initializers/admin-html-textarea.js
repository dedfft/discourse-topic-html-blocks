import { apiInitializer } from "discourse/lib/api";

export default apiInitializer("0.8.41", () => {
  const TARGET_LABELS = new Set(["html"]);

  const nativeInputSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  ).set;

  function normalize(text) {
    return (text || "").replace(/[\s*]+/g, "").toLowerCase();
  }

  function enlargeTextarea(textarea) {
    if (textarea.dataset.thbEnhanced) return;
    textarea.dataset.thbEnhanced = "1";
    textarea.classList.add("thb-html-textarea");
    textarea.spellcheck = false;
    if (!textarea.rows || textarea.rows < 20) textarea.rows = 20;
  }

  function swapInputForTextarea(input) {
    if (input.dataset.thbEnhanced) return;
    input.dataset.thbEnhanced = "1";

    const textarea = document.createElement("textarea");
    textarea.value = input.value;
    textarea.rows = 20;
    textarea.spellcheck = false;
    textarea.className = (input.className || "") + " thb-html-textarea";
    textarea.dataset.thbEnhanced = "1";

    input.style.display = "none";
    input.insertAdjacentElement("afterend", textarea);

    textarea.addEventListener("input", () => {
      nativeInputSetter.call(input, textarea.value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function fieldContainerFor(label) {
    return (
      label.closest(
        ".schema-theme-setting-editor__field, .form-kit__field, .form-kit__container, .schema-field"
      ) || label.parentElement
    );
  }

  function isTargetLabel(label) {
    if (!label) return false;
    const normalized = normalize(label.textContent);
    return TARGET_LABELS.has(normalized);
  }

  function scan() {
    const labels = document.querySelectorAll(
      ".schema-theme-setting-editor label, " +
        ".schema-theme-setting-editor__label, " +
        ".form-kit__label, " +
        ".schema-field__label"
    );

    labels.forEach((label) => {
      if (!isTargetLabel(label)) return;

      const container = fieldContainerFor(label);
      if (!container) return;

      const existingTextarea = container.querySelector(
        "textarea:not([data-thb-enhanced])"
      );
      if (existingTextarea) {
        enlargeTextarea(existingTextarea);
        return;
      }

      const input = container.querySelector(
        "input:not([type='hidden']):not([data-thb-enhanced])"
      );
      if (input) swapInputForTextarea(input);
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
