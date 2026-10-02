/* One delegated listener instead of inline onclick/onchange attributes (T125), so the Content-Security-Policy
   can forbid inline scripts (T136). Markup: <button data-action="invoice.approve" data-id="inv_1">.
   Areas register: actions.on("invoice.approve", (el, event) => …). A form uses data-action on <form> for submit;
   inputs and selects use data-action for change, or data-input for input. */
const actions = (() => {
  const handlers = new Map(),
    warned = new Set();
  function run(name, el, event) {
    const fn = handlers.get(name);
    if (!fn) {
      if (!warned.has(name)) {
        warned.add(name);
        console.warn("No handler for action:", name);
      }
      return;
    }
    try {
      const result = fn(el, event);
      if (result && typeof result.catch === "function")
        result.catch((e) => typeof toast === "function" && toast(e.message, "error"));
    } catch (e) {
      console.error(e);
      if (typeof toast === "function") toast(e.message, "error");
    }
  }
  function on(name, fn) {
    handlers.set(name, fn);
  }
  // click on buttons/links, submit on forms, change on fields, input with data-input, keydown with data-key
  function onClick(event) {
    const el = event.target.closest("[data-action]");
    if (!el || el.tagName === "FORM") return;
    // Fields act on change (below); only checkboxes, radios and buttons act on click
    const field = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName),
      clickable = ["checkbox", "radio", "button", "submit"].includes(el.type);
    if (field && !clickable) return;
    if (el.tagName === "A" && !el.getAttribute("href")?.startsWith("#")) event.preventDefault();
    run(el.dataset.action, el, event);
  }
  document.addEventListener("click", (event) => !event.target.closest?.(".modal") && onClick(event));
  // A dialog (.modal) stops clicks from bubbling up to the document, so clicks inside it are caught on the way down
  document.addEventListener("click", (event) => event.target.closest?.(".modal") && onClick(event), true);
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-action]");
    if (!form) return;
    event.preventDefault();
    run(form.dataset.action, form, event);
  });
  document.addEventListener("change", (event) => {
    const el = event.target.closest("select[data-action], input[data-action]:not([type=checkbox]):not([type=radio]), textarea[data-action]");
    if (el) run(el.dataset.action, el, event);
  });
  document.addEventListener("input", (event) => {
    const el = event.target.closest("[data-input]");
    if (el) run(el.dataset.input, el, event);
  });
  document.addEventListener("keydown", (event) => {
    const el = event.target.closest("[data-key]");
    // data-key-on: the keys that act, comma separated ("Enter,Space"); Enter by default
    const keys = (el?.dataset.keyOn || "Enter").split(",").map((k) => (k === "Space" ? " " : k));
    if (el && keys.includes(event.key)) run(el.dataset.key, el, event);
  });
  return { on, run, has: (name) => handlers.has(name) };
})();
