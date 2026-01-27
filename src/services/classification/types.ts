import type { EmailCategory, DecryptedEnvelope } from "@/types/email";

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  signals: ClassificationSignal[];
}

export interface ClassificationSignal {
  type: SignalType;
  source: string;
  weight: number;
}

export type SignalType =
  | "domain_match"
  | "sender_pattern"
  | "subject_keyword"
  | "body_keyword"
  | "header_hint"
  | "recipient_count"
  | "user_correction";

export interface DomainRule {
  domain: string;
  category: EmailCategory;
  confidence: number;
}

export interface KeywordRule {
  pattern: RegExp;
  category: EmailCategory;
  weight: number;
  field: "subject" | "body" | "both";
}

export interface ClassificationInput {
  id: string;
  envelope: DecryptedEnvelope;
  headers?: EmailHeaders;
}

export interface EmailHeaders {
  list_unsubscribe?: string;
  precedence?: string;
  x_mailer?: string;
  content_type?: string;
}

export interface CategoryToken {
  category: EmailCategory;
  token: string;
}

export interface ClassificationState {
  pending_ids: Set<string>;
  classified_ids: Set<string>;
  failed_ids: Map<string, number>;
}

export interface ClassificationConfig {
  batch_size: number;
  batch_delay_ms: number;
  max_concurrent: number;
  min_confidence: number;
  default_category: EmailCategory;
}

export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  batch_size: 10,
  batch_delay_ms: 100,
  max_concurrent: 3,
  min_confidence: 50,
  default_category: "primary",
};

export interface UserCategoryPreference {
  sender_email: string;
  sender_domain: string;
  assigned_category: EmailCategory;
  created_at: number;
}

export interface ClassificationCache {
  get: (email_id: string) => ClassificationResult | null;
  set: (email_id: string, result: ClassificationResult) => void;
  has: (email_id: string) => boolean;
  clear: () => void;
}
