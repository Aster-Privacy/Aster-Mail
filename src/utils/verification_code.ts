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
const MAX_SCAN_LENGTH = 2000;
const LONG_BODY_LENGTH = 400;
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 8;
const MIN_GROUP_LENGTH = 3;
const MAX_GROUP_LENGTH = 4;
const STRONG_DISTANCE = 32;
const WEAK_DISTANCE = 20;
const DIRECT_DISTANCE = 8;
const MAX_GAP_WORDS = 3;
const BLOCKING_DISTANCE = 24;
const TECHNICAL_MARKER_LIMIT = 2;

const BOUNDARY_CHAR =
  /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{N}_]/u;
const CODE_TOKEN = /[A-Za-z0-9]+/g;
const CODE_CHARS = /^[A-Z0-9]+$/;
const DIGITS = /^[0-9]+$/;
const HAS_DIGIT = /[0-9]/;
const HAS_LETTER = /[A-Z]/;
const HEX_ONLY = /^[0-9A-F]+$/;
const UNIT_SUFFIX =
  /^[0-9]+(?:ST|ND|RD|TH|AM|PM|K|M|P|GB|MB|KB|TB|PX|MP|HZ|FPS)$/;
const WORD = /[\p{L}\p{N}]+/gu;
const SENTENCE_BREAK = /[.!?。！？](?:\s|$)/u;
const SPACE = /\s/u;
const LETTER = /\p{L}/u;
const UPPER_ASCII = /^[A-Z]$/;
const PATH_LIKE = /[./\\\d]/;
const INTENT_PREFIX = /^(?:PIN|OTP|CODE|TAN|KOD)$/i;

const REPLY_PREFIX =
  /^\s*(?:(?:re|fwd?|aw|wg|tr|rv|sv|vs|antw|odp|enc|r|ynt|ilt|ответ|отв|пересл|回复|答复|转发|回覆|轉寄)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]\s*)+/iu;

const AUTOMATED_LOCAL_PART =
  /^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|notify|alerts?|security|verify|verification|accounts?|auth|login|signin|otp|codes?|mailer(?:-daemon)?|system|automated|robot|bot)(?:[-_.+][a-z0-9._+-]*)?$/i;

const QUOTE_MARKERS = [
  /(?:^|\s)On\s[^\n]{1,200}?\swrote:/iu,
  /(?:^|\s)(?:Am|Le|El|Il|Op|Em|W dniu)\s[^\n]{1,200}?\s(?:schrieb|a écrit|escribió|ha scritto|schreef|napisał\p{L}*|escreveu)\s?\p{L}*:/iu,
  /-{2,}\s*(?:original message|forwarded message|weitergeleitete nachricht|ursprüngliche nachricht|message transféré|message d'origine|mensaje reenviado|mensaje original|messaggio inoltrato|messaggio originale|doorgestuurd bericht|oorspronkelijk bericht|wiadomość przekazana|oryginalna wiadomość|mensagem encaminhada|mensagem original|пересылаемое сообщение|исходное сообщение)/iu,
  /(?:^|\n)[ \t]*>/u,
  /(?:^|\n)\s*(?:From|Von|De|Da|Van|Od|От|Kimden):[^\n]*\n\s*(?:Sent|Date|Gesendet|Datum|Envoyé|Enviado|Fecha|Inviato|Data|Verzonden|Wysłano|Отправлено|Tarih):/iu,
];

const STRIPPED_SEGMENTS = [
  /```[\s\S]*?(?:```|$)/gu,
  /`[^`\n]*`/gu,
  /^(?: {4}|\t).*$/gmu,
  /(?:https?:\/\/|www\.)\S+/giu,
  /[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+\/\S*/gu,
  /\S+@\S+/gu,
];

const TECHNICAL_MARKERS = [
  /(?<![\p{L}\p{N}])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}(?![\p{L}\p{N}])/gu,
  /[\p{L}\p{N}_/.-]+\.(?:rs|ts|tsx|js|jsx|mjs|kt|kts|swift|py|go|java|rb|php|c|cc|cpp|h|hpp|cs|sql|sh|yml|yaml|toml|gradle)(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])v[0-9]+\.[0-9]+(?:\.[0-9]+)*(?![\p{L}\p{N}])/giu,
  /(?<![\p{L}\p{N}])(?:commits?|branch|pull request|merge request|stack ?trace|regression|segfault|null pointer|exception|cve-[0-9]{4}-[0-9]+|ghsa-[\p{L}\p{N}-]+|line [0-9]+)(?![\p{L}\p{N}])/giu,
];

const PROMOTION_PATTERN =
  /(?<![\p{L}\p{N}])(?:gift ?cards?|promo\p{L}*|coupons?|discount\p{L}*|vouchers?|rabatt\p{L}*|gutschein\p{L}*|descuento\p{L}*|cup[oó]n\p{L}*|réduction\p{L}*|sconto|скидк\p{L}*)|[0-9]{1,3} ?% off|优惠|折扣|割引/iu;

const BOUNDED_START = "(?<![\\p{L}\\p{N}])";
const BOUNDED_END = "(?![\\p{L}\\p{N}])";

const STRONG_BOUNDED = [
  "(?:verification|verify|confirmation|security|sign[- ]?in|log[- ]?in|login|logon|access|authentication|authenticator|auth|authorization|one[- ]?time|single[- ]?use|2fa|two[- ]?factor|2[- ]?step|mfa|otp|temporary|activation|reset|recovery|device|pairing|approval)\\s+(?:pass)?codes?",
  "one[- ]?time\\s+(?:password|passcode|pin)",
  "passcodes?",
  "otp",
  "your(?:\\s+[\\p{L}\\p{N}-]+){0,2}?\\s+(?:codes?|pin|passcode)",
  "(?:enter|use)\\s+(?:this|the\\s+following|the)\\s+code",
  "(?:best[äa]tigungs|verifizierungs|sicherheits|anmelde|einmal|zugangs|freigabe|login)code",
  "einmal(?:passwort|kennwort)",
  "(?:ihr|dein|deinen|ihren)\\s+code",
  "c[oó]digo\\s+de\\s+(?:verificaci[oó]n|verifica[cç][aã]o|seguridad|seguran[cç]a|acceso|acesso|confirmaci[oó]n|confirma[cç][aã]o|inicio\\s+de\\s+sesi[oó]n|login|un\\s+solo\\s+uso)",
  "(?:tu|su|seu|teu)\\s+c[oó]digo",
  "code\\s+de\\s+(?:v[eé]rification|s[eé]curit[eé]|connexion|confirmation|validation)",
  "(?:votre|ton)\\s+code",
  "codice\\s+(?:di\\s+(?:verifica|sicurezza|accesso|conferma)|otp)",
  "(?:il\\s+)?(?:tuo|suo)\\s+codice",
  "(?:verificatie|beveiligings|inlog|bevestigings|toegangs)code",
  "(?:je|jouw|uw)\\s+code",
  "kod\\s+(?:weryfikacyjny|bezpiecze[nń]stwa|potwierdzaj[aą]cy|logowania|jednorazowy|dost[eę]pu|sms)",
  "(?:tw[oó]j|pa[nń]ski)\\s+kod",
  "(?:do[gğ]rulama|g[uü]venlik|giri[sş]|onay)\\s+kod\\p{L}*",
  "kodunuz",
  "код\\s+(?:подтверждения|проверки|безопасности|доступа|для\\s+входа|верификации)",
  "(?:ваш|твой)\\s+код",
  "одноразов\\p{L}*\\s+(?:код|пароль)",
  "(?:رمز|كود)\\s+(?:التحقق|التأكيد|الأمان|الدخول|التفعيل)",
  "(?:सत्यापन|ओटीपी)\\s*कोड",
  "ओटीपी",
];

const STRONG_BARE = [
  "验证码",
  "驗證碼",
  "校验码",
  "校驗碼",
  "动态码",
  "确认码",
  "確認碼",
  "安全码",
  "登录码",
  "認証コード",
  "確認コード",
  "ワンタイムパスワード",
  "セキュリティコード",
  "ログインコード",
  "認証番号",
  "確認番号",
  "인증\\s?번호",
  "인증\\s?코드",
  "확인\\s?코드",
  "보안\\s?코드",
  "일회용\\s?비밀번호",
];

const WEAK_BOUNDED = [
  "codes?",
  "v[eé]rif\\p{L}*",
  "sign(?:ing)?[- ]?in",
  "log(?:ging)?[- ]?in",
  "logon",
  "auth\\p{L}*",
  "confirm\\p{L}*",
  "pin",
  "kod\\p{L}*",
  "c[oó]digo",
  "codice",
  "код\\p{L}{0,3}",
  "best[äa]tig\\p{L}*",
  "anmeld\\p{L}*",
  "connexion",
  "acceso",
  "accesso",
  "weryfik\\p{L}*",
  "do[gğ]rula\\p{L}*",
  "подтвер\\p{L}*",
];

const WEAK_BARE = ["コード", "코드", "رمز", "कोड"];

const BLOCKING_WORDS = [
  "orders?",
  "tracking",
  "track",
  "invoice",
  "receipt",
  "shipment",
  "parcel",
  "package",
  "ref",
  "reference",
  "case",
  "ticket",
  "booking",
  "reservation",
  "flight",
  "tel",
  "phone",
  "telephone",
  "mobile",
  "fax",
  "call",
  "ring",
  "id",
  "ip",
  "version",
  "build",
  "release",
  "patch",
  "zip",
  "postal",
  "postcode",
  "error",
  "status",
  "line",
  "lines",
  "commit",
  "pr",
  "issue",
  "port",
  "pid",
  "job",
  "pipeline",
  "room",
  "step",
  "page",
  "section",
  "chapter",
  "account",
  "customer",
  "member",
  "membership",
  "transaction",
  "box",
  "store",
  "item",
  "sku",
  "model",
  "serial",
  "fingerprint",
  "hash",
  "key",
  "number",
  "no",
  "nr",
  "num",
  "nummer",
  "número",
  "numéro",
  "numero",
  "pedido",
  "commande",
  "ordine",
  "bestellung",
  "sendung",
  "rechnung",
  "factura",
  "facture",
  "fattura",
  "заказа?",
  "номер",
];

const BLOCKING_BARE = ["订单", "注文", "快递"];

const CODE_QUALIFIERS = new Set([
  "promo",
  "promotional",
  "discount",
  "coupon",
  "voucher",
  "referral",
  "gift",
  "invite",
  "invitation",
  "postal",
  "zip",
  "area",
  "country",
  "post",
  "bar",
  "qr",
  "source",
  "error",
  "status",
  "exit",
  "http",
  "dress",
  "tracking",
  "product",
  "color",
  "colour",
  "region",
  "airport",
  "swift",
  "sort",
  "booking",
  "order",
  "reservation",
  "flight",
  "ticket",
  "rabatt",
  "gutschein",
  "aktions",
  "fehler",
  "réduction",
  "descuento",
  "sconto",
  "regalo",
  "pedido",
  "commande",
  "ordine",
  "postleitzahl",
]);

const CODE_FOLLOWERS = new Set([
  "review",
  "reviews",
  "block",
  "blocks",
  "base",
  "snippet",
  "path",
  "paths",
  "change",
  "changes",
  "quality",
  "owner",
  "owners",
  "of",
  "editor",
  "sample",
  "samples",
  "coverage",
  "style",
  "freeze",
  "smell",
]);

const BEFORE_REJECT = [
  /[$€£¥₹₽₩#+/\\@=_&?%~^*|]$/u,
  /[$€£¥₹₽₩]\s$/u,
  /[0-9][ \-./:,]$/u,
  /\)\s?$/u,
  /(?:^|[^\p{L}])(?:usd|eur|gbp|chf|jpy|inr|cad|aud|rs\.?|r\$)\s?$/iu,
];

const AFTER_REJECT = [
  /^[.,:/][\p{L}\p{N}]/u,
  /^[ -][0-9]/u,
  /^-[\p{L}\p{N}]/u,
  /^[@%$€£¥₹₽₩_=/&]/u,
  /^\s?(?:%|[$€£¥₹₽₩]|[ap]\.?m\.?(?!\p{L})|utc|gmt|cet|cest|est|edt|pst|pdt|mins?(?!\p{L})|minutes|hours?|hrs?|secs?(?!\p{L})|seconds|days?(?!\p{L})|weeks?|months?|years?|[kmgt]b(?!\p{L})|kg(?!\p{L})|km(?!\p{L})|px(?!\p{L})|points?|coins?|credits?|users?|people|times|items?|messages|emails)(?!\p{L})/iu,
  /^\s?(?:usd|eur|gbp|chf|jpy|inr|cad|aud|dollars?|euros?)(?!\p{L})/iu,
];

interface Span {
  start: number;
  end: number;
}

interface Candidate extends Span {
  value: string;
}

interface Link {
  distance: number;
  words: number;
}

function bounded_pattern(words: string[], bare: string[]): RegExp {
  const parts = [`${BOUNDED_START}(?:${words.join("|")})${BOUNDED_END}`];

  if (bare.length > 0) parts.push(`(?:${bare.join("|")})`);

  return new RegExp(parts.join("|"), "giu");
}

const STRONG_PATTERN = bounded_pattern(STRONG_BOUNDED, STRONG_BARE);
const WEAK_PATTERN = bounded_pattern(WEAK_BOUNDED, WEAK_BARE);
const BLOCKING_PATTERN = bounded_pattern(BLOCKING_WORDS, BLOCKING_BARE);

function find_spans(text: string, pattern: RegExp): Span[] {
  const spans: Span[] = [];

  pattern.lastIndex = 0;
  let match = pattern.exec(text);

  while (match) {
    spans.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) pattern.lastIndex += 1;
    match = pattern.exec(text);
  }

  return spans;
}

function count_matches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;

  while (pattern.exec(text)) count += 1;

  return count;
}

function word_before(text: string, index: number): string {
  let cursor = index - 1;

  while (cursor >= 0 && !LETTER.test(text[cursor])) {
    if (text[cursor] === "\n") return "";
    cursor -= 1;
  }

  const end = cursor + 1;

  while (cursor >= 0 && LETTER.test(text[cursor])) cursor -= 1;

  return text.slice(cursor + 1, end).toLowerCase();
}

function word_after(text: string, index: number): string {
  let cursor = index;

  while (cursor < text.length && !LETTER.test(text[cursor])) {
    if (text[cursor] === "\n") return "";
    cursor += 1;
  }

  const start = cursor;

  while (cursor < text.length && LETTER.test(text[cursor])) cursor += 1;

  return text.slice(start, cursor).toLowerCase();
}

function is_qualified(text: string, span: Span): boolean {
  if (CODE_QUALIFIERS.has(word_before(text, span.start))) return true;

  const inner =
    text.slice(span.start, span.end).toLowerCase().match(WORD) ?? [];

  if (inner.some((word) => CODE_QUALIFIERS.has(word))) return true;

  return CODE_FOLLOWERS.has(word_after(text, span.end));
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

function cut_quoted(body: string): string {
  let cut = body.length;

  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(body);

    if (match && match.index < cut) cut = match.index;
  }

  return body.slice(0, cut);
}

function strip_segments(text: string): string {
  let result = text;

  for (const pattern of STRIPPED_SEGMENTS) {
    result = result.replace(pattern, " ");
  }

  return result;
}

function sender_is_automated(sender: string | null | undefined): boolean {
  if (!sender) return false;

  const bracket = /<([^<>]+)>\s*$/u.exec(sender);
  const address = (bracket ? bracket[1] : sender).trim();
  const at = address.lastIndexOf("@");

  if (at <= 0) return false;

  return AUTOMATED_LOCAL_PART.test(address.slice(0, at));
}

function is_technical(text: string): boolean {
  let total = 0;

  for (const pattern of TECHNICAL_MARKERS) {
    total += count_matches(text, pattern);
    if (total >= TECHNICAL_MARKER_LIMIT) return true;
  }

  return false;
}

function is_bounded(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";

  return !BOUNDARY_CHAR.test(before) && !BOUNDARY_CHAR.test(after);
}

function is_time_pair(first: string, second: string): boolean {
  if (first.length !== 4 || second.length !== 4) return false;
  if (!DIGITS.test(first) || !DIGITS.test(second)) return false;

  return [first, second].every(
    (value) =>
      Number(value.slice(0, 2)) <= 23 && Number(value.slice(2, 4)) <= 59,
  );
}

function is_plausible_code(value: string): boolean {
  if (value.length < MIN_CODE_LENGTH || value.length > MAX_CODE_LENGTH) {
    return false;
  }
  if (!CODE_CHARS.test(value) || !HAS_DIGIT.test(value)) return false;
  if (UNIT_SUFFIX.test(value)) return false;
  if (HAS_LETTER.test(value) && value.length >= 7 && HEX_ONLY.test(value)) {
    return false;
  }
  if (DIGITS.test(value) && value.length === 4) {
    const year = Number(value);

    if (year >= 1900 && year <= 2099) return false;
  }

  return true;
}

function hyphen_prefix_allowed(text: string, hyphen: number): boolean {
  let cursor = hyphen - 1;

  while (cursor >= 0 && LETTER.test(text[cursor])) cursor -= 1;

  const word = text.slice(cursor + 1, hyphen);

  if (cursor >= 0 && BOUNDARY_CHAR.test(text[cursor])) return false;
  if (UPPER_ASCII.test(word)) return true;

  return /^(?:pin|otp|code|tan|kod|код)$/iu.test(word);
}

function colon_prefix_allowed(text: string, colon: number): boolean {
  let cursor = colon - 1;

  while (cursor >= 0 && !SPACE.test(text[cursor])) cursor -= 1;

  return !PATH_LIKE.test(text.slice(cursor + 1, colon));
}

function has_clean_context(text: string, span: Span): boolean {
  const previous = span.start > 0 ? text[span.start - 1] : "";

  if (previous === "-" && !hyphen_prefix_allowed(text, span.start - 1)) {
    return false;
  }
  if (previous === ".") return false;
  if (
    (previous === ":" || previous === "：") &&
    !colon_prefix_allowed(text, span.start - 1)
  ) {
    return false;
  }

  const before = text.slice(Math.max(0, span.start - 8), span.start);
  const after = text.slice(span.end, span.end + 12);

  if (previous !== "-" && BEFORE_REJECT.some((p) => p.test(before))) {
    return false;
  }
  if (AFTER_REJECT.some((pattern) => pattern.test(after))) return false;

  return true;
}

function can_join(first: string, second: string, separator: string): boolean {
  if (separator !== " " && separator !== "-") return false;
  if (first.length < MIN_GROUP_LENGTH || second.length < MIN_GROUP_LENGTH) {
    return false;
  }
  if (first.length > MAX_GROUP_LENGTH || second.length > MAX_GROUP_LENGTH) {
    return false;
  }
  if (Math.abs(first.length - second.length) > 1) return false;
  if (!CODE_CHARS.test(first) || !CODE_CHARS.test(second)) return false;
  if (INTENT_PREFIX.test(first)) return false;
  if (
    separator === " " &&
    (!HAS_DIGIT.test(first) || !HAS_DIGIT.test(second))
  ) {
    return false;
  }
  if (is_time_pair(first, second)) return false;

  return HAS_DIGIT.test(first) || HAS_DIGIT.test(second);
}

function collect_tokens(text: string): Span[] {
  const tokens: Span[] = [];

  CODE_TOKEN.lastIndex = 0;
  let match = CODE_TOKEN.exec(text);

  while (match) {
    tokens.push({ start: match.index, end: match.index + match[0].length });
    match = CODE_TOKEN.exec(text);
  }

  return tokens;
}

function collect_candidates(text: string): Candidate[] {
  const tokens = collect_tokens(text).filter((token) =>
    is_bounded(text, token.start, token.end),
  );
  const candidates: Candidate[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = text.slice(token.start, token.end);
    const next = tokens[index + 1];

    if (next && next.start === token.end + 1) {
      const next_value = text.slice(next.start, next.end);
      const joined: Candidate = {
        start: token.start,
        end: next.end,
        value: value + next_value,
      };

      if (
        can_join(value, next_value, text[token.end]) &&
        is_plausible_code(joined.value) &&
        has_clean_context(text, joined)
      ) {
        candidates.push(joined);
        index += 1;
        continue;
      }
    }

    if (is_plausible_code(value) && has_clean_context(text, token)) {
      candidates.push({ ...token, value });
    }
  }

  return candidates;
}

function link_to(text: string, candidate: Span, spans: Span[]): Link | null {
  let best: Link | null = null;

  for (const span of spans) {
    if (overlaps(span, candidate)) continue;

    const gap =
      span.end <= candidate.start
        ? text.slice(span.end, candidate.start)
        : text.slice(candidate.end, span.start);

    if (HAS_DIGIT.test(gap) || SENTENCE_BREAK.test(gap)) continue;

    WORD.lastIndex = 0;
    const words = gap.match(WORD)?.length ?? 0;

    if (words > MAX_GAP_WORDS) continue;
    if (!best || gap.length < best.distance) {
      best = { distance: gap.length, words };
    }
  }

  return best;
}

function opens_later_sentence(
  text: string,
  body_start: number,
  position: number,
): boolean {
  if (position < body_start) return false;

  return SENTENCE_BREAK.test(text.slice(body_start, position));
}

function nearest_blocking(candidate: Span, spans: Span[]): number {
  let nearest = Infinity;

  for (const span of spans) {
    if (overlaps(span, candidate)) return -1;

    const distance =
      span.end <= candidate.start
        ? candidate.start - span.end
        : span.start - candidate.end;

    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

export function detect_verification_code(
  subject: string | null | undefined,
  body: string | null | undefined,
  sender?: string | null,
): string | null {
  const raw_subject = (subject ?? "").slice(0, MAX_SCAN_LENGTH);
  const raw_body = (body ?? "").slice(0, MAX_SCAN_LENGTH);
  const is_reply = REPLY_PREFIX.test(raw_subject);
  const clean_subject = strip_segments(
    raw_subject.replace(REPLY_PREFIX, ""),
  ).trim();
  const clean_body = strip_segments(cut_quoted(raw_body)).trim();
  const text = [clean_subject, clean_body]
    .filter((part) => part.length > 0)
    .join("\n");

  if (!text) return null;
  if (PROMOTION_PATTERN.test(text)) return null;
  if (is_technical(`${raw_subject}\n${raw_body}`)) return null;

  const human_reply = is_reply && !sender_is_automated(sender);
  const long_body = clean_body.length > LONG_BODY_LENGTH;
  const blocking = find_spans(text, BLOCKING_PATTERN);
  const strong: Span[] = [];
  const weak: Span[] = [];

  for (const span of find_spans(text, STRONG_PATTERN)) {
    if (is_qualified(text, span)) blocking.push(span);
    else strong.push(span);
  }
  for (const span of find_spans(text, WEAK_PATTERN)) {
    if (is_qualified(text, span)) blocking.push(span);
    else if (!blocking.some((block) => overlaps(block, span))) weak.push(span);
  }

  if (strong.length === 0 && weak.length === 0) return null;

  const body_start = clean_subject.length > 0 ? clean_subject.length + 1 : 0;
  let best: { value: string; score: number } | null = null;

  for (const candidate of collect_candidates(text)) {
    const strong_link = link_to(text, candidate, strong);
    const weak_link = link_to(text, candidate, weak);
    let distance: number | null = null;
    let score = 0;

    if (human_reply) {
      if (
        !long_body &&
        !opens_later_sentence(text, body_start, candidate.start) &&
        strong_link &&
        strong_link.distance <= DIRECT_DISTANCE &&
        strong_link.words <= 1
      ) {
        distance = strong_link.distance;
        score = distance;
      }
    } else if (strong_link && strong_link.distance <= STRONG_DISTANCE) {
      distance = strong_link.distance;
      score = distance;
    } else if (!long_body && weak_link && weak_link.distance <= WEAK_DISTANCE) {
      distance = weak_link.distance;
      score = STRONG_DISTANCE + distance;
    }

    if (distance === null) continue;

    const blocking_distance = nearest_blocking(candidate, blocking);

    if (blocking_distance < 0) continue;
    if (
      blocking_distance <= distance &&
      blocking_distance <= BLOCKING_DISTANCE
    ) {
      continue;
    }
    if (!best || score < best.score) best = { value: candidate.value, score };
  }

  return best ? best.value : null;
}
