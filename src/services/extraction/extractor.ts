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
import type {
  EmailExtractionResult,
  ExtractedPurchaseDetails,
  ExtractedShippingDetails,
  ExtractedAmount,
  ExtractedItem,
  ShippingCarrier,
  ShippingStatus,
} from "./types";

import { CARRIER_TRACKING_URLS, CARRIER_NAMES } from "./types";

import { get_active_translations } from "@/lib/i18n/translations";
import { app_locale } from "@/utils/date_format";
import {
  html_to_readable_plain_text,
  is_html_content,
} from "@/lib/html_sanitizer";

const BASIC_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decode_basic_entities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
    (entity) => BASIC_ENTITIES[entity] ?? entity,
  );
}

function extraction_source(text: string, html?: string): string {
  return text && text.trim() ? text : (html ?? "");
}

export function extraction_needs_markup_parse(
  text: string,
  html?: string,
): boolean {
  const source = extraction_source(text, html);

  return source !== "" && is_html_content(source);
}

const MAX_EXTRACTION_CHARS = 60_000;

function normalize_email_text(text: string, html?: string): string {
  const source = extraction_source(text, html);

  if (!source) return "";

  const bounded = source.slice(0, MAX_EXTRACTION_CHARS * 4);
  const readable = is_html_content(bounded)
    ? html_to_readable_plain_text(bounded)
    : decode_basic_entities(bounded);

  return readable.slice(0, MAX_EXTRACTION_CHARS);
}

function clean_text_field(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  if (!trimmed) return null;
  if (/[<>]/.test(trimmed)) return null;
  if (/&#?[a-z0-9]+;/i.test(trimmed)) return null;

  return trimmed;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  C$: "CAD",
  A$: "AUD",
  R$: "BRL",
};

const CURRENCY_TO_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
  CAD: "C$",
  AUD: "A$",
  BRL: "R$",
};

function currency_symbol(currency: string): string {
  return CURRENCY_TO_SYMBOL[currency] ?? currency;
}

function format_amount(value: number, currency: string): string {
  const locale = app_locale();

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    const digits = value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `${currency_symbol(currency)}${digits}`;
  }
}

function escape_regex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ID_MARKER = "(?:#|no\\.?|num(?:ber)?|id)";
const ID_VALUE = "([A-Za-z0-9](?:[\\w-]|\\.(?=[\\w-])){3,29})";

function labelled_id(label: string, marker = ID_MARKER): RegExp {
  return new RegExp(`\\b${label}\\s*${marker}\\s*[:#]?\\s*${ID_VALUE}`, "i");
}

const ORDER_ID_PATTERNS = [
  /\border[:\s]+([0-9]{3}-[0-9]{7}-[0-9]{7})\b/i,
  labelled_id("order"),
  new RegExp(`\\border\\s*[:#]\\s*${ID_VALUE}`, "i"),
  labelled_id("confirmation", "(?:#|no\\.?|num(?:ber)?|code)"),
  labelled_id("invoice"),
  labelled_id("receipt"),
  labelled_id("transaction"),
];

const CONFIRMATION_NUMBER_PATTERN = labelled_id(
  "confirmation",
  "(?:#|no\\.?|num(?:ber)?|code)",
);

const TRANSACTION_ID_PATTERN = labelled_id("transaction");

const CURRENCY_TOKEN = "C\\$|A\\$|R\\$|[$€£¥₹]|USD|EUR|GBP|JPY|INR|CAD|AUD|CHF";

const NUMBER_TOKEN = "[0-9][0-9,]*(?:\\.[0-9]{1,2})?(?![0-9])";

const MONEY_TOKEN = `(?:(?:${CURRENCY_TOKEN})\\s*)?(?:${NUMBER_TOKEN})(?:\\s*(?:${CURRENCY_TOKEN}))?`;

const AMOUNT_PATTERN = new RegExp(
  `(${CURRENCY_TOKEN})?\\s*(${NUMBER_TOKEN})\\s*(${CURRENCY_TOKEN})?`,
);

const TAX_RATE = "(?:\\s*\\(?\\d{1,2}(?:[.,]\\d+)?\\s*%\\)?)?";

function money_after(label: string): RegExp {
  return new RegExp(`${label}\\s*[:=-]?\\s*-?\\s*(${MONEY_TOKEN})`, "i");
}

const STRONG_TRACKING_PATTERNS: {
  carrier: ShippingCarrier;
  patterns: RegExp[];
}[] = [
  { carrier: "ups", patterns: [/\b(1Z[A-Z0-9]{16})\b/i] },
  { carrier: "fedex", patterns: [/\b(96\d{20})\b/, /\b(DT\d{12})\b/i] },
  {
    carrier: "usps",
    patterns: [
      /\b(94\d{20,22})\b/,
      /\b(92\d{20,22})\b/,
      /\b(93\d{20,22})\b/,
      /\b(420\d{27,31})\b/,
      /\b([A-Z]{2}\d{9}US)\b/i,
    ],
  },
  { carrier: "dhl", patterns: [/\b(JD\d{18})\b/i] },
  { carrier: "amazon", patterns: [/\b(TBA\d{12,15})\b/i] },
];

const WEAK_TRACKING_PATTERNS: Partial<Record<ShippingCarrier, RegExp[]>> = {
  ups: [/\b(T\d{10})\b/, /\b(\d{18})\b/],
  fedex: [/\b(\d{15})\b/, /\b(\d{12,22})\b/],
  dhl: [/\b([A-Z]{3}\d{7})\b/i, /\b(\d{10,11})\b/],
};

const TRACKING_CONTEXT_KEYWORDS =
  /(tracking\s*(?:number|no|#)|track\s+your|sendungsnummer|numero?\s+de\s+(?:suivi|seguimiento)|suivi|seguimiento|waybill|consignment)/gi;

const CARRIER_DOMAIN_MAP: Record<string, ShippingCarrier> = {
  "ups.com": "ups",
  "fedex.com": "fedex",
  "usps.com": "usps",
  "dhl.com": "dhl",
  "amazon.com": "amazon",
  "ontrac.com": "ontrac",
  "lasership.com": "lasership",
};

const CARRIER_NAME_MAP: Record<string, ShippingCarrier> = {
  ups: "ups",
  "united parcel service": "ups",
  fedex: "fedex",
  "federal express": "fedex",
  usps: "usps",
  "united states postal service": "usps",
  dhl: "dhl",
  amazon: "amazon",
  "amazon logistics": "amazon",
  ontrac: "ontrac",
  lasership: "lasership",
};

function parse_amount(
  text: string,
  fallback_currency = "USD",
): ExtractedAmount | null {
  const match = text.match(AMOUNT_PATTERN);

  if (!match) return null;

  const [, prefix_symbol, value_str, suffix_symbol] = match;
  const symbol = (prefix_symbol || suffix_symbol || "").toUpperCase();
  const currency = symbol
    ? (CURRENCY_SYMBOLS[symbol] ?? symbol)
    : fallback_currency;
  const value = parseFloat(value_str.replace(/,/g, ""));

  if (isNaN(value)) return null;

  return {
    value,
    currency,
    formatted: format_amount(value, currency),
  };
}

function clean_identifier(value: string | undefined): string | null {
  const cleaned = clean_text_field(value);

  if (!cleaned) return null;

  const trimmed = cleaned.replace(/[.,;:]+$/, "");

  if (!/[0-9]/.test(trimmed)) return null;

  return trimmed || null;
}

interface PurchaseAmounts {
  subtotal: ExtractedAmount | null;
  tax: ExtractedAmount | null;
  shipping_cost: ExtractedAmount | null;
  discount: ExtractedAmount | null;
  total: ExtractedAmount | null;
}

function reconcile_amounts(amounts: PurchaseAmounts): PurchaseAmounts {
  const { subtotal, tax, shipping_cost, discount, total } = amounts;

  if (!total || !subtotal) return amounts;

  const tolerance = Math.max(0.02, total.value * 0.005);
  const charges =
    subtotal.value + (tax?.value ?? 0) + (shipping_cost?.value ?? 0);

  if (discount) {
    if (Math.abs(charges - discount.value - total.value) <= tolerance) {
      return amounts;
    }

    if (Math.abs(charges - total.value) <= tolerance) {
      return { ...amounts, discount: null };
    }
  }

  if (charges - (discount?.value ?? 0) > total.value + tolerance) {
    return {
      subtotal: null,
      tax: null,
      shipping_cost: null,
      discount: null,
      total,
    };
  }

  return amounts;
}

function detect_dominant_currency(text: string): string {
  const matches = text.match(new RegExp(CURRENCY_TOKEN, "gi"));

  if (!matches) return "USD";

  const counts = new Map<string, number>();

  for (const raw of matches) {
    const symbol = raw.toUpperCase();
    const currency = CURRENCY_SYMBOLS[symbol] ?? symbol;

    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }

  let winner = "USD";
  let best = 0;

  for (const [currency, count] of counts) {
    if (count > best) {
      winner = currency;
      best = count;
    }
  }

  return winner;
}

function extract_amount_from_line(
  text: string,
  patterns: RegExp[],
  fallback_currency = "USD",
): ExtractedAmount | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      const amount_str = match[1] || match[0];

      return parse_amount(amount_str, fallback_currency);
    }
  }

  return null;
}

function detect_carrier_from_email(
  from_email: string,
  subject: string,
  body: string,
): ShippingCarrier | null {
  const from_lower = from_email.toLowerCase();

  for (const [domain, carrier] of Object.entries(CARRIER_DOMAIN_MAP)) {
    if (from_lower.includes(domain)) {
      return carrier;
    }
  }

  const combined = `${subject} ${body}`.toLowerCase();

  for (const [name, carrier] of Object.entries(CARRIER_NAME_MAP)) {
    const boundary = new RegExp(`\\b${escape_regex(name)}\\b`);

    if (boundary.test(combined)) {
      return carrier;
    }
  }

  return null;
}

function match_first_pattern(patterns: RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

function strong_patterns_for(carrier: ShippingCarrier): RegExp[] {
  return (
    STRONG_TRACKING_PATTERNS.find((p) => p.carrier === carrier)?.patterns ?? []
  );
}

function tracking_context_windows(body: string): string[] {
  const windows: string[] = [];

  TRACKING_CONTEXT_KEYWORDS.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = TRACKING_CONTEXT_KEYWORDS.exec(body)) !== null) {
    windows.push(body.slice(match.index, match.index + 140));

    if (windows.length >= 25) break;
  }

  return windows;
}

function extract_tracking_number(
  body: string,
  carrier: ShippingCarrier | null,
  tracking_url: string | null,
): { number: string; carrier: ShippingCarrier } | null {
  if (tracking_url) {
    if (carrier) {
      const from_url = match_first_pattern(
        strong_patterns_for(carrier),
        tracking_url,
      );

      if (from_url) return { number: from_url, carrier };
    }

    for (const { carrier: c, patterns } of STRONG_TRACKING_PATTERNS) {
      const from_url = match_first_pattern(patterns, tracking_url);

      if (from_url) return { number: from_url, carrier: c };
    }
  }

  if (carrier) {
    const own_strong = match_first_pattern(strong_patterns_for(carrier), body);

    if (own_strong) return { number: own_strong, carrier };
  }

  for (const { carrier: c, patterns } of STRONG_TRACKING_PATTERNS) {
    const cross_strong = match_first_pattern(patterns, body);

    if (cross_strong) return { number: cross_strong, carrier: c };
  }

  if (carrier) {
    const weak = WEAK_TRACKING_PATTERNS[carrier];

    if (weak) {
      for (const window of tracking_context_windows(body)) {
        const weak_match = match_first_pattern(weak, window);

        if (weak_match) return { number: weak_match, carrier };
      }
    }
  }

  const generic_pattern =
    /(?:tracking|sendungsnummer|suivi|seguimiento)\s*(?:#|number|no\.?|nummer)?\s*[:\s]\s*([A-Z0-9]{8,35})/i;
  const generic = body.match(generic_pattern);

  if (generic) {
    return { number: generic[1], carrier: carrier ?? "other" };
  }

  return null;
}

const MAX_ANCHOR_SCAN_CHARS = MAX_EXTRACTION_CHARS * 4;
const ANCHOR_OPEN_PATTERN = /<a(?![A-Za-z0-9_])/gi;
const ANCHOR_HREF_HEAD_PATTERN = /href\s*=\s*["']([^"']+)["']/iy;
const WORD_CHAR_PATTERN = /[A-Za-z0-9_]/;

interface AnchorMatch {
  href: string;
  text: string;
}

interface AnchorScanOptions {
  href_word_boundary: boolean;
  with_text: boolean;
}

function create_position_finder(
  text: string,
  pattern: RegExp,
): (position: number) => number {
  let cached_from = -1;
  let cached_at = -1;

  return (position) => {
    if (
      cached_from >= 0 &&
      position >= cached_from &&
      (cached_at < 0 || position <= cached_at)
    ) {
      return cached_at;
    }

    pattern.lastIndex = position;
    const match = pattern.exec(text);

    cached_from = position;
    cached_at = match ? match.index : -1;

    return cached_at;
  };
}

function scan_anchors(html: string, options: AnchorScanOptions): AnchorMatch[] {
  const text = html.slice(0, MAX_ANCHOR_SCAN_CHARS);
  const next_tag_end = create_position_finder(text, />/g);
  const next_href = create_position_finder(text, /href/gi);
  const next_close = create_position_finder(text, /<\/a>/gi);
  const opener = new RegExp(ANCHOR_OPEN_PATTERN.source, "gi");
  const head = new RegExp(ANCHOR_HREF_HEAD_PATTERN.source, "iy");
  const anchors: AnchorMatch[] = [];
  let failed_window_end = -2;
  let opening: RegExpExecArray | null;

  while ((opening = opener.exec(text)) !== null) {
    const attributes_start = opening.index + 2;
    const found_tag_end = next_tag_end(attributes_start);
    const window_end = found_tag_end < 0 ? text.length : found_tag_end;

    if (window_end === failed_window_end) continue;

    let href_at = next_href(attributes_start);
    let head_match: RegExpExecArray | null = null;

    while (href_at >= 0 && href_at < window_end) {
      if (
        !options.href_word_boundary ||
        !WORD_CHAR_PATTERN.test(text[href_at - 1] ?? "")
      ) {
        head.lastIndex = href_at;
        head_match = head.exec(text);
        if (head_match) break;
      }
      href_at = next_href(href_at + 1);
    }

    if (!head_match) {
      failed_window_end = window_end;
      continue;
    }

    const head_end = head.lastIndex;

    if (!options.with_text) {
      anchors.push({ href: head_match[1], text: "" });
      opener.lastIndex = head_end;
      continue;
    }

    const tag_end = next_tag_end(head_end);

    if (tag_end < 0) break;

    const close_at = next_close(tag_end + 1);

    if (close_at < 0) break;

    anchors.push({
      href: head_match[1],
      text: text.slice(tag_end + 1, close_at),
    });
    opener.lastIndex = close_at + 4;
  }

  return anchors;
}

function strip_anchor_markup(value: string): string {
  let output = "";
  let cursor = 0;
  let open_at = value.indexOf("<");

  while (open_at >= 0) {
    const close_at = value.indexOf(">", open_at + 1);

    if (close_at < 0) break;
    if (close_at === open_at + 1) {
      open_at = value.indexOf("<", open_at + 1);
      continue;
    }

    output += `${value.slice(cursor, open_at)} `;
    cursor = close_at + 1;
    open_at = value.indexOf("<", cursor);
  }

  return output + value.slice(cursor);
}

function extract_tracking_url(
  body: string,
  html: string | undefined,
): string | null {
  const url_patterns = [
    /^https?:\/\/[^\s<>"]+track/i,
    /^https?:\/\/[^\s<>"]+shipment/i,
    /^https?:\/\/[^\s<>"]+delivery/i,
  ];

  const link_urls = html
    ? scan_anchors(html, { href_word_boundary: true, with_text: false }).map(
        (anchor) => decode_basic_entities(anchor.href.trim()),
      )
    : [];
  const text_urls = (body.match(/https?:\/\/[^\s<>"]+/gi) ?? []).map((url) =>
    url.replace(/['">\]]+$/, ""),
  );

  for (const candidates of [link_urls, text_urls]) {
    for (const pattern of url_patterns) {
      const url = candidates.find((candidate) => pattern.test(candidate));

      if (url) return url;
    }
  }

  return null;
}

function detect_shipping_status(subject: string, body: string): ShippingStatus {
  const subj = subject.toLowerCase();
  const combined = `${subject} ${body}`.toLowerCase();

  const future_deliver =
    /\b(?:will be|to be|expected|estimated|scheduled|being)\s+deliver/;
  const strong_past_deliver =
    /\b(?:was|has been|have been|been|successfully)\s+delivered\b/;
  const delivered_on = /\bdelivered\s+(?:on|to|at)\b/;

  if (
    combined.includes("out for delivery") ||
    combined.includes("arriving today")
  ) {
    return "out_for_delivery";
  }

  if (
    /\b(?:delivery exception|delivery attempt|could not be delivered|unable to deliver|delivery failed)\b/.test(
      combined,
    )
  ) {
    return "exception";
  }

  if (
    strong_past_deliver.test(combined) ||
    (delivered_on.test(combined) && !future_deliver.test(combined)) ||
    (subj.includes("delivered") && !future_deliver.test(subj))
  ) {
    return "delivered";
  }

  if (
    combined.includes("in transit") ||
    combined.includes("on the way") ||
    combined.includes("on its way") ||
    combined.includes("en route")
  ) {
    return "in_transit";
  }

  if (
    combined.includes("label created") ||
    combined.includes("shipping label") ||
    combined.includes("preparing to ship")
  ) {
    return "label_created";
  }

  if (
    combined.includes("has shipped") ||
    combined.includes("have shipped") ||
    combined.includes("was shipped") ||
    combined.includes("order has been shipped") ||
    combined.includes("shipped")
  ) {
    return "shipped";
  }

  return "unknown";
}

function extract_date(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1] || match[0];
    }
  }

  return null;
}

function extract_items_from_body(
  body: string,
  fallback_currency = "USD",
): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  const item_patterns = [
    /(\d+)\s*x\s+([^\n]{1,160}?)\s*[-–]\s*([\$€£¥₹]?\s*[\d,.]+)/gi,
    /([^\n]{1,160}?)\s*\(Qty:\s*(\d+)\)\s*([\$€£¥₹]?\s*[\d,.]+)/gi,
    /Item:\s*([^\n]{1,160}?)(?:\s*Qty:\s*(\d+))?\s*Price:\s*([\$€£¥₹]?\s*[\d,.]+)/gi,
    /(?:^|\n)[ \t]*([^\n$€£¥₹]{2,160}?)\s+[×x]\s*(\d{1,3})\s+([\$€£¥₹]\s*[\d,.]+)[ \t]*(?=\n|$)/gi,
  ];

  const summary_word =
    /\b(?:sub\s?total|total|amount|tax|vat|shipping|discount)\b/i;

  for (const pattern of item_patterns) {
    let match;

    while ((match = pattern.exec(body)) !== null) {
      const [, qty_or_name, name_or_qty, price_str] = match;
      const is_qty_first = /^\d+$/.test((qty_or_name ?? "").trim());

      const item_name = clean_text_field(
        is_qty_first ? name_or_qty : qty_or_name,
      );
      const quantity = is_qty_first
        ? parseInt(qty_or_name, 10)
        : parseInt(name_or_qty ?? "", 10) || 1;
      const unit_price = parse_amount(price_str, fallback_currency);

      if (
        item_name &&
        item_name.length > 2 &&
        item_name.length < 200 &&
        !summary_word.test(item_name)
      ) {
        items.push({
          name: item_name,
          quantity,
          unit_price,
          total_price: unit_price
            ? {
                ...unit_price,
                value: unit_price.value * quantity,
                formatted: format_amount(
                  unit_price.value * quantity,
                  unit_price.currency,
                ),
              }
            : null,
        });
      }
    }
  }

  return items;
}

const PAYMENT_PROCESSOR_DOMAINS = [
  "stripe.com",
  "paypal.com",
  "paypal.de",
  "squareup.com",
  "square.com",
  "shopify.com",
  "shopifyemail.com",
  "gumroad.com",
  "paddle.com",
  "paddle.net",
  "lemonsqueezy.com",
  "fastspring.com",
  "braintreegateway.com",
  "adyen.com",
  "mollie.com",
  "klarna.com",
  "chargebee.com",
  "recurly.com",
  "2checkout.com",
  "checkout.com",
];

const GENERIC_MERCHANT_WORDS = new Set([
  "order",
  "orders",
  "payment",
  "purchase",
  "receipt",
  "invoice",
  "subscription",
  "online",
  "recent",
  "latest",
  "new",
  "monthly",
  "annual",
  "us",
  "store",
  "shop",
  "the",
  "your",
  "flight",
  "trip",
  "booking",
  "reservation",
  "ticket",
  "tickets",
  "account",
  "membership",
  "renewal",
  "plan",
  "weekly",
  "yearly",
  "daily",
  "first",
  "next",
  "last",
  "this",
  "pending",
]);

const DATE_LIKE_CANDIDATE =
  /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?)(?:,?\s+\d{2,4})?$|^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$|^(?:today|yesterday|tomorrow)$/i;

const MERCHANT_TAIL = "([^\\n#\\[\\(<>@:]{2,60}?)";
const MERCHANT_STOP =
  "(?=\\s*(?:[\\[\\(#:,.!|\\-]|\\bis\\b|\\bhas\\b|\\bfor\\b|\\bon\\b|\\bwas\\b|\\n|$))";

const SUBJECT_MERCHANT_PATTERNS = [
  new RegExp(`\\breceipt\\s+from\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`, "i"),
  new RegExp(
    `\\b(?:order|purchase|invoice|payment)\\s+(?:confirmation\\s+|receipt\\s+)?(?:#?(?=[\\w.-]*\\d)[\\w.-]{3,}\\s+)?(?:from|with|at|to)\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`,
    "i",
  ),
  new RegExp(
    `\\byour\\s+${MERCHANT_TAIL}\\s+(?:receipt|invoice|order\\s+confirmation|order|purchase)\\b`,
    "i",
  ),
  new RegExp(
    `\\bthanks?\\s+(?:you\\s+)?for\\s+(?:your\\s+)?(?:order|purchase|shopping|payment)\\s+(?:from|with|at|to)\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`,
    "i",
  ),
];

const BODY_MERCHANT_PATTERNS = [
  new RegExp(`\\breceipt\\s+from\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`, "i"),
  new RegExp(
    `\\bthanks?\\s+(?:you\\s+)?for\\s+(?:your\\s+)?(?:order|purchase|shopping|payment)\\s+(?:from|with|at|to)\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`,
    "i",
  ),
  new RegExp(
    `\\b(?:order|purchase|invoice|payment)\\s+(?:confirmation\\s+|receipt\\s+)?(?:#?(?=[\\w.-]*\\d)[\\w.-]{3,}\\s+)?(?:from|with|at|to)\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`,
    "i",
  ),
  new RegExp(`\\bsold\\s+by\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`, "i"),
  new RegExp(
    `\\b(?:payment|paid|sent)\\s+(?:of\\s+)?${MONEY_TOKEN}\\s+to\\s+${MERCHANT_TAIL}${MERCHANT_STOP}`,
    "i",
  ),
];

const FORWARDED_FROM_PATTERN =
  /(?:^|\n)[ \t>*]*(?:from|von|de|da|van)\s*:\s*\*{0,2}\s*([^\n<]{0,80}?)\s*<?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>?/i;
const FORWARDED_SUBJECT_PATTERN =
  /(?:^|\n)[ \t>*]*(?:subject|betreff|objet|asunto|assunto|onderwerp)\s*:\s*\*{0,2}\s*([^\n]{1,200})/i;
const FORWARDED_MARKER_PATTERN =
  /(?:^|\n)[ \t>*]*(?:sent|date|datum|envoyé|enviado|to|an|à|para|subject|betreff|objet|asunto|assunto)\s*:/i;
const REPLY_PREFIX_PATTERN = /^(?:\s*(?:re|fw|fwd|aw|wg|tr|rv|enc)\s*:\s*)+/i;

interface ForwardedOrigin {
  from_email: string;
  from_name: string;
  subject: string | null;
}

function strip_reply_prefixes(subject: string): string {
  return subject.replace(REPLY_PREFIX_PATTERN, "").trim();
}

function email_domain(address: string): string | null {
  const at = address.lastIndexOf("@");

  if (at < 0) return null;

  return (
    address
      .slice(at + 1)
      .toLowerCase()
      .replace(/[>\s]+$/, "") || null
  );
}

function is_payment_processor(address: string): boolean {
  const domain = email_domain(address);

  if (!domain) return false;

  return PAYMENT_PROCESSOR_DOMAINS.some(
    (processor) => domain === processor || domain.endsWith(`.${processor}`),
  );
}

const RECEIPT_LINK_HOSTS: { host: string; path: RegExp }[] = [
  { host: "pay.stripe.com", path: /^\/receipts\// },
  { host: "invoice.stripe.com", path: /^\/i\// },
  { host: "squareup.com", path: /^\/receipt\// },
  { host: "paypal.com", path: /^\/(?:activity|myaccount\/transactions)\// },
];
const RECEIPT_LINK_TEXT =
  /^(?:view|download|see|open|print)\s+(?:your\s+|the\s+|my\s+)?(?:receipt|invoice|order)\b/i;
const BARE_HTTPS_URL = /https:\/\/[^\s<>"']+/g;
const MAX_RECEIPT_URL_LENGTH = 2048;

function host_matches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`);
}

function registrable_domain(host: string): string {
  return host.split(".").slice(-2).join(".");
}

function safe_https_url(raw: string): URL | null {
  const candidate = decode_basic_entities(raw.trim());

  if (candidate.length > MAX_RECEIPT_URL_LENGTH) return null;

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password) return null;

  return url;
}

function is_trusted_receipt_url(
  url: URL,
  sender_domains: string[],
  anchor_text: string | null,
): boolean {
  const host = url.hostname.toLowerCase();
  const known_host = RECEIPT_LINK_HOSTS.some(
    (entry) => host_matches(host, entry.host) && entry.path.test(url.pathname),
  );

  if (known_host) return true;
  if (PAYMENT_PROCESSOR_DOMAINS.some((domain) => host_matches(host, domain)))
    return false;
  if (!anchor_text || !RECEIPT_LINK_TEXT.test(anchor_text)) return false;

  return sender_domains.some(
    (domain) => registrable_domain(host) === registrable_domain(domain),
  );
}

function extract_receipt_url(
  body: string,
  html: string | undefined,
  senders: (string | undefined)[],
): string | null {
  const sender_domains = senders
    .map((sender) => (sender ? email_domain(sender) : null))
    .filter((domain): domain is string => Boolean(domain));

  if (html) {
    for (const anchor of scan_anchors(html, {
      href_word_boundary: false,
      with_text: true,
    })) {
      const url = safe_https_url(anchor.href);
      const text = clean_text_field(strip_anchor_markup(anchor.text));

      if (url && is_trusted_receipt_url(url, sender_domains, text))
        return url.href;
    }
  }

  for (const match of body.matchAll(BARE_HTTPS_URL)) {
    const url = safe_https_url(match[0].replace(/[),.;'"\]]+$/, ""));

    if (url && is_trusted_receipt_url(url, sender_domains, null))
      return url.href;
  }

  return null;
}

function detect_forwarded_origin(body: string): ForwardedOrigin | null {
  const from_match = body.match(FORWARDED_FROM_PATTERN);

  if (!from_match || from_match.index === undefined) return null;

  const block = body.slice(from_match.index, from_match.index + 600);

  if (!FORWARDED_MARKER_PATTERN.test(block.slice(from_match[0].length)))
    return null;

  const subject_match = block.match(FORWARDED_SUBJECT_PATTERN);
  const from_name = from_match[1].replace(/^["'“”]+|["'“”]+$/g, "").trim();

  return {
    from_email: from_match[2].toLowerCase(),
    from_name,
    subject: subject_match ? strip_reply_prefixes(subject_match[1]) : null,
  };
}

function tidy_merchant_candidate(raw: string | undefined): string | null {
  if (!raw) return null;

  const tidy = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”*_-]+|[\s"'“”*_.,;:!-]+$/g, "")
    .trim();

  if (tidy.length < 2 || tidy.length > 60) return null;
  if (/https?:|www\.|@|[<>]/i.test(tidy)) return null;
  if (!/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿]/.test(tidy)) return null;

  if (DATE_LIKE_CANDIDATE.test(tidy)) return null;

  const words = tidy.toLowerCase().split(" ");

  if (words.every((word) => GENERIC_MERCHANT_WORDS.has(word))) return null;

  return tidy;
}

function merchant_from_text(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const candidate = tidy_merchant_candidate(text.match(pattern)?.[1]);

    if (candidate) return candidate;
  }

  return null;
}

function merchant_from_sender(
  from_email: string,
  from_name: string,
): string | null {
  const lowered_name = from_name.toLowerCase();

  if (
    from_name &&
    !lowered_name.includes("noreply") &&
    !lowered_name.includes("no-reply") &&
    !from_name.includes("@")
  ) {
    const stripped = from_name
      .replace(
        /(?:\s+(?:order|shipping|notification|update|receipt|billing|payment|team|support)s?)+\s*$/i,
        "",
      )
      .trim();

    return stripped || from_name.trim();
  }

  const domain = email_domain(from_email);

  if (domain) {
    const parts = domain.split(".");

    if (parts.length >= 2) {
      const label = parts[parts.length - 2];

      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  return from_name.trim() || null;
}

interface MerchantResolution {
  name: string;
  source_address: string;
}

function resolve_merchant(
  subject: string,
  body: string,
  from_email: string,
  from_name: string,
  forwarded: ForwardedOrigin | null,
): MerchantResolution {
  const origin_email = forwarded?.from_email ?? from_email.toLowerCase();
  const origin_name = forwarded ? forwarded.from_name : from_name;
  const subjects = [strip_reply_prefixes(subject), forwarded?.subject ?? ""];

  for (const candidate_subject of subjects) {
    const from_subject = merchant_from_text(
      candidate_subject,
      SUBJECT_MERCHANT_PATTERNS,
    );

    if (from_subject)
      return { name: from_subject, source_address: origin_email };
  }

  const from_body = merchant_from_text(
    body.slice(0, 6000),
    BODY_MERCHANT_PATTERNS,
  );

  if (from_body) return { name: from_body, source_address: origin_email };

  const processor = is_payment_processor(origin_email);
  const sender_name = merchant_from_sender(
    origin_email,
    processor ? "" : origin_name,
  );

  return {
    name: sender_name ?? get_active_translations().common.unknown_merchant,
    source_address: origin_email,
  };
}

function detect_document_kind(
  subject: string,
  body: string,
): "receipt" | "order" {
  const head = `${subject}\n${body.slice(0, 1500)}`;

  if (/\border\s*(?:#|no\.?|num(?:ber)?|id)\b/i.test(subject)) return "order";
  if (/\b(?:receipt|invoice|payment|amount\s+paid)\b/i.test(subject))
    return "receipt";
  if (/\border\s*(?:#|no\.?|num(?:ber)?|id|confirm)/i.test(head))
    return "order";
  if (/\b(?:receipt|invoice|amount\s+paid|date\s+paid)\b/i.test(head))
    return "receipt";

  return "order";
}

export function extract_purchase_details(
  subject: string,
  body: string,
  from_email: string,
  from_name: string,
  body_html?: string,
): ExtractedPurchaseDetails {
  const signals: string[] = [];
  const clean_subject = decode_basic_entities(subject);
  const clean_body = normalize_email_text(body);
  const forwarded = detect_forwarded_origin(clean_body);
  const effective_subject =
    forwarded?.subject ?? strip_reply_prefixes(clean_subject);
  const combined = `${effective_subject}\n${clean_body}`;

  if (forwarded) signals.push(`forwarded_from:${forwarded.from_email}`);

  let order_id: string | null = null;

  for (const pattern of ORDER_ID_PATTERNS) {
    const match = combined.match(pattern);
    const candidate = clean_identifier(match?.[1]);

    if (candidate) {
      order_id = candidate;
      signals.push(`order_id:${order_id}`);
      break;
    }
  }

  const currency = detect_dominant_currency(combined);

  const total = extract_amount_from_line(
    combined,
    [
      money_after("grand\\s+total"),
      money_after("order\\s+total"),
      money_after("purchase\\s+total"),
      money_after("total\\s+charged"),
      money_after("amount\\s+(?:paid|charged|due)"),
      money_after("(?<!\\bnet\\s)(?<!\\bsub\\s)(?<!\\bitems?\\s)\\btotals?\\b"),
    ],
    currency,
  );

  if (total) signals.push(`total:${total.formatted}`);

  const subtotal = extract_amount_from_line(
    combined,
    [
      money_after("\\bsub\\s?total\\b"),
      money_after("\\bitems?\\s+total\\b"),
      money_after("\\bnet\\s+total\\b"),
    ],
    currency,
  );

  const tax = extract_amount_from_line(
    combined,
    [
      money_after(`\\b(?:sales\\s+)?tax(?:es)?\\b${TAX_RATE}`),
      money_after(`\\bvat\\b${TAX_RATE}`),
      money_after(`\\bgst\\b${TAX_RATE}`),
    ],
    currency,
  );

  const shipping_cost = extract_amount_from_line(
    combined,
    [
      money_after("\\bshipping(?:\\s*(?:&|and)\\s*handling)?\\b"),
      money_after("\\bdelivery\\s+fee\\b"),
    ],
    currency,
  );

  const discount = extract_amount_from_line(
    combined,
    [
      money_after("\\bdiscounts?\\b"),
      money_after("\\bsavings?\\b"),
      money_after("\\bcoupon\\b"),
      money_after("\\bpromo(?:tion)?\\s*(?:code)?\\s*(?:applied)?"),
    ],
    currency,
  );

  const amounts = reconcile_amounts({
    subtotal,
    tax,
    shipping_cost,
    discount,
    total,
  });

  const card_match =
    combined.match(/(?:card\s+)?ending\s+(?:in\s+|with\s+)?[\*x]?(\d{4})/i) ??
    combined.match(
      /\b(?:visa|mastercard|master\s*card|amex|american\s+express|discover|maestro|jcb|unionpay|card)\b[^\n\d]{0,12}?(?:[•*x·.\-–]\s*){2,}(\d{4})\b/i,
    );
  const card_last_four = card_match ? card_match[1] : null;

  if (card_last_four) signals.push(`card:****${card_last_four}`);

  const payment_match = combined.match(
    /(?:payment\s+method|paid\s+with|charged\s+to)[:\s]*([^\n]+)/i,
  );
  const payment_method = clean_text_field(payment_match?.[1]);

  const date_patterns = [
    /(?:order|purchase|payment)\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:date\s+paid|paid\s+on)[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:ordered|purchased)\s+on[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ];
  const order_date = clean_text_field(extract_date(combined, date_patterns));

  const items = extract_items_from_body(clean_body, currency);

  if (items.length > 0) signals.push(`items:${items.length}`);

  const merchant = resolve_merchant(
    clean_subject,
    clean_body,
    from_email,
    from_name,
    forwarded,
  );
  const merchant_name = clean_text_field(merchant.name);
  const document_kind = detect_document_kind(effective_subject, clean_body);

  const confirmation_number = clean_identifier(
    combined.match(CONFIRMATION_NUMBER_PATTERN)?.[1],
  );

  const transaction_id = clean_identifier(
    combined.match(TRANSACTION_ID_PATTERN)?.[1],
  );

  const receipt_url = extract_receipt_url(clean_body, body_html, [
    from_email,
    forwarded?.from_email,
  ]);

  return {
    document_kind,
    merchant_source: merchant.source_address,
    receipt_url,
    order_id,
    order_date,
    merchant_name,
    items,
    subtotal: amounts.subtotal,
    tax: amounts.tax,
    shipping_cost: amounts.shipping_cost,
    discount: amounts.discount,
    total: amounts.total,
    payment_method,
    card_last_four,
    billing_address: null,
    confirmation_number,
    transaction_id,
    raw_signals: signals,
  };
}

export function extract_shipping_details(
  subject: string,
  body: string,
  html: string | undefined,
  from_email: string,
): ExtractedShippingDetails {
  const signals: string[] = [];
  const clean_subject = decode_basic_entities(subject);
  const clean_body = normalize_email_text(body);
  const raw_html = html ?? (is_html_content(body) ? body : undefined);

  const carrier = detect_carrier_from_email(
    from_email,
    clean_subject,
    clean_body,
  );

  if (carrier) signals.push(`carrier:${carrier}`);

  let tracking_url = extract_tracking_url(clean_body, raw_html);

  const tracking_result = extract_tracking_number(
    clean_body,
    carrier,
    tracking_url,
  );
  const tracking_number = tracking_result?.number || null;
  const detected_carrier = tracking_result?.carrier || carrier;

  if (tracking_number) signals.push(`tracking:${tracking_number}`);

  if (!tracking_url && tracking_number && detected_carrier) {
    const base_url = CARRIER_TRACKING_URLS[detected_carrier];

    if (base_url) {
      tracking_url = `${base_url}${tracking_number}`;
    }
  }

  const status = detect_shipping_status(clean_subject, clean_body);

  signals.push(`status:${status}`);

  const delivery_patterns = [
    /(?:estimated|expected)\s+delivery[:\s]*([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /arriving\s+(?:by\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2})/i,
    /deliver(?:ed|y)\s+(?:by\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2})/i,
  ];
  const estimated_delivery = clean_text_field(
    extract_date(clean_body, delivery_patterns),
  );

  const shipped_patterns = [
    /shipped\s+(?:on\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /ship\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  const shipped_date = clean_text_field(
    extract_date(clean_body, shipped_patterns),
  );

  const delivered_patterns = [
    /delivered\s+(?:on\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /delivery\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  const delivery_date =
    status === "delivered"
      ? clean_text_field(extract_date(clean_body, delivered_patterns))
      : null;

  const destination_match = clean_body.match(
    /(?:deliver(?:ed|ing)?\s+to|destination)[:\s]*([^\n]{10,100})/i,
  );
  const destination = clean_text_field(
    destination_match?.[1]?.substring(0, 100),
  );

  const carrier_name = detected_carrier
    ? CARRIER_NAMES[detected_carrier]
    : null;

  return {
    tracking_number,
    carrier: detected_carrier,
    carrier_name,
    tracking_url,
    status,
    estimated_delivery,
    shipped_date,
    delivery_date,
    origin: null,
    destination,
    items_shipped: [],
    raw_signals: signals,
  };
}

export function is_purchase_email(subject: string, body: string): boolean {
  const combined = `${subject} ${body}`.toLowerCase();

  const purchase_indicators = [
    /\border\s*(?:#|no\.?|num(?:ber)?|id)\s*[:#]?\s*[A-Za-z0-9]*[0-9]/i,
    /purchase\s+(?:confirmation|complete|receipt)/i,
    /thanks?\s+(?:you\s+)?for\s+(?:your\s+)?(?:[a-z]+\s+){0,2}(?:order|purchase|booking)/i,
    /\b(?:receipt|transaction|confirmation)\s*(?:#|no\.?|num(?:ber)?|id)\s*[:#]?\s*[A-Za-z0-9.-]*[0-9]/i,
    /receipt\s+(?:for|from)/i,
    /payment\s+(?:receipt|confirmation|successful)/i,
    /transaction\s+(?:receipt|complete)/i,
    /you\s+(?:bought|purchased|paid)/i,
    /\b(?:paid\s+with|charged\s+to)\b/i,
    /order\s+(?:placed|confirmed)/i,
    money_after("\\btotals?\\b"),
    money_after("\\bamount\\s+(?:paid|charged|due)\\b"),
  ];

  let matches = 0;

  for (const pattern of purchase_indicators) {
    if (pattern.test(combined)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
}

const PARCEL_SPECIFIC_INDICATORS = [
  /\btracking\s*(?:#|number)/i,
  /\bout\s+for\s+delivery\b/i,
  /\bhas\s+shipped\b/i,
  /\bshipment\s+(?:update|notification)\b/i,
  /\bpackage\s+(?:update|notification|shipped|delivered)\b/i,
  /\bestimated\s+delivery\b/i,
  /\barriving\s+(?:today|tomorrow|soon)\b/i,
  /\b1Z[A-Z0-9]{16}\b/i,
  /\bTBA\d{12,15}\b/i,
];

const SHIPMENT_NOUN =
  /\b(?:packages?|parcels?|orders?|shipments?|deliver(?:y|ies)|items?)\b/i;

const NON_PARCEL_TRANSIT_BEFORE =
  /\b(?:encrypted|encryption|protected|secured|secure|data|rest)\s+(?:(?:and|both)\s+)?$/i;

const NON_PARCEL_TRANSIT_AFTER = /^\s+encryption\b/i;

const NON_PARCEL_TRACKING_BEFORE = /\blink\s+$/i;

const NON_PARCEL_TRACKING_AFTER = /^\s+(?:pixels?|protection|prevention)\b/i;

interface TermContext {
  before: string;
  after: string;
}

function find_term_contexts(
  text: string,
  pattern: RegExp,
  excluded_before: RegExp,
  excluded_after: RegExp,
): TermContext[] {
  const contexts: TermContext[] = [];

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before =
      text
        .slice(Math.max(0, start - 60), start)
        .split(/[.!?\n]/)
        .pop() ?? "";
    const after = text.slice(end, end + 60).split(/[.!?\n]/)[0];

    if (excluded_before.test(before) || excluded_after.test(after)) continue;
    contexts.push({ before, after });
  }

  return contexts;
}

export function is_shipping_email(subject: string, body: string): boolean {
  const combined = `${subject} ${body}`.toLowerCase();

  const in_transit = find_term_contexts(
    combined,
    /\bin\s+transit\b/g,
    NON_PARCEL_TRANSIT_BEFORE,
    NON_PARCEL_TRANSIT_AFTER,
  );
  const tracking = find_term_contexts(
    combined,
    /\btracking\b/g,
    NON_PARCEL_TRACKING_BEFORE,
    NON_PARCEL_TRACKING_AFTER,
  );

  const shipping_indicators = [
    /\bshipped\b/i,
    /\bout\s+for\s+delivery\b/i,
    /\bdelivered\b/i,
    /\bhas\s+shipped\b/i,
    /\bshipment\s+(?:update|notification)\b/i,
    /\bpackage\s+(?:update|notification|shipped|delivered)\b/i,
    /\bestimated\s+delivery\b/i,
    /\barriving\s+(?:today|tomorrow|soon)\b/i,
    /\b1Z[A-Z0-9]{16}\b/i,
    /\bTBA\d{12,15}\b/i,
  ];

  let matches = (in_transit.length > 0 ? 1 : 0) + (tracking.length > 0 ? 1 : 0);

  for (const pattern of shipping_indicators) {
    if (matches >= 2) break;
    if (pattern.test(combined)) matches++;
  }

  if (matches < 2) return false;

  return (
    PARCEL_SPECIFIC_INDICATORS.some((pattern) => pattern.test(combined)) ||
    in_transit.some(
      ({ before, after }) =>
        SHIPMENT_NOUN.test(before) || SHIPMENT_NOUN.test(after),
    )
  );
}

export function extract_email_details(
  subject: string,
  body_text: string,
  body_html: string | undefined,
  from_email: string,
  from_name: string,
): EmailExtractionResult {
  const clean_subject = decode_basic_entities(subject);
  const clean_text = normalize_email_text(body_text, body_html);
  const is_purchase = is_purchase_email(clean_subject, clean_text);
  const is_shipping = is_shipping_email(clean_subject, clean_text);

  return {
    has_purchase_details: is_purchase,
    has_shipping_details: is_shipping,
    purchase: is_purchase
      ? extract_purchase_details(
          clean_subject,
          clean_text,
          from_email,
          from_name,
          body_html,
        )
      : null,
    shipping: is_shipping
      ? extract_shipping_details(
          clean_subject,
          clean_text,
          body_html,
          from_email,
        )
      : null,
    extracted_at: Date.now(),
  };
}
