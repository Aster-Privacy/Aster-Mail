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
import {
  DANGEROUS_CSS_PATTERNS,
  MAX_CSS_PX,
  COMPOSE_ALLOWED_CSS_PROPERTIES,
} from "./html_sanitizer_constants";

export function decode_css_entities(raw: string): string {
  let decoded = raw;

  for (let i = 0; i < 3; i++) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/&#(\d+);?/g, (_m, dec) =>
        String.fromCharCode(parseInt(dec, 10)),
      )
      .replace(/&([a-z]+);/gi, (match, name) => {
        const map: Record<string, string> = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          tab: "\t",
          newline: "\n",
        };

        return map[name.toLowerCase()] ?? match;
      });

    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

export function cap_css_dimension(value: string): string {
  return value.replace(/:\s*(\d+(?:\.\d+)?)\s*px/gi, (_match, num) => {
    const capped = Math.min(parseFloat(num), MAX_CSS_PX);

    return `: ${capped}px`;
  });
}

export function strip_css_urls(css: string): string {
  return css.replace(
    /url\s*\(\s*["']?(.*?)["']?\s*\)/gi,
    (_match, url_content) => {
      const trimmed = (url_content || "").trim().toLowerCase();

      if (trimmed.startsWith("data:")) {
        return _match;
      }

      return "none";
    },
  );
}

export const block_remote_fonts = (css: string): string => {
  return css.replace(/@font-face\s*\{[^}]*\}/gi, "");
};

export function sanitize_style(style: string, sandbox_mode: boolean): string {
  const decoded = decode_css_entities(style);

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(decoded)) {
      return "";
    }
  }

  let result = decoded;

  result = result.replace(/expression\s*\([^)]*\)/gi, "");
  result = result.replace(/javascript\s*:[^;]*/gi, "");
  result = result.replace(/vbscript\s*:[^;]*/gi, "");

  if (!sandbox_mode) {
    result = strip_css_urls(result);
    result = result.replace(
      /position\s*:\s*(absolute|fixed|sticky)/gi,
      "position: relative",
    );
    result = result.replace(
      /cursor\s*:[^;]*url\s*\([^)]*\)[^;]*/gi,
      "cursor: default",
    );
    result = result.replace(
      /content\s*:\s*(?!["']?\s*["']?\s*;|["']?\s*["']?\s*$|none\s*;|none\s*$|""\s*;|""\s*$|''\s*;|''\s*$)[^;]*/gi,
      "content: none",
    );
    result = cap_css_dimension(result);
  }

  return result;
}

export function strip_dark_mode_media(css: string): string {
  let result = css;
  const pattern =
    /@media\s*\([^)]*prefers-color-scheme\s*:\s*dark[^)]*\)\s*\{/gi;
  let match;

  while ((match = pattern.exec(result)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;

    while (i < result.length && depth > 0) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      i++;
    }

    result = result.slice(0, match.index) + result.slice(i);
    pattern.lastIndex = match.index;
  }

  return result;
}

export function sanitize_css_block(css: string, sandbox_mode = false): string {
  let decoded = decode_css_entities(css);

  if (!sandbox_mode) {
    decoded = decoded.replace(/@import[^;]*;?/gi, "");
  }
  decoded = decoded.replace(/@charset[^;]*;?/gi, "");
  decoded = decoded.replace(/expression\s*\([^)]*\)/gi, "");
  decoded = decoded.replace(/javascript\s*:[^;]*/gi, "");
  decoded = decoded.replace(/vbscript\s*:[^;]*/gi, "");
  decoded = decoded.replace(/-moz-binding\s*:[^;]*/gi, "");
  decoded = decoded.replace(/behavior\s*:[^;]*/gi, "");
  decoded = decoded.replace(/@namespace[^;]*;?/gi, "");
  decoded = decoded.replace(/@document[^;]*;?/gi, "");
  decoded = decoded.replace(/-moz-document[^;{]*\{[^}]*\}/gi, "");
  decoded = decoded.replace(/image-set\s*\([^)]*\)/gi, "none");
  decoded = decoded.replace(/-webkit-image-set\s*\([^)]*\)/gi, "none");
  decoded = decoded.replace(/cross-fade\s*\([^)]*\)/gi, "none");
  decoded = strip_dark_mode_media(decoded);

  return decoded;
}

export function sanitize_compose_style(style_text: string): string {
  const decoded = decode_css_entities(style_text);

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(decoded)) {
      return "";
    }
  }

  const declarations = decoded.split(";").filter(Boolean);
  const safe_declarations: string[] = [];

  for (const decl of declarations) {
    const colon_index = decl.indexOf(":");

    if (colon_index === -1) continue;

    const prop = decl.slice(0, colon_index).trim().toLowerCase();
    const value = decl.slice(colon_index + 1).trim();

    if (!COMPOSE_ALLOWED_CSS_PROPERTIES.has(prop)) continue;

    if (/url\s*\(/i.test(value)) continue;
    if (/expression\s*\(/i.test(value)) continue;
    if (/javascript\s*:/i.test(value)) continue;

    safe_declarations.push(`${prop}: ${value}`);
  }

  return safe_declarations.join("; ");
}
