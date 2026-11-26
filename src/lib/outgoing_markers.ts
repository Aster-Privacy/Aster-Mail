//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
const SIGNATURE_ID_ATTRIBUTE = "data-aster-signature-id";

const SIGNATURE_ID_ATTRIBUTE_RE =
  /\s+data-aster-signature-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=`]+)/gi;

function start_tag_end(html: string, from: number): number {
  let quote: string | null = null;

  for (let i = from; i < html.length; i++) {
    const ch = html[i];

    if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }

  return -1;
}

function is_letter(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z]/.test(ch);
}

export function strip_outgoing_markers(html: string): string {
  if (!html || !html.toLowerCase().includes(SIGNATURE_ID_ATTRIBUTE)) {
    return html;
  }

  const parts: string[] = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);

    if (lt < 0 || lt + 1 >= html.length) {
      parts.push(html.slice(i));
      break;
    }

    parts.push(html.slice(i, lt));

    if (!is_letter(html[lt + 1])) {
      parts.push("<");
      i = lt + 1;
      continue;
    }

    const gt = start_tag_end(html, lt + 1);

    if (gt < 0) {
      parts.push(html.slice(lt));
      break;
    }

    const tag = html.slice(lt, gt + 1);

    parts.push(
      tag.toLowerCase().includes(SIGNATURE_ID_ATTRIBUTE)
        ? tag.replace(SIGNATURE_ID_ATTRIBUTE_RE, "")
        : tag,
    );
    i = gt + 1;
  }

  return parts.join("");
}
