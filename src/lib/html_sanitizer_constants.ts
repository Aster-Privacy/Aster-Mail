//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { is_js_whitespace } from "./linear_trim";

export function fold_ascii_code(code: number): number {
  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code;
}

export function is_ascii_word_code(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f
  );
}

export function ascii_ci_at(
  value: string,
  index: number,
  needle_lower: string,
): boolean {
  if (index < 0 || index + needle_lower.length > value.length) return false;

  for (let offset = 0; offset < needle_lower.length; offset += 1) {
    if (
      fold_ascii_code(value.charCodeAt(index + offset)) !==
      needle_lower.charCodeAt(offset)
    ) {
      return false;
    }
  }

  return true;
}

export function index_of_ascii_ci(
  value: string,
  needle_lower: string,
  from = 0,
  end = value.length,
): number {
  const first = needle_lower.charCodeAt(0);
  const last_start = Math.min(end, value.length) - needle_lower.length;

  for (let index = Math.max(0, from); index <= last_start; index += 1) {
    if (
      fold_ascii_code(value.charCodeAt(index)) === first &&
      ascii_ci_at(value, index, needle_lower)
    ) {
      return index;
    }
  }

  return -1;
}

export function word_boundary_after(value: string, index: number): boolean {
  return index >= value.length || !is_ascii_word_code(value.charCodeAt(index));
}

export function skip_js_whitespace(value: string, index: number): number {
  let position = index;

  while (
    position < value.length &&
    is_js_whitespace(value.charCodeAt(position))
  ) {
    position += 1;
  }

  return position;
}

export function replace_up_to_last(
  value: string,
  terminator: string,
  pattern: RegExp,
  replacement: string,
): string {
  const last = value.lastIndexOf(terminator);

  if (last === -1) return value;

  const end = last + terminator.length;

  return value.slice(0, end).replace(pattern, replacement) + value.slice(end);
}

export interface StringTest {
  test(value: string): boolean;
}

function is_line_terminator(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
}

function line_end(value: string, from: number): number {
  let position = from;

  while (
    position < value.length &&
    !is_line_terminator(value.charCodeAt(position))
  ) {
    position += 1;
  }

  return position;
}

function host_marker_start(value: string, index: number): boolean {
  if (index === 0) return true;

  const previous = value.charCodeAt(index - 1);

  return previous === 0x2e || previous === 0x2f;
}

function host_then_on_same_line(host: string, tail: string): StringTest {
  return {
    test(value: string): boolean {
      let from = 0;

      for (;;) {
        const start = index_of_ascii_ci(value, host, from);

        if (start === -1) return false;

        if (!host_marker_start(value, start)) {
          from = start + 1;
          continue;
        }

        const after = start + host.length;
        const end = line_end(value, after);

        if (index_of_ascii_ci(value, tail, after, end) !== -1) return true;

        from = end + 1;
      }
    },
  };
}

function open_or_track_at(value: string, index: number): boolean {
  let after: number;

  if (ascii_ci_at(value, index, "open")) {
    after = index + 4;
  } else if (ascii_ci_at(value, index, "track")) {
    after = index + 5;
  } else {
    return false;
  }

  if (after >= value.length) return true;

  const code = value.charCodeAt(after);

  return code === 0x2f || code === 0x3f || code === 0x2e;
}

const AMAZONSES_HOST = "amazonses.com/";

const AMAZONSES_TRACKER: StringTest = {
  test(value: string): boolean {
    let from = 0;

    for (;;) {
      const start = index_of_ascii_ci(value, AMAZONSES_HOST, from);

      if (start === -1) return false;

      if (!host_marker_start(value, start)) {
        from = start + 1;
        continue;
      }

      const path_start = start + AMAZONSES_HOST.length;
      let segment_end = path_start;

      while (segment_end < value.length) {
        const code = value.charCodeAt(segment_end);

        if (code === 0x3f || code === 0x23) break;
        segment_end += 1;
      }

      if (open_or_track_at(value, path_start)) return true;

      for (let slash = path_start; slash < segment_end; slash += 1) {
        if (
          value.charCodeAt(slash) === 0x2f &&
          open_or_track_at(value, slash + 1)
        ) {
          return true;
        }
      }

      from = segment_end + 1;
    }
  },
};

function dimension_pixel_test(name: string): StringTest {
  return {
    test(value: string): boolean {
      for (
        let start = index_of_ascii_ci(value, name, 0);
        start !== -1;
        start = index_of_ascii_ci(value, name, start + 1)
      ) {
        if (start > 0) {
          const previous = value.charCodeAt(start - 1);

          if (
            previous !== 0x3b &&
            previous !== 0x7b &&
            !is_js_whitespace(previous)
          ) {
            continue;
          }
        }

        let position = skip_js_whitespace(value, start + name.length);
        const separator = value.charCodeAt(position);

        if (separator !== 0x3a && separator !== 0x3d) continue;

        position = skip_js_whitespace(value, position + 1);

        const quote = value.charCodeAt(position);

        if (quote === 0x22 || quote === 0x27) position += 1;

        const digit = value.charCodeAt(position);

        if (digit !== 0x30 && digit !== 0x31) continue;

        position += 1;

        const next = value.charCodeAt(position);

        if (next >= 0x30 && next <= 0x39) continue;

        position = skip_js_whitespace(value, position);

        if (ascii_ci_at(value, position, "px")) {
          position = skip_js_whitespace(value, position + 2);
        }

        if (position >= value.length) return true;

        const terminator = value.charCodeAt(position);

        if (terminator === 0x3b || terminator === 0x22 || terminator === 0x27) {
          return true;
        }
      }

      return false;
    },
  };
}

export const ALLOWED_TAGS = new Set([
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
  "style",
]);

export const DANGEROUS_TAGS = new Set([
  "script",
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
  "svg",
  "math",
  "foreignObject",
  "use",
  "set",
  "animate",
  "animateTransform",
  "animateMotion",
  "mpath",
  "clipPath",
  "defs",
  "desc",
  "feBlend",
  "feGaussianBlur",
  "filter",
  "g",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "symbol",
  "text",
  "tspan",
]);

export const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  "*": new Set([
    "class",
    "id",
    "title",
    "dir",
    "lang",
    "style",
    "data-aster-signature",
    "data-aster-signature-id",
  ]),
  a: new Set(["href", "target", "rel", "name"]),
  img: new Set([
    "src",
    "alt",
    "width",
    "height",
    "loading",
    "srcset",
    "sizes",
    "align",
    "border",
    "hspace",
    "vspace",
  ]),
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
    "background",
  ]),
  th: new Set([
    "colspan",
    "rowspan",
    "align",
    "valign",
    "width",
    "height",
    "bgcolor",
    "background",
  ]),
  table: new Set([
    "cellpadding",
    "cellspacing",
    "border",
    "width",
    "height",
    "align",
    "bgcolor",
    "background",
  ]),
  tr: new Set(["align", "valign", "bgcolor", "background"]),
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

export const DANGEROUS_URL_SCHEMES = new Set([
  "javascript:",
  "vbscript:",
  "file:",
]);

export const DANGEROUS_CSS_PATTERNS = [
  /expression\s*\(/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /behavior\s*:/i,
  /-moz-binding/i,
  /paint\s*\(/i,
  /-moz-document/i,
];

export const ALLOWED_DATA_URL_TYPES = new Set([
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/png",
  "data:image/gif",
  "data:image/webp",
  "data:image/avif",
  "data:image/bmp",
  "data:image/tiff",
  "data:image/heic",
  "data:image/heif",
  "data:image/x-icon",
  "data:image/vnd.microsoft.icon",
]);

export const TRACKING_PIXEL_PATTERNS: readonly StringTest[] = [
  dimension_pixel_test("width"),
  dimension_pixel_test("height"),
];

export const TRACKING_PIXEL_URL_PATTERNS: readonly StringTest[] = [
  /\/track(?:ing)?(?:[/?.]|$)/i,
  /\/open\//i,
  /\/pixel(?:[/?.]|$)/i,
  /\/beacon(?:[/?.]|$)/i,
  /\/wf\/open/i,
  /\/o\.gif/i,
  /\/t\.gif/i,
  /\/e\.gif/i,
  host_then_on_same_line("mailchimp.com", "/track"),
  host_then_on_same_line("list-manage.com", "/track"),
  host_then_on_same_line("sendgrid.net", "/wf/"),
  AMAZONSES_TRACKER,
  /(?:^|[./])doubleclick\.net(?:\/|$)/i,
  host_then_on_same_line("mailgun.org", "/o/"),
  /(?:^|[./])sparkpostmail(?:\/|$)/i,
  /(?:^|[./])returnpath\.net(?:\/|$)/i,
  /emltrk\./i,
  /bsn\.sendgrid/i,
];

export const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "oly_anon_id",
  "oly_enc_id",
  "_openstat",
  "vero_id",
  "wickedid",
  "yclid",
  "rb_clickid",
  "s_cid",
  "ml_subscriber",
  "ml_subscriber_hash",
  "igshid",
  "ref_src",
  "ref_url",
  "trk",
  "trkCampaign",
  "trkInfo",
  "sc_campaign",
  "sc_channel",
  "sc_content",
  "sc_medium",
  "sc_outcome",
  "sc_geo",
  "sc_country",
]);

export const MAX_CSS_PX = 1200;

export const COMPOSE_ALLOWED_CSS_PROPERTIES = new Set([
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "font-family",
  "text-align",
  "text-decoration",
  "text-transform",
  "letter-spacing",
  "white-space",
  "line-height",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-inline-start",
  "border-inline-end",
  "border-width",
  "border-style",
  "border-color",
  "border-collapse",
  "border-spacing",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-inline-start",
  "padding-inline-end",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-inline-start",
  "margin-inline-end",
  "max-width",
  "min-width",
  "max-height",
  "min-height",
  "height",
  "width",
  "table-layout",
  "object-fit",
  "float",
  "clear",
  "list-style-type",
  "list-style-position",
  "direction",
  "unicode-bidi",
  "display",
  "vertical-align",
]);

export const COMPOSE_ALLOWED_DISPLAY_VALUES = new Set([
  "block",
  "inline",
  "inline-block",
  "table",
  "inline-table",
  "table-row",
  "table-cell",
  "table-row-group",
  "table-header-group",
  "table-footer-group",
  "table-column",
  "table-column-group",
  "table-caption",
]);

export const COMPOSE_ALLOWED_VERTICAL_ALIGN_VALUES = new Set([
  "baseline",
  "top",
  "middle",
  "bottom",
  "text-top",
  "text-bottom",
]);
