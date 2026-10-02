/* English texts by key (T125). Every key here must exist in de.js with the same {placeholders}
   (test/locales.test.js checks it). Keys are grouped by area: common, nav, and one group per area task. */
var LOCALES = window.LOCALES || (window.LOCALES = {});
LOCALES.en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    edit: "Edit",
    back: "Back",
    loading: "Loading…",
    retry: "Try again",
    yes: "Yes",
    no: "No",
    items: { one: "{n} item", other: "{n} items" },
  },
  errors: {
    pageFailed: "We could not open this page",
    signInFirst: "Please sign in first.",
    wrongAccount: "This page belongs to another type of account.",
  },
};
