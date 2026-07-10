const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "style",
  "form",
]);

const BLOCKED_ATTR_PREFIXES = ["on"];
const URL_ATTRS = new Set(["href", "src", "xlink:href", "formaction"]);
const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|\/|#)/i;

export function sanitizeHtml(html = "") {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return String(html || "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ""), "text/html");

  const allNodes = doc.body.querySelectorAll("*");
  for (const node of allNodes) {
    const tagName = String(node.tagName || "").toLowerCase();
    if (BLOCKED_TAGS.has(tagName)) {
      node.remove();
      continue;
    }

    for (const attr of [...node.attributes]) {
      const name = String(attr.name || "").toLowerCase();
      const value = String(attr.value || "").trim();

      if (BLOCKED_ATTR_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (name === "style") {
        node.removeAttribute(attr.name);
        continue;
      }

      if (URL_ATTRS.has(name) && value && !SAFE_URL_PATTERN.test(value)) {
        node.removeAttribute(attr.name);
      }
    }
  }

  return doc.body.innerHTML;
}

export function escapeHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
