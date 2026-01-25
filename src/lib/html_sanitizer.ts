import DOMPurify from "dompurify";

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "source",
  "span",
  "strike",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
  "font",
  "center",
]);

const DANGEROUS_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "applet",
  "base",
  "basefont",
  "bgsound",
  "frame",
  "frameset",
  "ilayer",
  "layer",
  "link",
  "meta",
  "noscript",
  "xml",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  "*": new Set(["class", "id", "title", "dir", "lang", "style"]),
  a: new Set(["href", "target", "rel", "name"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  div: new Set(["align"]),
  p: new Set(["align"]),
  span: new Set(["align"]),
  td: new Set([
    "colspan",
    "rowspan",
    "align",
    "valign",
    "width",
    "height",
    "bgcolor",
  ]),
  th: new Set([
    "colspan",
    "rowspan",
    "align",
    "valign",
    "width",
    "height",
    "bgcolor",
  ]),
  table: new Set([
    "cellpadding",
    "cellspacing",
    "border",
    "width",
    "height",
    "align",
    "bgcolor",
  ]),
  tr: new Set(["align", "valign", "bgcolor"]),
  col: new Set(["span", "width"]),
  colgroup: new Set(["span", "width"]),
  font: new Set(["color", "face", "size"]),
  source: new Set(["src", "srcset", "type", "media"]),
  ol: new Set(["start", "type", "reversed"]),
  li: new Set(["value"]),
  blockquote: new Set(["cite"]),
  q: new Set(["cite"]),
  time: new Set(["datetime"]),
  data: new Set(["value"]),
  h1: new Set(["align"]),
  h2: new Set(["align"]),
  h3: new Set(["align"]),
  h4: new Set(["align"]),
  h5: new Set(["align"]),
  h6: new Set(["align"]),
};

const DANGEROUS_URL_SCHEMES = new Set(["javascript:", "vbscript:", "file:"]);

const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /@import/i,
  /behavior\s*:/i,
  /-moz-binding/i,
  /url\s*\(\s*["']?\s*data:/i,
];

const ALLOWED_DATA_URL_TYPES = new Set([
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/png",
  "data:image/gif",
  "data:image/webp",
]);

function is_safe_url(url: string): boolean {
  const trimmed = url.trim().toLowerCase();

  for (const scheme of DANGEROUS_URL_SCHEMES) {
    if (trimmed.startsWith(scheme)) {
      return false;
    }
  }

  if (trimmed.startsWith("data:")) {
    for (const allowed_type of ALLOWED_DATA_URL_TYPES) {
      if (trimmed.startsWith(allowed_type)) {
        return true;
      }
    }

    return false;
  }

  return true;
}

function sanitize_style(style: string): string {
  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(style)) {
      return "";
    }
  }

  return style
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/javascript\s*:[^;]*/gi, "")
    .replace(/vbscript\s*:[^;]*/gi, "");
}

function sanitize_attribute(
  tag_name: string,
  attr_name: string,
  attr_value: string,
): string | null {
  const lower_attr = attr_name.toLowerCase();
  const lower_tag = tag_name.toLowerCase();

  if (lower_attr.startsWith("on")) {
    return null;
  }

  const global_allowed = ALLOWED_ATTRIBUTES["*"];
  const tag_allowed = ALLOWED_ATTRIBUTES[lower_tag];

  const is_allowed =
    global_allowed?.has(lower_attr) || tag_allowed?.has(lower_attr);

  if (!is_allowed) {
    return null;
  }

  if (lower_attr === "href" || lower_attr === "src") {
    if (!is_safe_url(attr_value)) {
      return null;
    }
  }

  if (lower_attr === "style") {
    return sanitize_style(attr_value);
  }

  if (lower_attr === "target") {
    return "_blank";
  }

  return attr_value;
}

export type ImageLoadMode = "always" | "ask" | "never";

export interface SanitizeOptions {
  image_mode?: ImageLoadMode;
}

export function sanitize_html(
  html: string,
  options: SanitizeOptions = {},
): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const { image_mode = "always" } = options;

  const purified = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: Array.from(ALLOWED_TAGS),
    ALLOWED_ATTR: [
      "class",
      "id",
      "title",
      "dir",
      "lang",
      "style",
      "href",
      "target",
      "rel",
      "name",
      "src",
      "alt",
      "width",
      "height",
      "loading",
      "colspan",
      "rowspan",
      "align",
      "valign",
      "bgcolor",
      "cellpadding",
      "cellspacing",
      "border",
      "color",
      "face",
      "size",
      "srcset",
      "type",
      "media",
      "start",
      "reversed",
      "value",
      "cite",
      "datetime",
      "span",
    ],
    FORBID_TAGS: Array.from(DANGEROUS_TAGS),
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    KEEP_CONTENT: true,
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(purified, "text/html");

  const sanitize_node = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.cloneNode(true);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as Element;
    const tag_name = element.tagName.toLowerCase();

    if (DANGEROUS_TAGS.has(tag_name)) {
      return null;
    }

    if (!ALLOWED_TAGS.has(tag_name)) {
      const fragment = document.createDocumentFragment();

      for (const child of Array.from(element.childNodes)) {
        const sanitized = sanitize_node(child);

        if (sanitized) {
          fragment.appendChild(sanitized);
        }
      }

      return fragment;
    }

    const new_element = document.createElement(tag_name);

    for (const attr of Array.from(element.attributes)) {
      const sanitized_value = sanitize_attribute(
        tag_name,
        attr.name,
        attr.value,
      );

      if (sanitized_value !== null) {
        new_element.setAttribute(attr.name, sanitized_value);
      }
    }

    if (tag_name === "a") {
      new_element.setAttribute("rel", "noopener noreferrer");
      if (!new_element.hasAttribute("target")) {
        new_element.setAttribute("target", "_blank");
      }
    }

    if (tag_name === "img") {
      const src = new_element.getAttribute("src") || "";
      const lower_src = src.toLowerCase().trim();
      const is_remote = src.startsWith("http://") || src.startsWith("https://");
      const is_data_url = lower_src.startsWith("data:");

      if (is_data_url) {
        const allowed_data_types = [
          "data:image/jpeg",
          "data:image/jpg",
          "data:image/png",
          "data:image/gif",
          "data:image/webp",
        ];
        const is_safe_data_url = allowed_data_types.some((type) =>
          lower_src.startsWith(type),
        );

        if (!is_safe_data_url) {
          const placeholder = document.createElement("span");

          placeholder.className = "blocked-image";
          placeholder.textContent = "[Blocked data URL]";

          return placeholder;
        }
      }

      if (is_remote) {
        if (image_mode === "never") {
          const placeholder = document.createElement("span");

          placeholder.className = "blocked-image";
          placeholder.setAttribute("data-original-src", src);
          placeholder.textContent = "[Image blocked]";

          return placeholder;
        } else if (image_mode === "ask") {
          new_element.setAttribute("data-original-src", src);
          new_element.setAttribute("data-blocked", "true");
          new_element.removeAttribute("src");
          new_element.setAttribute(
            "alt",
            new_element.getAttribute("alt") || "[Click to load image]",
          );
          new_element.className = (
            new_element.className + " blocked-remote-image"
          ).trim();
        }
      }
    }

    for (const child of Array.from(element.childNodes)) {
      const sanitized = sanitize_node(child);

      if (sanitized) {
        new_element.appendChild(sanitized);
      }
    }

    return new_element;
  };

  const fragment = document.createDocumentFragment();

  for (const child of Array.from(doc.body.childNodes)) {
    const sanitized = sanitize_node(child);

    if (sanitized) {
      fragment.appendChild(sanitized);
    }
  }

  const container = document.createElement("div");

  container.appendChild(fragment);

  return container.innerHTML;
}

export function is_html_content(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }

  const html_patterns = [
    /<[a-z][\s\S]*>/i,
    /<\/[a-z]+>/i,
    /<br\s*\/?>/i,
    /&[a-z]+;/i,
    /&#\d+;/i,
  ];

  return html_patterns.some((pattern) => pattern.test(content));
}

export function plain_text_to_html(text: string): string {
  if (!text) return "";

  const url_regex = /(https?:\/\/[^\s<>"'{}|\\^`[\]]+)/g;

  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  escaped = escaped.replace(url_regex, (url) => {
    const safe_url = url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    return `<a href="${safe_url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6;">${safe_url}</a>`;
  });

  escaped = escaped.replace(/\n/g, "<br>");

  return escaped;
}

export function strip_html_tags(html: string): string {
  if (!html || typeof html !== "string") return "";

  let result = html
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");

  result = result
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<\/div>/gi, " ")
    .replace(/<\/li>/gi, " ")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/tr>/gi, " ")
    .replace(/<[^>]*>/g, "");

  return result
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
