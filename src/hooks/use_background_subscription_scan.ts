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
  CachedSubscription,
  SubscriptionCacheData,
  SubscriptionCacheCategory,
} from "@/services/subscription_cache";

import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";

import { MAIL_EVENTS } from "@/hooks/mail_events";
import { use_auth } from "@/contexts/auth_context";
import {
  load_subscription_cache,
  save_subscription_cache,
  SUBSCRIPTION_CACHE_VERSION,
} from "@/services/subscription_cache";
import { list_mail_items } from "@/services/api/mail";
import type { MailItem } from "@/services/api/mail";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  detect_unsubscribe_info,
  get_sender_domain,
} from "@/utils/unsubscribe_detector";
import { has_protected_folder_label } from "@/hooks/use_folders";

interface ScanEnvelope {
  from?: { name?: string; email?: string };
  list_unsubscribe?: string;
  list_unsubscribe_post?: string;
  body_html?: string;
  body_text?: string;
}

const SCAN_COOLDOWN_MS = 5 * 60 * 1000;
const DECRYPT_CONCURRENCY = 8;
const SCAN_IDLE_TIMEOUT_MS = 10000;

const SYSTEM_DOMAINS = ["astermail.org", "astermail.com"];

const NEWSLETTER_DOMAINS = [
  "substack.com",
  "mailchimp.com",
  "sendgrid.net",
  "constantcontact.com",
  "mailgun.net",
  "sendinblue.com",
  "mailjet.com",
  "campaign-archive.com",
];

const MARKETING_DOMAINS = [
  "amazonses.com",
  "salesforce.com",
  "hubspot.com",
  "marketo.com",
  "pardot.com",
  "eloqua.com",
];

const SOCIAL_DOMAINS = [
  "facebookmail.com",
  "twitter.com",
  "linkedin.com",
  "instagram.com",
  "tiktok.com",
  "reddit.com",
  "discord.com",
];

const TRANSACTIONAL_KEYWORDS = [
  "receipt",
  "order",
  "confirmation",
  "shipping",
  "tracking",
  "invoice",
  "payment",
  "password",
  "verify",
  "security",
];

function is_system_email(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || "";

  return SYSTEM_DOMAINS.some((d) => domain === d);
}

function categorize_sender(
  domain: string,
  sender_name: string,
  has_list_unsubscribe: boolean,
): SubscriptionCacheCategory {
  const domain_lower = domain.toLowerCase();
  const name_lower = sender_name.toLowerCase();

  if (NEWSLETTER_DOMAINS.some((d) => domain_lower.includes(d)))
    return "newsletter";
  if (MARKETING_DOMAINS.some((d) => domain_lower.includes(d)))
    return "marketing";
  if (SOCIAL_DOMAINS.some((d) => domain_lower.includes(d))) return "social";
  if (TRANSACTIONAL_KEYWORDS.some((k) => name_lower.includes(k)))
    return "transactional";

  if (has_list_unsubscribe) {
    if (
      name_lower.includes("newsletter") ||
      name_lower.includes("digest") ||
      name_lower.includes("weekly")
    )
      return "newsletter";
    if (
      name_lower.includes("promo") ||
      name_lower.includes("offer") ||
      name_lower.includes("deal")
    )
      return "marketing";
  }

  return "unknown";
}

export function should_run_full_scan(
  cached: SubscriptionCacheData | null,
): boolean {
  if (!cached) return true;

  const has_watermark = !!(cached.last_scan_ts || cached.last_scan_message_ts);

  return !has_watermark && cached.subscriptions.length === 0;
}

export interface ScanPageSelection {
  fresh_items: MailItem[];
  stop: boolean;
}

export function select_fresh_scan_items(
  items: MailItem[],
  last_scan_ts: string,
  last_scan_message_ts: string,
): ScanPageSelection {
  if (!last_scan_ts) return { fresh_items: items, stop: false };

  const fresh_items: MailItem[] = [];
  let stop = false;

  for (const item of items) {
    const sort_ts = item.message_ts || item.created_at;

    if (
      last_scan_message_ts &&
      sort_ts <= last_scan_message_ts &&
      item.created_at <= last_scan_ts
    ) {
      stop = true;
      break;
    }

    if (item.created_at > last_scan_ts) fresh_items.push(item);
  }

  if (!last_scan_message_ts && fresh_items.length === 0) stop = true;

  return { fresh_items, stop };
}

async function run_background_scan(
  vault: NonNullable<ReturnType<typeof use_auth>["vault"]>,
): Promise<void> {
  const raw_cached = await load_subscription_cache(vault);

  const is_outdated =
    raw_cached && raw_cached.version !== SUBSCRIPTION_CACHE_VERSION;
  const cached = is_outdated ? null : raw_cached;

  const existing_map = new Map<string, CachedSubscription>();

  if (cached) {
    for (const sub of cached.subscriptions) {
      existing_map.set(sub.sender_email, sub);
    }
  }

  const should_full_scan = should_run_full_scan(cached);
  const last_scan_ts = should_full_scan ? "" : cached?.last_scan_ts || "";
  const last_scan_message_ts = should_full_scan
    ? ""
    : cached?.last_scan_message_ts || "";
  let max_processed_ts = "";
  let max_processed_message_ts = "";

  const sender_counts = new Map<
    string,
    {
      email: string;
      name: string;
      domain: string;
      count: number;
      last_received: string;
      unsubscribe_link?: string;
      list_unsubscribe_header?: string;
      list_unsubscribe_post?: string;
      has_one_click: boolean;
      category: SubscriptionCacheCategory;
    }
  >();

  let cursor: string | undefined;
  let has_next = true;
  let aborted = false;

  while (has_next) {
    const { data, error } = await list_mail_items({
      item_type: "received",
      limit: 200,
      cursor,
    });

    if (error || !data) {
      aborted = true;
      break;
    }

    const { items, has_more, next_cursor } = data;

    const { fresh_items, stop } = select_fresh_scan_items(
      items,
      last_scan_ts,
      last_scan_message_ts,
    );

    const scannable = fresh_items.filter(
      (item) => !has_protected_folder_label(item.labels),
    );

    for (const item of scannable) {
      if (item.created_at > max_processed_ts) {
        max_processed_ts = item.created_at;
      }

      const sort_ts = item.message_ts || item.created_at;

      if (sort_ts > max_processed_message_ts) {
        max_processed_message_ts = sort_ts;
      }
    }

    for (
      let start = 0;
      start < scannable.length;
      start += DECRYPT_CONCURRENCY
    ) {
      const batch = scannable.slice(start, start + DECRYPT_CONCURRENCY);
      const envelopes = await Promise.all(
        batch.map((item) =>
          decrypt_mail_envelope<ScanEnvelope>(
            item.encrypted_envelope,
            item.envelope_nonce,
            item.id,
          ).catch(() => null),
        ),
      );

      for (let index = 0; index < batch.length; index++) {
        const item = batch[index];
        const envelope = envelopes[index];

        try {
          if (!envelope?.from?.email) continue;

          const email = envelope.from.email.toLowerCase();

          if (is_system_email(email)) continue;

          const domain = get_sender_domain(email);

          const unsubscribe_info = detect_unsubscribe_info(
            envelope.body_html,
            envelope.body_text,
            {
              list_unsubscribe: envelope.list_unsubscribe,
              list_unsubscribe_post: envelope.list_unsubscribe_post,
            },
          );

          const existing = sender_counts.get(email);

          if (existing) {
            existing.count++;
            if (item.created_at > existing.last_received) {
              existing.last_received = item.created_at;
            }
            if (
              !existing.unsubscribe_link &&
              unsubscribe_info.unsubscribe_link
            ) {
              existing.unsubscribe_link = unsubscribe_info.unsubscribe_link;
            }
            if (
              !existing.list_unsubscribe_header &&
              unsubscribe_info.list_unsubscribe_header
            ) {
              existing.list_unsubscribe_header =
                unsubscribe_info.list_unsubscribe_header;
            }
            if (
              !existing.list_unsubscribe_post &&
              unsubscribe_info.list_unsubscribe_post
            ) {
              existing.list_unsubscribe_post =
                unsubscribe_info.list_unsubscribe_post;
            }
            if (unsubscribe_info.method === "one-click") {
              existing.has_one_click = true;
            }
          } else {
            const category = categorize_sender(
              domain,
              envelope.from.name || email,
              unsubscribe_info.has_unsubscribe,
            );

            sender_counts.set(email, {
              email,
              name: envelope.from.name || "",
              domain,
              count: 1,
              last_received: item.created_at,
              unsubscribe_link: unsubscribe_info.unsubscribe_link,
              list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
              list_unsubscribe_post: unsubscribe_info.list_unsubscribe_post,
              has_one_click: unsubscribe_info.method === "one-click",
              category,
            });
          }
        } catch {
          continue;
        }
      }
    }

    if (stop) break;

    has_next = has_more && !!next_cursor;
    cursor = next_cursor;
  }

  if (aborted) return;

  for (const [email, sender] of sender_counts) {
    const has_unsub_mechanism =
      sender.has_one_click ||
      !!sender.unsubscribe_link ||
      !!sender.list_unsubscribe_header;

    if (!has_unsub_mechanism) continue;

    const existing = existing_map.get(email);

    if (existing) {
      existing_map.set(email, {
        ...existing,
        email_count: existing.email_count + sender.count,
        last_received:
          sender.last_received > existing.last_received
            ? sender.last_received
            : existing.last_received,
        sender_name: sender.name || existing.sender_name,
        unsubscribe_link: sender.unsubscribe_link || existing.unsubscribe_link,
        list_unsubscribe_header:
          sender.list_unsubscribe_header || existing.list_unsubscribe_header,
        list_unsubscribe_post:
          sender.list_unsubscribe_post || existing.list_unsubscribe_post,
        has_one_click: sender.has_one_click || existing.has_one_click,
        category:
          existing.category === "unknown" ? sender.category : existing.category,
      });
    } else {
      existing_map.set(email, {
        sender_email: email,
        sender_name: sender.name,
        domain: sender.domain,
        email_count: sender.count,
        last_received: sender.last_received,
        unsubscribe_link: sender.unsubscribe_link,
        list_unsubscribe_header: sender.list_unsubscribe_header,
        list_unsubscribe_post: sender.list_unsubscribe_post,
        has_one_click: sender.has_one_click,
        category: sender.category,
        status: "active",
      });
    }
  }

  if (!max_processed_ts && existing_map.size === 0) return;

  const new_cache: SubscriptionCacheData = {
    subscriptions: Array.from(existing_map.values()),
    last_scan_ts: max_processed_ts || cached?.last_scan_ts || "",
    last_scan_message_ts:
      max_processed_message_ts || cached?.last_scan_message_ts || "",
    version: SUBSCRIPTION_CACHE_VERSION,
  };

  await save_subscription_cache(new_cache, vault);
}

let scan_in_flight = false;
const scan_in_flight_subscribers = new Set<() => void>();

function set_scan_in_flight(value: boolean): void {
  if (scan_in_flight === value) return;
  scan_in_flight = value;
  scan_in_flight_subscribers.forEach((notify) => notify());
}

function subscribe_scan_in_flight(notify: () => void): () => void {
  scan_in_flight_subscribers.add(notify);

  return () => {
    scan_in_flight_subscribers.delete(notify);
  };
}

export function use_subscription_scan_in_flight(): boolean {
  return useSyncExternalStore(
    subscribe_scan_in_flight,
    () => scan_in_flight,
    () => false,
  );
}

export function use_background_subscription_scan(): void {
  const { vault } = use_auth();
  const has_started_ref = useRef(false);
  const is_scanning_ref = useRef(false);
  const last_scan_completed_at_ref = useRef(0);

  const trigger_scan = useCallback(
    (respect_cooldown = false) => {
      if (!vault || is_scanning_ref.current) return;
      if (
        respect_cooldown &&
        last_scan_completed_at_ref.current > 0 &&
        Date.now() - last_scan_completed_at_ref.current < SCAN_COOLDOWN_MS
      ) {
        return;
      }
      is_scanning_ref.current = true;
      set_scan_in_flight(true);

      run_background_scan(vault)
        .catch(() => {})
        .finally(() => {
          is_scanning_ref.current = false;
          set_scan_in_flight(false);
          last_scan_completed_at_ref.current = Date.now();
        });
    },
    [vault],
  );

  useEffect(() => {
    if (!vault) return;
    if (has_started_ref.current) return;
    has_started_ref.current = true;
    set_scan_in_flight(true);

    let idle_handle: number | null = null;

    const timeout_id = setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        idle_handle = requestIdleCallback(() => trigger_scan(), {
          timeout: SCAN_IDLE_TIMEOUT_MS,
        });

        return;
      }

      trigger_scan();
    }, 3000);

    return () => {
      clearTimeout(timeout_id);
      if (idle_handle !== null && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idle_handle);
      }
      if (!is_scanning_ref.current) set_scan_in_flight(false);
    };
  }, [vault, trigger_scan]);

  useEffect(() => {
    if (!vault) return;

    let scan_timeout: ReturnType<typeof setTimeout> | null = null;

    const handle_new_email = () => {
      if (scan_timeout) clearTimeout(scan_timeout);
      scan_timeout = setTimeout(() => trigger_scan(true), 5000);
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_new_email);

    return () => {
      if (scan_timeout) clearTimeout(scan_timeout);
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_new_email);
    };
  }, [vault, trigger_scan]);
}
