import type { EmailCategory } from "@/types/email";
import type {
  ClassificationResult,
  ClassificationInput,
  ClassificationSignal,
  ClassificationConfig,
  ClassificationCache,
  UserCategoryPreference,
} from "./types";

import { DEFAULT_CLASSIFICATION_CONFIG } from "./types";
import {
  get_domain_rule,
  extract_domain,
  is_automated_sender,
  match_subject_keywords,
  match_body_keywords,
  get_category_by_weight,
} from "./rules";

const CLASSIFIER_VERSION = 1;

class InMemoryClassificationCache implements ClassificationCache {
  private cache = new Map<
    string,
    { result: ClassificationResult; timestamp: number }
  >();
  private max_size: number;
  private ttl_ms: number;

  constructor(max_size: number = 1000, ttl_ms: number = 300000) {
    this.max_size = max_size;
    this.ttl_ms = ttl_ms;
  }

  get(email_id: string): ClassificationResult | null {
    const entry = this.cache.get(email_id);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl_ms) {
      this.cache.delete(email_id);

      return null;
    }

    return entry.result;
  }

  set(email_id: string, result: ClassificationResult): void {
    if (this.cache.size >= this.max_size) {
      this.evict_oldest();
    }
    this.cache.set(email_id, { result, timestamp: Date.now() });
  }

  has(email_id: string): boolean {
    return this.get(email_id) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  private evict_oldest(): void {
    let oldest_key: string | null = null;
    let oldest_time = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldest_time) {
        oldest_time = entry.timestamp;
        oldest_key = key;
      }
    }

    if (oldest_key) {
      this.cache.delete(oldest_key);
    }
  }
}

export class EmailClassifier {
  private config: ClassificationConfig;
  private cache: ClassificationCache;
  private user_preferences: Map<string, UserCategoryPreference>;

  constructor(config?: Partial<ClassificationConfig>) {
    this.config = { ...DEFAULT_CLASSIFICATION_CONFIG, ...config };
    this.cache = new InMemoryClassificationCache();
    this.user_preferences = new Map();
  }

  classify(input: ClassificationInput): ClassificationResult {
    const cached = this.cache.get(input.id);

    if (cached) return cached;

    const signals: ClassificationSignal[] = [];
    const weights = new Map<EmailCategory, number>();

    this.apply_user_preferences(input, signals, weights);
    this.apply_domain_rules(input, signals, weights);
    this.apply_sender_patterns(input, signals, weights);
    this.apply_subject_keywords(input, signals, weights);
    this.apply_body_keywords(input, signals, weights);
    this.apply_header_hints(input, signals, weights);
    this.apply_recipient_analysis(input, signals, weights);

    const best = get_category_by_weight(weights, this.config.min_confidence);

    const result: ClassificationResult = {
      category: best?.category ?? this.config.default_category,
      confidence: best?.confidence ?? 0,
      signals,
    };

    this.cache.set(input.id, result);

    return result;
  }

  classify_batch(
    inputs: ClassificationInput[],
  ): Map<string, ClassificationResult> {
    const results = new Map<string, ClassificationResult>();

    for (const input of inputs) {
      results.set(input.id, this.classify(input));
    }

    return results;
  }

  add_user_preference(sender_email: string, category: EmailCategory): void {
    const domain = extract_domain(sender_email);
    const preference: UserCategoryPreference = {
      sender_email: sender_email.toLowerCase(),
      sender_domain: domain,
      assigned_category: category,
      created_at: Date.now(),
    };

    this.user_preferences.set(sender_email.toLowerCase(), preference);
  }

  remove_user_preference(sender_email: string): void {
    this.user_preferences.delete(sender_email.toLowerCase());
  }

  get_user_preferences(): UserCategoryPreference[] {
    return Array.from(this.user_preferences.values());
  }

  load_user_preferences(preferences: UserCategoryPreference[]): void {
    this.user_preferences.clear();
    for (const pref of preferences) {
      this.user_preferences.set(pref.sender_email, pref);
    }
  }

  clear_cache(): void {
    this.cache.clear();
  }

  clear_all(): void {
    this.cache.clear();
    this.user_preferences.clear();
  }

  private apply_user_preferences(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const sender_email = input.envelope.from.email.toLowerCase();
    const preference = this.user_preferences.get(sender_email);

    if (preference) {
      signals.push({
        type: "user_correction",
        source: sender_email,
        weight: 100,
      });
      weights.set(preference.assigned_category, 100);
    }
  }

  private apply_domain_rules(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const domain = extract_domain(input.envelope.from.email);

    if (!domain) return;

    const rule = get_domain_rule(domain);

    if (rule) {
      signals.push({
        type: "domain_match",
        source: domain,
        weight: rule.confidence,
      });
      const current = weights.get(rule.category) ?? 0;

      weights.set(rule.category, Math.max(current, rule.confidence));
    }
  }

  private apply_sender_patterns(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const sender_email = input.envelope.from.email;

    if (is_automated_sender(sender_email)) {
      signals.push({
        type: "sender_pattern",
        source: "automated_sender",
        weight: 30,
      });

      for (const category of ["promotions", "updates"] as EmailCategory[]) {
        const current = weights.get(category) ?? 0;

        weights.set(category, current + 15);
      }
    }
  }

  private apply_subject_keywords(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const subject = input.envelope.subject;

    if (!subject) return;

    const matches = match_subject_keywords(subject);

    for (const match of matches) {
      signals.push({
        type: "subject_keyword",
        source: match.pattern.source,
        weight: match.weight,
      });
      const current = weights.get(match.category) ?? 0;

      weights.set(match.category, current + match.weight);
    }
  }

  private apply_body_keywords(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const body = input.envelope.body_text;

    if (!body) return;

    const preview = body.slice(0, 5000);
    const matches = match_body_keywords(preview);

    for (const match of matches) {
      signals.push({
        type: "body_keyword",
        source: match.pattern.source,
        weight: match.weight,
      });
      const current = weights.get(match.category) ?? 0;

      weights.set(match.category, current + match.weight);
    }
  }

  private apply_header_hints(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const headers = input.headers;

    if (!headers) return;

    if (headers.list_unsubscribe) {
      signals.push({
        type: "header_hint",
        source: "list_unsubscribe",
        weight: 60,
      });
      const current = weights.get("promotions") ?? 0;

      weights.set("promotions", current + 60);
    }

    if (headers.precedence?.toLowerCase() === "bulk") {
      signals.push({
        type: "header_hint",
        source: "precedence_bulk",
        weight: 50,
      });
      const current = weights.get("promotions") ?? 0;

      weights.set("promotions", current + 50);
    }
  }

  private apply_recipient_analysis(
    input: ClassificationInput,
    signals: ClassificationSignal[],
    weights: Map<EmailCategory, number>,
  ): void {
    const total_recipients =
      input.envelope.to.length +
      input.envelope.cc.length +
      input.envelope.bcc.length;

    if (total_recipients > 10) {
      signals.push({
        type: "recipient_count",
        source: `${total_recipients}_recipients`,
        weight: 40,
      });
      const current = weights.get("forums") ?? 0;

      weights.set("forums", current + 40);
    }
  }
}

let classifier_instance: EmailClassifier | null = null;

export function get_classifier(): EmailClassifier {
  if (!classifier_instance) {
    classifier_instance = new EmailClassifier();
  }

  return classifier_instance;
}

export function reset_classifier(): void {
  if (classifier_instance) {
    classifier_instance.clear_all();
  }
  classifier_instance = null;
}

export function classify_email(
  input: ClassificationInput,
): ClassificationResult {
  return get_classifier().classify(input);
}

export function classify_emails(
  inputs: ClassificationInput[],
): Map<string, ClassificationResult> {
  return get_classifier().classify_batch(inputs);
}

export { CLASSIFIER_VERSION };
