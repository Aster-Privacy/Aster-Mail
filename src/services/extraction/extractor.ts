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
import { en } from "@/lib/i18n/translations/en";
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

function normalize_email_text(text: string, html?: string): string {
  const source = text && text.trim() ? text : (html ?? "");

  if (!source) return "";
  if (is_html_content(source)) return html_to_readable_plain_text(source);

  return decode_basic_entities(source);
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
};

const CURRENCY_TO_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
  CAD: "C$",
  AUD: "A$",
};

function currency_symbol(currency: string): string {
  return CURRENCY_TO_SYMBOL[currency] ?? currency;
}

function escape_regex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ORDER_ID_PATTERNS = [
  /order\s*(?:#|number|id)?[:\s]*([A-Z0-9][\w-]{5,30})/i,
  /order[:\s]+([0-9]{3}-[0-9]{7}-[0-9]{7})/i,
  /confirmation\s*(?:#|number)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  /invoice\s*(?:#|number)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  /receipt\s*(?:#|number)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  /transaction\s*(?:#|id)?[:\s]*([A-Z0-9][\w-]{8,30})/i,
];

const AMOUNT_PATTERN =
  /([\$€£¥₹]|USD|EUR|GBP|CAD|AUD)?\s*([0-9]{1,3}(?:,?[0-9]{3})*(?:\.[0-9]{2})?)\s*([\$€£¥₹]|USD|EUR|GBP|CAD|AUD)?/;

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

function parse_amount(text: string): ExtractedAmount | null {
  const match = text.match(AMOUNT_PATTERN);

  if (!match) return null;

  const [, prefix_symbol, value_str, suffix_symbol] = match;
  const symbol = prefix_symbol || suffix_symbol || "$";
  const currency = CURRENCY_SYMBOLS[symbol] || symbol;
  const value = parseFloat(value_str.replace(/,/g, ""));

  if (isNaN(value)) return null;

  return {
    value,
    currency,
    formatted: `${currency_symbol(currency)}${value.toFixed(2)}`,
  };
}

function extract_amount_from_line(
  text: string,
  patterns: RegExp[],
): ExtractedAmount | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      const amount_str = match[1] || match[0];

      return parse_amount(amount_str);
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

function extract_tracking_url(
  body: string,
  html: string | undefined,
): string | null {
  const url_patterns = [
    /https?:\/\/[^\s<>"]+track[^\s<>"]*/gi,
    /https?:\/\/[^\s<>"]+shipment[^\s<>"]*/gi,
    /https?:\/\/[^\s<>"]+delivery[^\s<>"]*/gi,
  ];

  const content = html || body;

  for (const pattern of url_patterns) {
    const matches = content.match(pattern);

    if (matches && matches.length > 0) {
      let url = matches[0];

      url = url.replace(/['">\]]+$/, "");

      return url;
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

function extract_items_from_body(body: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  const item_patterns = [
    /(\d+)\s*x\s+(.+?)\s*[-–]\s*([\$€£¥₹]?\s*[\d,.]+)/gi,
    /(.+?)\s*\(Qty:\s*(\d+)\)\s*([\$€£¥₹]?\s*[\d,.]+)/gi,
    /Item:\s*(.+?)(?:\s*Qty:\s*(\d+))?\s*Price:\s*([\$€£¥₹]?\s*[\d,.]+)/gi,
  ];

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
      const unit_price = parse_amount(price_str);

      if (item_name && item_name.length > 2 && item_name.length < 200) {
        items.push({
          name: item_name,
          quantity,
          unit_price,
          total_price: unit_price
            ? {
                ...unit_price,
                value: unit_price.value * quantity,
                formatted: `${currency_symbol(unit_price.currency)}${(unit_price.value * quantity).toFixed(2)}`,
              }
            : null,
        });
      }
    }
  }

  return items;
}

function extract_merchant_name(from_email: string, from_name: string): string {
  if (from_name && !from_name.toLowerCase().includes("noreply")) {
    const stripped = from_name
      .replace(/(?:\s+(?:order|shipping|notification|update)s?)+\s*$/i, "")
      .trim();

    return stripped || from_name.trim();
  }

  const domain = from_email.split("@")[1];

  if (domain) {
    const parts = domain.split(".");

    if (parts.length >= 2) {
      return (
        parts[parts.length - 2].charAt(0).toUpperCase() +
        parts[parts.length - 2].slice(1)
      );
    }
  }

  return from_name || en.common.unknown_merchant;
}

export function extract_purchase_details(
  subject: string,
  body: string,
  from_email: string,
  from_name: string,
): ExtractedPurchaseDetails {
  const signals: string[] = [];
  const clean_subject = decode_basic_entities(subject);
  const clean_body = normalize_email_text(body);
  const combined = `${clean_subject}\n${clean_body}`;

  let order_id: string | null = null;

  for (const pattern of ORDER_ID_PATTERNS) {
    const match = combined.match(pattern);

    if (match) {
      order_id = clean_text_field(match[1]);

      if (order_id) {
        signals.push(`order_id:${order_id}`);
        break;
      }
    }
  }

  const total = extract_amount_from_line(combined, [
    /(?:order\s+)?total[:\s]*\$?([\d,.]+)/i,
    /grand\s+total[:\s]*\$?([\d,.]+)/i,
    /amount\s+(?:paid|charged)[:\s]*\$?([\d,.]+)/i,
    /total\s+charged[:\s]*\$?([\d,.]+)/i,
    /purchase\s+total[:\s]*\$?([\d,.]+)/i,
  ]);

  if (total) signals.push(`total:${total.formatted}`);

  const subtotal = extract_amount_from_line(combined, [
    /subtotal[:\s]*\$?([\d,.]+)/i,
    /items?\s+total[:\s]*\$?([\d,.]+)/i,
  ]);

  const tax = extract_amount_from_line(combined, [
    /(?:sales\s+)?tax[:\s]*\$?([\d,.]+)/i,
    /vat[:\s]*\$?([\d,.]+)/i,
  ]);

  const shipping_cost = extract_amount_from_line(combined, [
    /shipping(?:\s+&\s+handling)?[:\s]*\$?([\d,.]+)/i,
    /delivery\s+fee[:\s]*\$?([\d,.]+)/i,
  ]);

  const discount = extract_amount_from_line(combined, [
    /discount[:\s]*-?\$?([\d,.]+)/i,
    /savings?[:\s]*-?\$?([\d,.]+)/i,
    /promo(?:tion)?\s+(?:code\s+)?(?:applied)?[:\s]*-?\$?([\d,.]+)/i,
  ]);

  const card_match = combined.match(
    /(?:card\s+)?ending\s+(?:in\s+)?[\*x]?(\d{4})/i,
  );
  const card_last_four = card_match ? card_match[1] : null;

  if (card_last_four) signals.push(`card:****${card_last_four}`);

  const payment_match = combined.match(
    /(?:payment\s+method|paid\s+with|charged\s+to)[:\s]*([^\n]+)/i,
  );
  const payment_method = clean_text_field(payment_match?.[1]);

  const date_patterns = [
    /(?:order|purchase)\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:ordered|purchased)\s+on[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ];
  const order_date = clean_text_field(extract_date(combined, date_patterns));

  const items = extract_items_from_body(clean_body);

  if (items.length > 0) signals.push(`items:${items.length}`);

  const merchant_name = clean_text_field(
    extract_merchant_name(from_email, from_name),
  );

  const confirmation_match = combined.match(
    /confirmation\s*(?:#|number|code)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  );
  const confirmation_number = clean_text_field(confirmation_match?.[1]);

  const transaction_match = combined.match(
    /transaction\s*(?:#|id)?[:\s]*([A-Z0-9][\w-]{8,30})/i,
  );
  const transaction_id = clean_text_field(transaction_match?.[1]);

  return {
    order_id,
    order_date,
    merchant_name,
    items,
    subtotal,
    tax,
    shipping_cost,
    discount,
    total,
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
    /order\s*(?:#|number|id)?[:\s]*[A-Z0-9]/i,
    /purchase\s+(?:confirmation|complete|receipt)/i,
    /thank\s+you\s+for\s+(?:your\s+)?(?:order|purchase)/i,
    /receipt\s+(?:for|from)/i,
    /payment\s+(?:receipt|confirmation|successful)/i,
    /transaction\s+(?:receipt|complete)/i,
    /you\s+(?:bought|purchased|paid)/i,
    /order\s+(?:placed|confirmed)/i,
    /total[:\s]*[\$€£¥₹][\d,.]+/i,
    /amount\s+(?:paid|charged)[:\s]*[\$€£¥₹][\d,.]+/i,
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

export function is_shipping_email(subject: string, body: string): boolean {
  const combined = `${subject} ${body}`.toLowerCase();

  const shipping_indicators = [
    /\bshipped\b/i,
    /\btracking\s*(?:#|number)?\b/i,
    /\bout\s+for\s+delivery\b/i,
    /\bdelivered\b/i,
    /\bin\s+transit\b/i,
    /\bhas\s+shipped\b/i,
    /\bshipment\s+(?:update|notification)\b/i,
    /\bpackage\s+(?:update|notification|shipped|delivered)\b/i,
    /\bestimated\s+delivery\b/i,
    /\barriving\s+(?:today|tomorrow|soon)\b/i,
    /\b1Z[A-Z0-9]{16}\b/i,
    /\bTBA\d{12,15}\b/i,
  ];

  let matches = 0;

  for (const pattern of shipping_indicators) {
    if (pattern.test(combined)) {
      matches++;
      if (matches >= 2) return true;
    }
  }

  return false;
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
      ? extract_purchase_details(clean_subject, clean_text, from_email, from_name)
      : null,
    shipping: is_shipping
      ? extract_shipping_details(clean_subject, clean_text, body_html, from_email)
      : null,
    extracted_at: Date.now(),
  };
}
