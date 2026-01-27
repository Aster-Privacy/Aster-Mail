import type { EmailCategory } from "@/types/email";
import type { DomainRule, KeywordRule } from "./types";

export const SOCIAL_DOMAINS: DomainRule[] = [
  { domain: "facebook.com", category: "social", confidence: 95 },
  { domain: "facebookmail.com", category: "social", confidence: 95 },
  { domain: "fb.com", category: "social", confidence: 95 },
  { domain: "twitter.com", category: "social", confidence: 95 },
  { domain: "x.com", category: "social", confidence: 95 },
  { domain: "linkedin.com", category: "social", confidence: 95 },
  { domain: "instagram.com", category: "social", confidence: 95 },
  { domain: "tiktok.com", category: "social", confidence: 95 },
  { domain: "snapchat.com", category: "social", confidence: 95 },
  { domain: "pinterest.com", category: "social", confidence: 95 },
  { domain: "reddit.com", category: "social", confidence: 95 },
  { domain: "tumblr.com", category: "social", confidence: 95 },
  { domain: "whatsapp.com", category: "social", confidence: 95 },
  { domain: "telegram.org", category: "social", confidence: 95 },
  { domain: "discord.com", category: "social", confidence: 95 },
  { domain: "slack.com", category: "social", confidence: 85 },
  { domain: "meetup.com", category: "social", confidence: 90 },
  { domain: "nextdoor.com", category: "social", confidence: 90 },
  { domain: "twitch.tv", category: "social", confidence: 90 },
  { domain: "youtube.com", category: "social", confidence: 85 },
  { domain: "vimeo.com", category: "social", confidence: 85 },
  { domain: "medium.com", category: "social", confidence: 80 },
  { domain: "quora.com", category: "social", confidence: 85 },
  { domain: "mastodon.social", category: "social", confidence: 95 },
  { domain: "threads.net", category: "social", confidence: 95 },
  { domain: "bluesky.social", category: "social", confidence: 95 },
];

export const PROMOTIONS_DOMAINS: DomainRule[] = [
  { domain: "mailchimp.com", category: "promotions", confidence: 95 },
  { domain: "sendgrid.net", category: "promotions", confidence: 85 },
  { domain: "constantcontact.com", category: "promotions", confidence: 95 },
  { domain: "hubspot.com", category: "promotions", confidence: 85 },
  { domain: "salesforce.com", category: "promotions", confidence: 80 },
  { domain: "marketo.com", category: "promotions", confidence: 90 },
  { domain: "mailgun.com", category: "promotions", confidence: 80 },
  { domain: "klaviyo.com", category: "promotions", confidence: 95 },
  { domain: "brevo.com", category: "promotions", confidence: 90 },
  { domain: "sendinblue.com", category: "promotions", confidence: 90 },
  { domain: "getresponse.com", category: "promotions", confidence: 95 },
  { domain: "aweber.com", category: "promotions", confidence: 95 },
  { domain: "convertkit.com", category: "promotions", confidence: 90 },
  { domain: "drip.com", category: "promotions", confidence: 90 },
  { domain: "activecampaign.com", category: "promotions", confidence: 90 },
  { domain: "substack.com", category: "promotions", confidence: 75 },
  { domain: "beehiiv.com", category: "promotions", confidence: 80 },
  { domain: "buttondown.email", category: "promotions", confidence: 80 },
  { domain: "revue.co", category: "promotions", confidence: 85 },
  { domain: "emailoctopus.com", category: "promotions", confidence: 90 },
  { domain: "sender.net", category: "promotions", confidence: 85 },
  { domain: "moosend.com", category: "promotions", confidence: 90 },
  { domain: "benchmark.email", category: "promotions", confidence: 90 },
];

export const UPDATES_DOMAINS: DomainRule[] = [
  { domain: "amazon.com", category: "updates", confidence: 80 },
  { domain: "ebay.com", category: "updates", confidence: 80 },
  { domain: "paypal.com", category: "updates", confidence: 90 },
  { domain: "stripe.com", category: "updates", confidence: 90 },
  { domain: "square.com", category: "updates", confidence: 90 },
  { domain: "ups.com", category: "updates", confidence: 95 },
  { domain: "fedex.com", category: "updates", confidence: 95 },
  { domain: "usps.com", category: "updates", confidence: 95 },
  { domain: "dhl.com", category: "updates", confidence: 95 },
  { domain: "bankofamerica.com", category: "updates", confidence: 95 },
  { domain: "chase.com", category: "updates", confidence: 95 },
  { domain: "wellsfargo.com", category: "updates", confidence: 95 },
  { domain: "citi.com", category: "updates", confidence: 95 },
  { domain: "capitalone.com", category: "updates", confidence: 95 },
  { domain: "americanexpress.com", category: "updates", confidence: 95 },
  { domain: "discover.com", category: "updates", confidence: 95 },
  { domain: "netflix.com", category: "updates", confidence: 85 },
  { domain: "spotify.com", category: "updates", confidence: 85 },
  { domain: "apple.com", category: "updates", confidence: 80 },
  { domain: "google.com", category: "updates", confidence: 75 },
  { domain: "microsoft.com", category: "updates", confidence: 75 },
  { domain: "github.com", category: "updates", confidence: 80 },
  { domain: "dropbox.com", category: "updates", confidence: 85 },
  { domain: "uber.com", category: "updates", confidence: 90 },
  { domain: "lyft.com", category: "updates", confidence: 90 },
  { domain: "doordash.com", category: "updates", confidence: 90 },
  { domain: "grubhub.com", category: "updates", confidence: 90 },
  { domain: "instacart.com", category: "updates", confidence: 90 },
  { domain: "airbnb.com", category: "updates", confidence: 85 },
  { domain: "booking.com", category: "updates", confidence: 85 },
  { domain: "expedia.com", category: "updates", confidence: 85 },
  { domain: "delta.com", category: "updates", confidence: 90 },
  { domain: "united.com", category: "updates", confidence: 90 },
  { domain: "southwest.com", category: "updates", confidence: 90 },
  { domain: "aa.com", category: "updates", confidence: 90 },
  { domain: "jetblue.com", category: "updates", confidence: 90 },
];

export const FORUMS_DOMAINS: DomainRule[] = [
  { domain: "googlegroups.com", category: "forums", confidence: 95 },
  { domain: "groups.io", category: "forums", confidence: 95 },
  { domain: "freelists.org", category: "forums", confidence: 95 },
  { domain: "mailman.mit.edu", category: "forums", confidence: 95 },
  { domain: "lists.sourceforge.net", category: "forums", confidence: 95 },
  { domain: "lists.debian.org", category: "forums", confidence: 95 },
  { domain: "lists.fedoraproject.org", category: "forums", confidence: 95 },
  { domain: "lists.ubuntu.com", category: "forums", confidence: 95 },
  { domain: "lists.apache.org", category: "forums", confidence: 95 },
  { domain: "lists.gnu.org", category: "forums", confidence: 95 },
  { domain: "discourse.org", category: "forums", confidence: 90 },
  { domain: "circle.so", category: "forums", confidence: 85 },
  { domain: "mighty.com", category: "forums", confidence: 85 },
  { domain: "tribe.so", category: "forums", confidence: 85 },
];


export const ALL_DOMAIN_RULES: DomainRule[] = [
  ...SOCIAL_DOMAINS,
  ...PROMOTIONS_DOMAINS,
  ...UPDATES_DOMAINS,
  ...FORUMS_DOMAINS,
];

const DOMAIN_MAP = new Map<string, DomainRule>();
for (const rule of ALL_DOMAIN_RULES) {
  DOMAIN_MAP.set(rule.domain, rule);
}

export function get_domain_rule(domain: string): DomainRule | undefined {
  const normalized = domain.toLowerCase();
  const direct = DOMAIN_MAP.get(normalized);
  if (direct) return direct;

  const parts = normalized.split(".");
  if (parts.length > 2) {
    const parent = parts.slice(-2).join(".");
    return DOMAIN_MAP.get(parent);
  }

  return undefined;
}

export const SUBJECT_KEYWORDS: KeywordRule[] = [
  { pattern: /\bsale\b/i, category: "promotions", weight: 60, field: "subject" },
  { pattern: /\bdiscount\b/i, category: "promotions", weight: 65, field: "subject" },
  { pattern: /\b\d+%\s*off\b/i, category: "promotions", weight: 75, field: "subject" },
  { pattern: /\bfree\s+shipping\b/i, category: "promotions", weight: 70, field: "subject" },
  { pattern: /\blimited\s+time\b/i, category: "promotions", weight: 65, field: "subject" },
  { pattern: /\bexclusive\s+offer\b/i, category: "promotions", weight: 70, field: "subject" },
  { pattern: /\bdeal\s+of\b/i, category: "promotions", weight: 65, field: "subject" },
  { pattern: /\bpromo\s*code\b/i, category: "promotions", weight: 80, field: "subject" },
  { pattern: /\bcoupon\b/i, category: "promotions", weight: 75, field: "subject" },
  { pattern: /\bsave\s+\$?\d+/i, category: "promotions", weight: 70, field: "subject" },
  { pattern: /\bbuy\s+one\s+get\b/i, category: "promotions", weight: 75, field: "subject" },
  { pattern: /\bflash\s+sale\b/i, category: "promotions", weight: 80, field: "subject" },
  { pattern: /\bclearance\b/i, category: "promotions", weight: 70, field: "subject" },
  { pattern: /\bnewsletter\b/i, category: "promotions", weight: 55, field: "subject" },

  { pattern: /\border\s+(confirmation|confirmed)\b/i, category: "updates", weight: 90, field: "subject" },
  { pattern: /\bshipping\s+(confirmation|update)\b/i, category: "updates", weight: 90, field: "subject" },
  { pattern: /\bdelivery\s+(confirmation|update)\b/i, category: "updates", weight: 90, field: "subject" },
  { pattern: /\byour\s+order\b/i, category: "updates", weight: 75, field: "subject" },
  { pattern: /\breceipt\b/i, category: "updates", weight: 80, field: "subject" },
  { pattern: /\binvoice\b/i, category: "updates", weight: 80, field: "subject" },
  { pattern: /\bpayment\s+(received|confirmed)\b/i, category: "updates", weight: 85, field: "subject" },
  { pattern: /\baccount\s+(statement|update)\b/i, category: "updates", weight: 80, field: "subject" },
  { pattern: /\bpassword\s+reset\b/i, category: "updates", weight: 90, field: "subject" },
  { pattern: /\bverify\s+your\b/i, category: "updates", weight: 85, field: "subject" },
  { pattern: /\bconfirm\s+your\b/i, category: "updates", weight: 80, field: "subject" },
  { pattern: /\bsecurity\s+alert\b/i, category: "updates", weight: 90, field: "subject" },
  { pattern: /\bsign-?in\s+(alert|notification)\b/i, category: "updates", weight: 85, field: "subject" },
  { pattern: /\btracking\s+(number|info)\b/i, category: "updates", weight: 85, field: "subject" },
  { pattern: /\bhas\s+shipped\b/i, category: "updates", weight: 90, field: "subject" },
  { pattern: /\bout\s+for\s+delivery\b/i, category: "updates", weight: 95, field: "subject" },
  { pattern: /\bwas\s+delivered\b/i, category: "updates", weight: 95, field: "subject" },

  { pattern: /\bconnect(ed|ion)?\s+with\s+you\b/i, category: "social", weight: 70, field: "subject" },
  { pattern: /\badded\s+you\b/i, category: "social", weight: 75, field: "subject" },
  { pattern: /\bfollowing\s+you\b/i, category: "social", weight: 80, field: "subject" },
  { pattern: /\bfriend\s+request\b/i, category: "social", weight: 85, field: "subject" },
  { pattern: /\btagged\s+(you|in)\b/i, category: "social", weight: 80, field: "subject" },
  { pattern: /\bmentioned\s+you\b/i, category: "social", weight: 80, field: "subject" },
  { pattern: /\bcommented\s+on\b/i, category: "social", weight: 70, field: "subject" },
  { pattern: /\bliked\s+(your|a)\b/i, category: "social", weight: 70, field: "subject" },
  { pattern: /\bshared\s+(your|a)\b/i, category: "social", weight: 65, field: "subject" },
  { pattern: /\bmessage\s+from\b/i, category: "social", weight: 60, field: "subject" },
  { pattern: /\bnew\s+follower\b/i, category: "social", weight: 85, field: "subject" },

  { pattern: /^\s*re:\s*/i, category: "forums", weight: 40, field: "subject" },
  { pattern: /\[[\w-]+\]\s*/i, category: "forums", weight: 50, field: "subject" },
  { pattern: /\bdigest\b/i, category: "forums", weight: 60, field: "subject" },
  { pattern: /\bweekly\s+summary\b/i, category: "forums", weight: 55, field: "subject" },
  { pattern: /\bdaily\s+digest\b/i, category: "forums", weight: 65, field: "subject" },
  { pattern: /\bmailing\s+list\b/i, category: "forums", weight: 70, field: "subject" },

  { pattern: /\b(your\s+)?purchase\s+(confirmation|complete|receipt)\b/i, category: "purchases", weight: 95, field: "subject" },
  { pattern: /\bthank\s+you\s+for\s+(your\s+)?(order|purchase)\b/i, category: "purchases", weight: 95, field: "subject" },
  { pattern: /\border\s+(confirmation|receipt|#\s*\d+)\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\breceipt\s+(for|from)\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\byour\s+(order|purchase)\s+receipt\b/i, category: "purchases", weight: 95, field: "subject" },
  { pattern: /\byour\s+receipt\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\bpayment\s+(receipt|confirmation|successful)\b/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\btransaction\s+(receipt|complete|successful)\b/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\binvoice\s+#?\s*\d+/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\byou\s+(bought|purchased)\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\border\s+(placed|received|processed)\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\bsuccessful\s+(payment|purchase|transaction)\b/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\bdigital\s+(purchase|download|receipt)\b/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\bsubscription\s+(confirmation|started|renewed|receipt)\b/i, category: "purchases", weight: 80, field: "subject" },
  { pattern: /\bpurchased\s+on\b/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\bwe\s+received\s+your\s+(order|payment)\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\byour\s+payment\s+(was\s+)?received\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\bcharge\s+(confirmation|receipt)\b/i, category: "purchases", weight: 85, field: "subject" },
  { pattern: /\b(e-?)?receipt\s+for\s+your\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\bconfirming\s+your\s+(order|purchase)\b/i, category: "purchases", weight: 90, field: "subject" },
  { pattern: /\bmoney\s+sent\b/i, category: "purchases", weight: 80, field: "subject" },
  { pattern: /\bpayment\s+to\b/i, category: "purchases", weight: 75, field: "subject" },
  { pattern: /\byou\s+paid\b/i, category: "purchases", weight: 85, field: "subject" },
];

export const BODY_KEYWORDS: KeywordRule[] = [
  { pattern: /\bunsubscribe\b/i, category: "promotions", weight: 40, field: "body" },
  { pattern: /\bclick\s+here\s+to\s+unsubscribe\b/i, category: "promotions", weight: 50, field: "body" },
  { pattern: /\bmanage\s+(your\s+)?preferences\b/i, category: "promotions", weight: 35, field: "body" },
  { pattern: /\bopt[\s-]?out\b/i, category: "promotions", weight: 40, field: "body" },
  { pattern: /\bemail\s+preferences\b/i, category: "promotions", weight: 35, field: "body" },
  { pattern: /\bno\s+longer\s+wish\s+to\s+receive\b/i, category: "promotions", weight: 50, field: "body" },

  { pattern: /\border\s+#?\d+/i, category: "updates", weight: 70, field: "body" },
  { pattern: /\btracking\s+#?\w+/i, category: "updates", weight: 75, field: "body" },
  { pattern: /\btotal:\s*\$[\d,.]+/i, category: "updates", weight: 65, field: "body" },
  { pattern: /\bsubtotal:\s*\$[\d,.]+/i, category: "updates", weight: 65, field: "body" },

  { pattern: /\bpurchase\s+total[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 85, field: "body" },
  { pattern: /\border\s+total[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 80, field: "body" },
  { pattern: /\bgrand\s+total[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 85, field: "body" },
  { pattern: /\bamount\s+(paid|charged)[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 85, field: "body" },
  { pattern: /\btotal\s+charged[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 85, field: "body" },
  { pattern: /\bthank\s+you\s+for\s+(your\s+)?(purchase|order|payment)\b/i, category: "purchases", weight: 75, field: "body" },
  { pattern: /\bpurchase\s+(details|summary)\b/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\border\s+(details|summary)\b/i, category: "purchases", weight: 65, field: "body" },
  { pattern: /\bpayment\s+(method|details)[:\s]/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\bbilling\s+(address|information)[:\s]/i, category: "purchases", weight: 65, field: "body" },
  { pattern: /\bitem\s+quantity[:\s]/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\bunit\s+price[:\s]/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\bprice[:\s]*[\$€£¥][\d,.]+/i, category: "purchases", weight: 60, field: "body" },
  { pattern: /\btax[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 55, field: "body" },
  { pattern: /\bcard\s+ending\s+in\s+[\d*x]{4}\b/i, category: "purchases", weight: 85, field: "body" },
  { pattern: /\bending\s+in\s+[\d*x]{4}\b/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\btransaction\s+(id|number)[:\s]/i, category: "purchases", weight: 75, field: "body" },
  { pattern: /\bconfirmation\s+(number|code)[:\s]/i, category: "purchases", weight: 75, field: "body" },
  { pattern: /\border\s+(number|id)[:\s]*#?\s*[\w-]+/i, category: "purchases", weight: 80, field: "body" },
  { pattern: /\byou\s+(paid|purchased|bought)\b/i, category: "purchases", weight: 75, field: "body" },
  { pattern: /\bsubtotal[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\bshipping[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 60, field: "body" },
  { pattern: /\bdelivery\s+fee[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 65, field: "body" },
  { pattern: /\bservice\s+fee[:\s]*[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 60, field: "body" },
  { pattern: /\bdiscount[:\s]*-?[\$€£¥]?[\d,.]+/i, category: "purchases", weight: 60, field: "body" },
  { pattern: /\bpromo\s+(code|applied)[:\s]/i, category: "purchases", weight: 55, field: "body" },
  { pattern: /\bpayment\s+received\b/i, category: "purchases", weight: 80, field: "body" },
  { pattern: /\bpayment\s+successful\b/i, category: "purchases", weight: 85, field: "body" },
  { pattern: /\btransaction\s+complete\b/i, category: "purchases", weight: 80, field: "body" },
  { pattern: /\breceipt\s+number[:\s]/i, category: "purchases", weight: 80, field: "body" },
  { pattern: /\binvoice\s+(number|id)[:\s]/i, category: "purchases", weight: 75, field: "body" },
  { pattern: /\bpurchase\s+date[:\s]/i, category: "purchases", weight: 70, field: "body" },
  { pattern: /\bquantity[:\s]*\d+/i, category: "purchases", weight: 50, field: "body" },
  { pattern: /\bsold\s+by[:\s]/i, category: "purchases", weight: 60, field: "body" },
  { pattern: /\bview\s+(your\s+)?(order|receipt|invoice)\b/i, category: "purchases", weight: 65, field: "body" },
  { pattern: /\bdownload\s+(your\s+)?(receipt|invoice)\b/i, category: "purchases", weight: 70, field: "body" },
];

export const NOREPLY_PATTERNS: RegExp[] = [
  /^no[-_]?reply@/i,
  /^noreply@/i,
  /^do[-_]?not[-_]?reply@/i,
  /^donotreply@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^info@/i,
  /^news@/i,
  /^updates?@/i,
  /^mailer@/i,
  /^newsletter@/i,
  /^marketing@/i,
  /^promo@/i,
  /^offers?@/i,
  /^deals?@/i,
  /^support@/i,
  /^help@/i,
  /^service@/i,
  /^team@/i,
];

export function is_automated_sender(email: string): boolean {
  return NOREPLY_PATTERNS.some((pattern) => pattern.test(email));
}

export function extract_domain(email: string): string {
  const at_index = email.lastIndexOf("@");
  if (at_index === -1) return "";
  return email.slice(at_index + 1).toLowerCase();
}

export function match_subject_keywords(subject: string): KeywordRule[] {
  return SUBJECT_KEYWORDS.filter((rule) => rule.pattern.test(subject));
}

export function match_body_keywords(body: string): KeywordRule[] {
  return BODY_KEYWORDS.filter((rule) => rule.pattern.test(body));
}

export function get_category_by_weight(
  weights: Map<EmailCategory, number>,
  min_confidence: number = 50,
): { category: EmailCategory; confidence: number } | null {
  let max_weight = 0;
  let max_category: EmailCategory | null = null;

  for (const [category, weight] of weights) {
    if (weight > max_weight) {
      max_weight = weight;
      max_category = category;
    }
  }

  if (max_category && max_weight >= min_confidence) {
    return { category: max_category, confidence: Math.min(max_weight, 100) };
  }

  return null;
}
