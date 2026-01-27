import type {
  EmailExtractionResult,
  ExtractedPurchaseDetails,
  ExtractedShippingDetails,
  ExtractedAmount,
  ExtractedItem,
  ShippingCarrier,
  ShippingStatus,
} from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "C$": "CAD",
  "A$": "AUD",
};

const ORDER_ID_PATTERNS = [
  /order\s*(?:#|number|id)?[:\s]*([A-Z0-9][\w-]{5,30})/i,
  /order[:\s]+([0-9]{3}-[0-9]{7}-[0-9]{7})/i,
  /confirmation\s*(?:#|number)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  /invoice\s*(?:#|number)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  /receipt\s*(?:#|number)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  /transaction\s*(?:#|id)?[:\s]*([A-Z0-9][\w-]{8,30})/i,
];

const AMOUNT_PATTERN = /([\$€£¥₹]|USD|EUR|GBP|CAD|AUD)?\s*([0-9]{1,3}(?:,?[0-9]{3})*(?:\.[0-9]{2})?)\s*([\$€£¥₹]|USD|EUR|GBP|CAD|AUD)?/;

const TRACKING_PATTERNS: { carrier: ShippingCarrier; patterns: RegExp[] }[] = [
  {
    carrier: "ups",
    patterns: [
      /\b(1Z[A-Z0-9]{16})\b/i,
      /\b(T\d{10})\b/,
      /\b(\d{18})\b/,
    ],
  },
  {
    carrier: "fedex",
    patterns: [
      /\b(\d{12,22})\b/,
      /\b(\d{15})\b/,
      /\b(96\d{20})\b/,
      /\b(DT\d{12})\b/i,
    ],
  },
  {
    carrier: "usps",
    patterns: [
      /\b(94\d{20,22})\b/,
      /\b(92\d{20,22})\b/,
      /\b(93\d{20,22})\b/,
      /\b([A-Z]{2}\d{9}US)\b/i,
      /\b(420\d{27,31})\b/,
    ],
  },
  {
    carrier: "dhl",
    patterns: [
      /\b(\d{10,11})\b/,
      /\b([A-Z]{3}\d{7})\b/i,
      /\b(JD\d{18})\b/i,
    ],
  },
  {
    carrier: "amazon",
    patterns: [
      /\b(TBA\d{12,15})\b/i,
      /\b(AMZN_US\(\w+\))\b/i,
    ],
  },
];

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
    formatted: `${symbol}${value.toFixed(2)}`,
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
    if (combined.includes(name)) {
      return carrier;
    }
  }

  return null;
}

function extract_tracking_number(
  body: string,
  carrier: ShippingCarrier | null,
): { number: string; carrier: ShippingCarrier } | null {
  if (carrier) {
    const carrier_patterns = TRACKING_PATTERNS.find((p) => p.carrier === carrier);
    if (carrier_patterns) {
      for (const pattern of carrier_patterns.patterns) {
        const match = body.match(pattern);
        if (match) {
          return { number: match[1], carrier };
        }
      }
    }
  }

  for (const { carrier: c, patterns } of TRACKING_PATTERNS) {
    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return { number: match[1], carrier: c };
      }
    }
  }

  const generic_pattern = /tracking\s*(?:#|number)?[:\s]*([A-Z0-9]{10,30})/i;
  const match = body.match(generic_pattern);
  if (match) {
    return { number: match[1], carrier: "other" };
  }

  return null;
}

function extract_tracking_url(body: string, html: string | undefined): string | null {
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
  const combined = `${subject} ${body}`.toLowerCase();

  if (
    combined.includes("delivered") ||
    combined.includes("was delivered") ||
    combined.includes("has been delivered")
  ) {
    return "delivered";
  }

  if (
    combined.includes("out for delivery") ||
    combined.includes("arriving today")
  ) {
    return "out_for_delivery";
  }

  if (
    combined.includes("in transit") ||
    combined.includes("on the way") ||
    combined.includes("on its way")
  ) {
    return "in_transit";
  }

  if (
    combined.includes("shipped") ||
    combined.includes("has shipped") ||
    combined.includes("was shipped")
  ) {
    return "shipped";
  }

  if (
    combined.includes("label created") ||
    combined.includes("shipping label")
  ) {
    return "label_created";
  }

  if (
    combined.includes("delivery exception") ||
    combined.includes("delivery attempt") ||
    combined.includes("could not be delivered")
  ) {
    return "exception";
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
      const qty = parseInt(qty_or_name, 10);
      const is_qty_first = !isNaN(qty);

      const item_name = is_qty_first ? name_or_qty : qty_or_name;
      const quantity = is_qty_first ? qty : parseInt(name_or_qty, 10) || 1;
      const unit_price = parse_amount(price_str);

      if (item_name && item_name.length > 2 && item_name.length < 200) {
        items.push({
          name: item_name.trim(),
          quantity,
          unit_price,
          total_price: unit_price
            ? {
                ...unit_price,
                value: unit_price.value * quantity,
                formatted: `${unit_price.currency === "USD" ? "$" : unit_price.currency}${(unit_price.value * quantity).toFixed(2)}`,
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
    return from_name.replace(/\s*(order|shipping|notification|update)s?\s*/gi, "").trim();
  }

  const domain = from_email.split("@")[1];
  if (domain) {
    const parts = domain.split(".");
    if (parts.length >= 2) {
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
    }
  }

  return from_name || "Unknown Merchant";
}

export function extract_purchase_details(
  subject: string,
  body: string,
  from_email: string,
  from_name: string,
): ExtractedPurchaseDetails {
  const signals: string[] = [];
  const combined = `${subject}\n${body}`;

  let order_id: string | null = null;
  for (const pattern of ORDER_ID_PATTERNS) {
    const match = combined.match(pattern);
    if (match) {
      order_id = match[1];
      signals.push(`order_id:${order_id}`);
      break;
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

  const card_match = combined.match(/(?:card\s+)?ending\s+(?:in\s+)?[\*x]?(\d{4})/i);
  const card_last_four = card_match ? card_match[1] : null;
  if (card_last_four) signals.push(`card:****${card_last_four}`);

  const payment_match = combined.match(
    /(?:payment\s+method|paid\s+with|charged\s+to)[:\s]*([^\n]+)/i,
  );
  const payment_method = payment_match ? payment_match[1].trim() : null;

  const date_patterns = [
    /(?:order|purchase)\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:ordered|purchased)\s+on[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  ];
  const order_date = extract_date(combined, date_patterns);

  const items = extract_items_from_body(body);
  if (items.length > 0) signals.push(`items:${items.length}`);

  const merchant_name = extract_merchant_name(from_email, from_name);

  const confirmation_match = combined.match(
    /confirmation\s*(?:#|number|code)?[:\s]*([A-Z0-9][\w-]{5,20})/i,
  );
  const confirmation_number = confirmation_match ? confirmation_match[1] : null;

  const transaction_match = combined.match(
    /transaction\s*(?:#|id)?[:\s]*([A-Z0-9][\w-]{8,30})/i,
  );
  const transaction_id = transaction_match ? transaction_match[1] : null;

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

  const carrier = detect_carrier_from_email(from_email, subject, body);
  if (carrier) signals.push(`carrier:${carrier}`);

  const tracking_result = extract_tracking_number(body, carrier);
  const tracking_number = tracking_result?.number || null;
  const detected_carrier = tracking_result?.carrier || carrier;

  if (tracking_number) signals.push(`tracking:${tracking_number}`);

  let tracking_url = extract_tracking_url(body, html);

  if (!tracking_url && tracking_number && detected_carrier) {
    const { CARRIER_TRACKING_URLS } = require("./types");
    const base_url = CARRIER_TRACKING_URLS[detected_carrier];
    if (base_url) {
      tracking_url = `${base_url}${tracking_number}`;
    }
  }

  const status = detect_shipping_status(subject, body);
  signals.push(`status:${status}`);

  const delivery_patterns = [
    /(?:estimated|expected)\s+delivery[:\s]*([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /arriving\s+(?:by\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2})/i,
    /deliver(?:ed|y)\s+(?:by\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2})/i,
  ];
  const estimated_delivery = extract_date(body, delivery_patterns);

  const shipped_patterns = [
    /shipped\s+(?:on\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /ship\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  const shipped_date = extract_date(body, shipped_patterns);

  const delivered_patterns = [
    /delivered\s+(?:on\s+)?([A-Za-z]+,?\s*[A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
    /delivery\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ];
  const delivery_date =
    status === "delivered" ? extract_date(body, delivered_patterns) : null;

  const destination_match = body.match(
    /(?:deliver(?:ed|ing)?\s+to|destination)[:\s]*([^\n]{10,100})/i,
  );
  const destination = destination_match
    ? destination_match[1].trim().substring(0, 100)
    : null;

  const { CARRIER_NAMES } = require("./types");
  const carrier_name = detected_carrier ? CARRIER_NAMES[detected_carrier] : null;

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
  const is_purchase = is_purchase_email(subject, body_text);
  const is_shipping = is_shipping_email(subject, body_text);

  return {
    has_purchase_details: is_purchase,
    has_shipping_details: is_shipping,
    purchase: is_purchase
      ? extract_purchase_details(subject, body_text, from_email, from_name)
      : null,
    shipping: is_shipping
      ? extract_shipping_details(subject, body_text, body_html, from_email)
      : null,
    extracted_at: Date.now(),
  };
}
