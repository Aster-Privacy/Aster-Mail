import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import type {
  EmailCategory,
  DecryptedEnvelope,
  InboxEmail,
} from "@/types/email";
import type {
  ClassificationResult,
  EmailHeaders,
} from "@/services/classification/types";
import {
  get_classification_worker,
  classify_with_worker,
  classify_batch_with_worker,
} from "@/services/classification/worker_client";
import {
  generate_all_category_tokens,
  get_token_for_category,
} from "@/services/classification/tokens";

const ALL_CATEGORIES: EmailCategory[] = [
  "primary",
  "social",
  "promotions",
  "updates",
  "forums",
];

interface CategoryConfig {
  id: EmailCategory;
  label: string;
  icon: string;
  enabled: boolean;
}

const DEFAULT_CATEGORY_CONFIGS: CategoryConfig[] = [
  { id: "primary", label: "Primary", icon: "inbox", enabled: true },
  { id: "social", label: "Social", icon: "users", enabled: true },
  { id: "promotions", label: "Promotions", icon: "tag", enabled: true },
  { id: "updates", label: "Updates", icon: "bell", enabled: true },
  { id: "forums", label: "Forums", icon: "message-square", enabled: true },
];

interface UseCategoriesOptions {
  enabled?: boolean;
  auto_classify?: boolean;
}

interface UseCategoriesReturn {
  active_category: EmailCategory | "all";
  set_active_category: (category: EmailCategory | "all") => void;

  categories: CategoryConfig[];
  enabled_categories: CategoryConfig[];

  unread_counts: Record<EmailCategory, number>;
  update_unread_counts: (emails: InboxEmail[]) => void;

  classify_email: (
    id: string,
    envelope: DecryptedEnvelope,
    headers?: EmailHeaders,
  ) => Promise<ClassificationResult>;
  classify_emails: (
    items: Array<{
      id: string;
      envelope: DecryptedEnvelope;
      headers?: EmailHeaders;
    }>,
  ) => Promise<Map<string, ClassificationResult>>;

  override_category: (
    email_id: string,
    sender_email: string,
    category: EmailCategory,
  ) => Promise<void>;
  remove_override: (sender_email: string) => Promise<void>;

  filter_by_category: (
    emails: InboxEmail[],
    category: EmailCategory | "all",
  ) => InboxEmail[];

  get_category_token: (category: EmailCategory) => Promise<string>;
  get_all_tokens: () => Promise<Map<EmailCategory, string>>;

  pending_count: number;
  is_classifying: boolean;

  clear_cache: () => Promise<void>;
}

export function use_categories(
  options: UseCategoriesOptions = {},
): UseCategoriesReturn {
  const { enabled = true, auto_classify: _auto_classify = true } = options;

  const [active_category, set_active_category] = useState<EmailCategory | "all">(
    "all",
  );
  const [categories] = useState<CategoryConfig[]>(DEFAULT_CATEGORY_CONFIGS);
  const [unread_counts, set_unread_counts] = useState<
    Record<EmailCategory, number>
  >({
    primary: 0,
    social: 0,
    promotions: 0,
    updates: 0,
    forums: 0,
  });
  const [pending_count, set_pending_count] = useState(0);
  const [is_classifying, set_is_classifying] = useState(false);

  const batch_timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled_categories = useMemo(
    () => categories.filter((c) => c.enabled),
    [categories],
  );

  const update_unread_counts = useCallback((emails: InboxEmail[]) => {
    const counts: Record<EmailCategory, number> = {
      primary: 0,
      social: 0,
      promotions: 0,
      updates: 0,
      forums: 0,
    };

    for (const email of emails) {
      if (email.is_read) continue;

      const category = email.email_category ?? "primary";
      if (category in counts) {
        counts[category]++;
      }
    }

    set_unread_counts(counts);
  }, []);

  const classify_email = useCallback(
    async (
      id: string,
      envelope: DecryptedEnvelope,
      headers?: EmailHeaders,
    ): Promise<ClassificationResult> => {
      if (!enabled) {
        return { category: "primary", confidence: 0, signals: [] };
      }

      set_is_classifying(true);
      try {
        const result = await classify_with_worker(id, envelope, headers);
        return result;
      } finally {
        set_is_classifying(false);
      }
    },
    [enabled],
  );

  const classify_emails = useCallback(
    async (
      items: Array<{
        id: string;
        envelope: DecryptedEnvelope;
        headers?: EmailHeaders;
      }>,
    ): Promise<Map<string, ClassificationResult>> => {
      if (!enabled || items.length === 0) {
        return new Map();
      }

      set_is_classifying(true);
      set_pending_count(items.length);

      try {
        const results = await classify_batch_with_worker(items);
        return results;
      } finally {
        set_is_classifying(false);
        set_pending_count(0);
      }
    },
    [enabled],
  );

  const override_category = useCallback(
    async (
      _email_id: string,
      sender_email: string,
      category: EmailCategory,
    ): Promise<void> => {
      const worker = get_classification_worker();
      await worker.add_preference(sender_email, category);
    },
    [],
  );

  const remove_override = useCallback(
    async (sender_email: string): Promise<void> => {
      const worker = get_classification_worker();
      await worker.remove_preference(sender_email);
    },
    [],
  );

  const filter_by_category = useCallback(
    (emails: InboxEmail[], category: EmailCategory | "all"): InboxEmail[] => {
      if (!enabled || category === "all") {
        return emails;
      }

      return emails.filter((email) => {
        const email_category = email.email_category ?? "primary";
        return email_category === category;
      });
    },
    [enabled],
  );

  const get_category_token = useCallback(
    async (category: EmailCategory): Promise<string> => {
      return get_token_for_category(category);
    },
    [],
  );

  const get_all_tokens = useCallback(async (): Promise<
    Map<EmailCategory, string>
  > => {
    return generate_all_category_tokens();
  }, []);

  const clear_cache = useCallback(async (): Promise<void> => {
    const worker = get_classification_worker();
    await worker.clear_cache();
  }, []);

  useEffect(() => {
    return () => {
      if (batch_timeout.current) {
        clearTimeout(batch_timeout.current);
      }
    };
  }, []);

  return {
    active_category,
    set_active_category,
    categories,
    enabled_categories,
    unread_counts,
    update_unread_counts,
    classify_email,
    classify_emails,
    override_category,
    remove_override,
    filter_by_category,
    get_category_token,
    get_all_tokens,
    pending_count,
    is_classifying,
    clear_cache,
  };
}

export function get_category_for_email(email: InboxEmail): EmailCategory {
  return email.email_category ?? "primary";
}

export function is_valid_category(category: string): category is EmailCategory {
  return ALL_CATEGORIES.includes(category as EmailCategory);
}

export { ALL_CATEGORIES, DEFAULT_CATEGORY_CONFIGS };
export type { CategoryConfig, UseCategoriesReturn };
