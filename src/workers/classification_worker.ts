import type { EmailCategory } from "../types/email";

interface WorkerMessage {
  id: string;
  type: ClassificationMessageType;
  payload: unknown;
}

interface WorkerResponse {
  id: string;
  type: ClassificationMessageType;
  payload?: unknown;
  error?: string;
}

type ClassificationMessageType =
  | "classify"
  | "classify_batch"
  | "add_preference"
  | "remove_preference"
  | "load_preferences"
  | "get_preferences"
  | "clear_cache";

interface ClassifyPayload {
  id: string;
  envelope: EnvelopeData;
  headers?: HeadersData;
}

interface ClassifyBatchPayload {
  items: Array<{
    id: string;
    envelope: EnvelopeData;
    headers?: HeadersData;
  }>;
}

interface AddPreferencePayload {
  sender_email: string;
  category: EmailCategory;
}

interface RemovePreferencePayload {
  sender_email: string;
}

interface LoadPreferencesPayload {
  preferences: UserPreferenceData[];
}

interface EnvelopeData {
  subject: string;
  body_text: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
}

interface HeadersData {
  list_unsubscribe?: string;
  precedence?: string;
  x_mailer?: string;
  content_type?: string;
}

interface UserPreferenceData {
  sender_email: string;
  sender_domain: string;
  assigned_category: EmailCategory;
  created_at: number;
}

interface ClassificationResultData {
  category: EmailCategory;
  confidence: number;
  signals: Array<{
    type: string;
    source: string;
    weight: number;
  }>;
}

interface DomainRuleData {
  domain: string;
  category: EmailCategory;
  confidence: number;
}

interface KeywordRuleData {
  pattern: string;
  flags: string;
  category: EmailCategory;
  weight: number;
}

const SOCIAL_DOMAINS: DomainRuleData[] = [
  { domain: "facebook.com", category: "social", confidence: 95 },
  { domain: "facebookmail.com", category: "social", confidence: 95 },
  { domain: "twitter.com", category: "social", confidence: 95 },
  { domain: "x.com", category: "social", confidence: 95 },
  { domain: "linkedin.com", category: "social", confidence: 95 },
  { domain: "instagram.com", category: "social", confidence: 95 },
  { domain: "tiktok.com", category: "social", confidence: 95 },
  { domain: "snapchat.com", category: "social", confidence: 95 },
  { domain: "pinterest.com", category: "social", confidence: 95 },
  { domain: "reddit.com", category: "social", confidence: 95 },
  { domain: "discord.com", category: "social", confidence: 95 },
  { domain: "slack.com", category: "social", confidence: 85 },
  { domain: "youtube.com", category: "social", confidence: 85 },
  { domain: "twitch.tv", category: "social", confidence: 90 },
  { domain: "medium.com", category: "social", confidence: 80 },
  { domain: "mastodon.social", category: "social", confidence: 95 },
  { domain: "threads.net", category: "social", confidence: 95 },
  { domain: "bluesky.social", category: "social", confidence: 95 },
];

const PROMOTIONS_DOMAINS: DomainRuleData[] = [
  { domain: "mailchimp.com", category: "promotions", confidence: 95 },
  { domain: "sendgrid.net", category: "promotions", confidence: 85 },
  { domain: "constantcontact.com", category: "promotions", confidence: 95 },
  { domain: "hubspot.com", category: "promotions", confidence: 85 },
  { domain: "klaviyo.com", category: "promotions", confidence: 95 },
  { domain: "brevo.com", category: "promotions", confidence: 90 },
  { domain: "getresponse.com", category: "promotions", confidence: 95 },
  { domain: "convertkit.com", category: "promotions", confidence: 90 },
  { domain: "substack.com", category: "promotions", confidence: 75 },
  { domain: "beehiiv.com", category: "promotions", confidence: 80 },
];

const UPDATES_DOMAINS: DomainRuleData[] = [
  { domain: "amazon.com", category: "updates", confidence: 80 },
  { domain: "paypal.com", category: "updates", confidence: 90 },
  { domain: "stripe.com", category: "updates", confidence: 90 },
  { domain: "ups.com", category: "updates", confidence: 95 },
  { domain: "fedex.com", category: "updates", confidence: 95 },
  { domain: "usps.com", category: "updates", confidence: 95 },
  { domain: "bankofamerica.com", category: "updates", confidence: 95 },
  { domain: "chase.com", category: "updates", confidence: 95 },
  { domain: "netflix.com", category: "updates", confidence: 85 },
  { domain: "spotify.com", category: "updates", confidence: 85 },
  { domain: "github.com", category: "updates", confidence: 80 },
  { domain: "uber.com", category: "updates", confidence: 90 },
  { domain: "doordash.com", category: "updates", confidence: 90 },
  { domain: "airbnb.com", category: "updates", confidence: 85 },
];

const FORUMS_DOMAINS: DomainRuleData[] = [
  { domain: "googlegroups.com", category: "forums", confidence: 95 },
  { domain: "groups.io", category: "forums", confidence: 95 },
  { domain: "lists.sourceforge.net", category: "forums", confidence: 95 },
  { domain: "discourse.org", category: "forums", confidence: 90 },
];

const ALL_DOMAIN_RULES: DomainRuleData[] = [
  ...SOCIAL_DOMAINS,
  ...PROMOTIONS_DOMAINS,
  ...UPDATES_DOMAINS,
  ...FORUMS_DOMAINS,
];

const DOMAIN_MAP = new Map<string, DomainRuleData>();
for (const rule of ALL_DOMAIN_RULES) {
  DOMAIN_MAP.set(rule.domain, rule);
}

const SUBJECT_KEYWORDS: KeywordRuleData[] = [
  { pattern: "\\bsale\\b", flags: "i", category: "promotions", weight: 60 },
  { pattern: "\\bdiscount\\b", flags: "i", category: "promotions", weight: 65 },
  { pattern: "\\b\\d+%\\s*off\\b", flags: "i", category: "promotions", weight: 75 },
  { pattern: "\\bfree\\s+shipping\\b", flags: "i", category: "promotions", weight: 70 },
  { pattern: "\\bpromo\\s*code\\b", flags: "i", category: "promotions", weight: 80 },
  { pattern: "\\bcoupon\\b", flags: "i", category: "promotions", weight: 75 },
  { pattern: "\\bnewsletter\\b", flags: "i", category: "promotions", weight: 55 },

  { pattern: "\\border\\s+(confirmation|confirmed)\\b", flags: "i", category: "updates", weight: 90 },
  { pattern: "\\bshipping\\s+(confirmation|update)\\b", flags: "i", category: "updates", weight: 90 },
  { pattern: "\\bdelivery\\s+(confirmation|update)\\b", flags: "i", category: "updates", weight: 90 },
  { pattern: "\\breceipt\\b", flags: "i", category: "updates", weight: 80 },
  { pattern: "\\binvoice\\b", flags: "i", category: "updates", weight: 80 },
  { pattern: "\\bpassword\\s+reset\\b", flags: "i", category: "updates", weight: 90 },
  { pattern: "\\bverify\\s+your\\b", flags: "i", category: "updates", weight: 85 },
  { pattern: "\\bsecurity\\s+alert\\b", flags: "i", category: "updates", weight: 90 },
  { pattern: "\\bhas\\s+shipped\\b", flags: "i", category: "updates", weight: 90 },
  { pattern: "\\bout\\s+for\\s+delivery\\b", flags: "i", category: "updates", weight: 95 },

  { pattern: "\\bfriend\\s+request\\b", flags: "i", category: "social", weight: 85 },
  { pattern: "\\btagged\\s+(you|in)\\b", flags: "i", category: "social", weight: 80 },
  { pattern: "\\bmentioned\\s+you\\b", flags: "i", category: "social", weight: 80 },
  { pattern: "\\bnew\\s+follower\\b", flags: "i", category: "social", weight: 85 },

  { pattern: "^\\s*re:\\s*", flags: "i", category: "forums", weight: 40 },
  { pattern: "\\[[\\w-]+\\]\\s*", flags: "i", category: "forums", weight: 50 },
  { pattern: "\\bdigest\\b", flags: "i", category: "forums", weight: 60 },
];

const NOREPLY_PATTERNS = [
  /^no[-_]?reply@/i,
  /^noreply@/i,
  /^do[-_]?not[-_]?reply@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^newsletter@/i,
  /^marketing@/i,
];

const user_preferences = new Map<string, UserPreferenceData>();
const classification_cache = new Map<string, ClassificationResultData>();
const CACHE_MAX_SIZE = 1000;

function extract_domain(email: string): string {
  const at_index = email.lastIndexOf("@");
  if (at_index === -1) return "";
  return email.slice(at_index + 1).toLowerCase();
}

function get_domain_rule(domain: string): DomainRuleData | undefined {
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

function is_automated_sender(email: string): boolean {
  return NOREPLY_PATTERNS.some((pattern) => pattern.test(email));
}

function match_subject_keywords(subject: string): Array<{ category: EmailCategory; weight: number; source: string }> {
  const matches: Array<{ category: EmailCategory; weight: number; source: string }> = [];

  for (const rule of SUBJECT_KEYWORDS) {
    const regex = new RegExp(rule.pattern, rule.flags);
    if (regex.test(subject)) {
      matches.push({ category: rule.category, weight: rule.weight, source: rule.pattern });
    }
  }

  return matches;
}

function classify_internal(input: ClassifyPayload): ClassificationResultData {
  const cached = classification_cache.get(input.id);
  if (cached) return cached;

  const signals: Array<{ type: string; source: string; weight: number }> = [];
  const weights = new Map<EmailCategory, number>();

  const sender_email = input.envelope.from.email.toLowerCase();
  const preference = user_preferences.get(sender_email);
  if (preference) {
    signals.push({ type: "user_correction", source: sender_email, weight: 100 });
    weights.set(preference.assigned_category, 100);
  }

  const domain = extract_domain(sender_email);
  if (domain) {
    const rule = get_domain_rule(domain);
    if (rule) {
      signals.push({ type: "domain_match", source: domain, weight: rule.confidence });
      const current = weights.get(rule.category) ?? 0;
      weights.set(rule.category, Math.max(current, rule.confidence));
    }
  }

  if (is_automated_sender(sender_email)) {
    signals.push({ type: "sender_pattern", source: "automated_sender", weight: 30 });
    for (const category of ["promotions", "updates"] as EmailCategory[]) {
      const current = weights.get(category) ?? 0;
      weights.set(category, current + 15);
    }
  }

  const subject = input.envelope.subject;
  if (subject) {
    const matches = match_subject_keywords(subject);
    for (const match of matches) {
      signals.push({ type: "subject_keyword", source: match.source, weight: match.weight });
      const current = weights.get(match.category) ?? 0;
      weights.set(match.category, current + match.weight);
    }
  }

  if (input.headers?.list_unsubscribe) {
    signals.push({ type: "header_hint", source: "list_unsubscribe", weight: 60 });
    const current = weights.get("promotions") ?? 0;
    weights.set("promotions", current + 60);
  }

  if (input.headers?.precedence?.toLowerCase() === "bulk") {
    signals.push({ type: "header_hint", source: "precedence_bulk", weight: 50 });
    const current = weights.get("promotions") ?? 0;
    weights.set("promotions", current + 50);
  }

  const total_recipients =
    input.envelope.to.length +
    input.envelope.cc.length +
    input.envelope.bcc.length;

  if (total_recipients > 10) {
    signals.push({ type: "recipient_count", source: `${total_recipients}_recipients`, weight: 40 });
    const current = weights.get("forums") ?? 0;
    weights.set("forums", current + 40);
  }

  let max_weight = 0;
  let max_category: EmailCategory = "primary";

  for (const [category, weight] of weights) {
    if (weight > max_weight) {
      max_weight = weight;
      max_category = category;
    }
  }

  const result: ClassificationResultData = {
    category: max_weight >= 50 ? max_category : "primary",
    confidence: Math.min(max_weight, 100),
    signals,
  };

  if (classification_cache.size >= CACHE_MAX_SIZE) {
    const first_key = classification_cache.keys().next().value;
    if (first_key) {
      classification_cache.delete(first_key);
    }
  }
  classification_cache.set(input.id, result);

  return result;
}

function handle_message(message: WorkerMessage): WorkerResponse {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case "classify": {
        const input = payload as ClassifyPayload;
        const result = classify_internal(input);
        return { id, type, payload: result };
      }

      case "classify_batch": {
        const { items } = payload as ClassifyBatchPayload;
        const results = new Map<string, ClassificationResultData>();

        for (const item of items) {
          results.set(item.id, classify_internal(item));
        }

        return { id, type, payload: { results: Object.fromEntries(results) } };
      }

      case "add_preference": {
        const { sender_email, category } = payload as AddPreferencePayload;
        const domain = extract_domain(sender_email);
        const pref: UserPreferenceData = {
          sender_email: sender_email.toLowerCase(),
          sender_domain: domain,
          assigned_category: category,
          created_at: Date.now(),
        };
        user_preferences.set(sender_email.toLowerCase(), pref);
        classification_cache.clear();
        return { id, type, payload: { success: true } };
      }

      case "remove_preference": {
        const { sender_email } = payload as RemovePreferencePayload;
        user_preferences.delete(sender_email.toLowerCase());
        classification_cache.clear();
        return { id, type, payload: { success: true } };
      }

      case "load_preferences": {
        const { preferences } = payload as LoadPreferencesPayload;
        user_preferences.clear();
        for (const pref of preferences) {
          user_preferences.set(pref.sender_email, pref);
        }
        classification_cache.clear();
        return { id, type, payload: { loaded: preferences.length } };
      }

      case "get_preferences": {
        const prefs = Array.from(user_preferences.values());
        return { id, type, payload: { preferences: prefs } };
      }

      case "clear_cache": {
        classification_cache.clear();
        return { id, type, payload: { success: true } };
      }

      default:
        return { id, type, error: `Unknown message type: ${type}` };
    }
  } catch (error) {
    const error_message = error instanceof Error ? error.message : "Unknown error";
    return { id, type, error: error_message };
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const response = handle_message(event.data);
  self.postMessage(response);
};

export type { WorkerMessage, WorkerResponse, ClassificationMessageType };
