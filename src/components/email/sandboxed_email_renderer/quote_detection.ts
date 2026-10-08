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
export const MAX_ATTRIBUTION_LENGTH = 400;

const ATTRIBUTION_VERBS = [
  "wrote",
  "schrieb",
  "a\\s+écrit",
  "escribió",
  "ha\\s+scritto",
  "escreveu",
  "schreef",
  "skrev",
  "kirjoitti",
  "napisał\\(a\\)",
  "napisała",
  "napisał",
  "pisze",
  "пишет",
  "написал\\(а\\)",
  "написала",
  "написал",
  "yazdı",
  "έγραψε",
  "napsal\\(a\\)",
  "napsala",
  "napsal",
  "írta",
  "a\\s+scris",
  "写道",
  "寫道",
  "님이\\s*작성",
].join("|");

const ENGLISH_ATTRIBUTION_RE = /^On\s.+\b[Ww]rote\s*:\s*$/;
const VERB_END_RE = new RegExp(`(?:${ATTRIBUTION_VERBS})\\s*[:：]\\s*$`, "iu");
const VERB_MID_RE =
  /^(?:Am|Op|Den|Dne|På)\s.+\s(?:schrieb|schreef|skrev|napsal(?:\(a\)|a)?)\s.+[:：]\s*$/iu;
const ATTRIBUTION_PREFIX_RE =
  /^(?:On|Am|Le|El|Il|Em|Op|Den|W\s+dniu|Dne|Στις)\s/u;
const ATTRIBUTION_DETAIL_RE = /@|\d{1,2}[:.]\d{2}|\b(?:19|20)\d{2}\b/;
const SENTENCE_END_RE = /[.!?]$/;

const FROM_LINE_RE =
  /^\*?(?:From|Von|De|Da|Van|Från|Fra|Od|От|Lähettäjä|Feladó|Kimden|Από|发件人|寄件者|差出人|보낸\s*사람)\s*\*?\s*[:：]\s*\S/iu;
const DATE_LINE_RE =
  /^\*?(?:Sent|Date|Gesendet|Datum|Envoyé|Enviado|Fecha|Inviato|Data|Verzonden|Skickat|Sendt|Wysłano|Отправлено|Дата|Lähetetty|Päivämäärä|Elküldve|Dátum|Gönderildi|Tarih|Στάλθηκε|Ημερομηνία|发送时间|日期|送信日時|日付|보낸\s*날짜)\s*\*?\s*[:：]/iu;
const SUBJECT_LINE_RE =
  /^\*?(?:Subject|Betreff|Objet|Asunto|Assunto|Oggetto|Onderwerp|Ämne|Emne|Temat|Тема|Aihe|Tárgy|Konu|Θέμα|主题|主旨|件名|제목)\s*\*?\s*[:：]/iu;
const HEADER_BLOCK_SPAN = 7;

const ORIGINAL_MESSAGE_RE =
  /^-{2,}\s*(?:Ursprüngliche Nachricht|Message d'origine|Mensaje original|Messaggio originale|Mensagem original|Oorspronkelijk bericht|Ursprungligt meddelande|Oprindelig meddelelse|Opprinnelig melding|Alkuperäinen viesti|Oryginalna wiadomość|Původní zpráva|Eredeti üzenet|Исходное сообщение|Orijinal ileti)\s*-{2,}$/iu;
const SEPARATOR_LINE_RE = /^(?:[_\-=—]\s*){8,}$/;

export function is_quoted_line(text: string): boolean {
  return text.startsWith(">");
}

export function is_attribution_text(text: string): boolean {
  if (!text || text.length > MAX_ATTRIBUTION_LENGTH) return false;
  if (is_quoted_line(text)) return false;
  if (ENGLISH_ATTRIBUTION_RE.test(text)) return true;
  if (VERB_MID_RE.test(text)) return ATTRIBUTION_DETAIL_RE.test(text);
  if (!VERB_END_RE.test(text)) return false;

  return ATTRIBUTION_DETAIL_RE.test(text);
}

export function is_separator_text(text: string): boolean {
  return SEPARATOR_LINE_RE.test(text);
}

const MARKER_LINE_RE =
  /^-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}$/i;

export function is_boilerplate_text(text: string): boolean {
  if (!text || is_separator_text(text)) return true;

  return MARKER_LINE_RE.test(text) || ORIGINAL_MESSAGE_RE.test(text);
}

export function has_reply_text_before(
  lines: QuoteLine[],
  index: number,
): boolean {
  for (let i = 0; i < index; i++) {
    const text = lines[i].text;

    if (!is_boilerplate_text(text)) return true;
  }

  return false;
}

export interface QuoteLine {
  first: Node;
  last: Node;
  text: string;
  block: Node;
}

export interface QuoteStart {
  start: number;
  body_from: number;
}

export interface QuoteEnd {
  end: number;
  to_end: boolean;
}

const LINE_BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "CENTER",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

const SKIPPED_TEXT_PARENTS = new Set([
  "STYLE",
  "SCRIPT",
  "TEMPLATE",
  "NOSCRIPT",
  "TITLE",
]);

function nearest_line_block(node: Node, root: Node): Node {
  let n: Node | null = node.parentNode;

  while (n && n !== root) {
    if (
      n.nodeType === Node.ELEMENT_NODE &&
      LINE_BLOCK_TAGS.has((n as Element).tagName.toUpperCase())
    ) {
      return n;
    }
    n = n.parentNode;
  }

  return root;
}

export function collect_lines(root: Element): QuoteLine[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  const lines: QuoteLine[] = [];
  let current: QuoteLine | null = null;

  const flush = () => {
    if (!current) return;
    current.text = current.text.trim();
    lines.push(current);
    current = null;
  };

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toUpperCase();

      if (tag === "BR" || LINE_BLOCK_TAGS.has(tag)) flush();
      continue;
    }

    const parent = node.parentElement;

    if (parent && SKIPPED_TEXT_PARENTS.has(parent.tagName.toUpperCase())) {
      continue;
    }

    const text = node.textContent || "";
    const block = nearest_line_block(node, root);

    if (current && (current as QuoteLine).block !== block) flush();
    if (!current) {
      if (!text.trim()) continue;
      current = { first: node, last: node, text, block };
    } else {
      current.last = node;
      current.text += text;
    }
  }
  flush();

  return lines;
}

function is_header_block(lines: QuoteLine[], index: number): boolean {
  if (!FROM_LINE_RE.test(lines[index].text)) return false;

  let has_date = false;
  let has_subject = false;
  const limit = Math.min(lines.length, index + 1 + HEADER_BLOCK_SPAN);

  for (let j = index + 1; j < limit; j++) {
    const text = lines[j].text;

    if (DATE_LINE_RE.test(text)) has_date = true;
    if (SUBJECT_LINE_RE.test(text)) has_subject = true;
  }

  return has_date && has_subject;
}

function with_separator(
  lines: QuoteLine[],
  start: number,
  body_from: number,
): QuoteStart {
  const prev = lines[start - 1];

  if (prev && is_separator_text(prev.text)) {
    return { start: start - 1, body_from };
  }

  return { start, body_from };
}

function wraps_into_attribution(text: string, next: string | undefined) {
  if (!next || is_quoted_line(next)) return false;
  if (!ATTRIBUTION_PREFIX_RE.test(text)) return false;
  if (SENTENCE_END_RE.test(text)) return false;

  return is_attribution_text(`${text} ${next}`);
}

export function find_quote_start(lines: QuoteLine[]): QuoteStart | null {
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;

    if (!text || is_quoted_line(text)) continue;
    if (is_attribution_text(text)) return with_separator(lines, i, i + 1);
    if (wraps_into_attribution(text, lines[i + 1]?.text)) {
      return with_separator(lines, i, i + 2);
    }
    if (ORIGINAL_MESSAGE_RE.test(text)) return { start: i, body_from: i + 1 };
    if (is_header_block(lines, i)) {
      return with_separator(lines, i, lines.length);
    }
  }

  return null;
}

export function find_trailing_quote(lines: QuoteLine[]): QuoteStart | null {
  let last = lines.length - 1;

  while (last >= 0 && !lines[last].text) last--;
  if (last < 0 || !is_quoted_line(lines[last].text)) return null;

  let first = last;

  while (
    first > 0 &&
    (!lines[first - 1].text || is_quoted_line(lines[first - 1].text))
  ) {
    first--;
  }
  while (!lines[first].text) first++;

  let intro = first - 1;

  while (intro >= 0 && !lines[intro].text) intro--;

  const intro_text = intro >= 0 ? lines[intro].text : "";

  if (
    intro_text &&
    intro_text.length <= MAX_ATTRIBUTION_LENGTH &&
    VERB_END_RE.test(intro_text)
  ) {
    return { start: intro, body_from: first };
  }

  return { start: first, body_from: first };
}

export function resolve_quote_end(
  lines: QuoteLine[],
  body_from: number,
): QuoteEnd | null {
  const to_end: QuoteEnd = { end: lines.length - 1, to_end: true };
  let first = body_from;

  while (first < lines.length && !lines[first].text) first++;
  if (first >= lines.length || !is_quoted_line(lines[first].text)) {
    return to_end;
  }

  let last_quoted = first;

  for (let k = first + 1; k < lines.length; k++) {
    const text = lines[k].text;

    if (!text) continue;
    if (is_quoted_line(text)) {
      last_quoted = k;
      continue;
    }
    for (let rest = k + 1; rest < lines.length; rest++) {
      if (is_quoted_line(lines[rest].text)) return null;
    }

    return { end: last_quoted, to_end: false };
  }

  return to_end;
}
