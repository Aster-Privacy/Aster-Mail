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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import type {
  CachedSubscription,
  SubscriptionCacheData,
  SubscriptionCacheCategory,
} from "@/services/subscription_cache";

import { useEffect, useRef, useCallback } from "react";

import { MAIL_EVENTS } from "@/hooks/mail_events";
import { use_auth } from "@/contexts/auth_context";
import {
  load_subscription_cache,
  save_subscription_cache,
  SUBSCRIPTION_CACHE_VERSION,
} from "@/services/subscription_cache";
import { list_mail_items } from "@/services/api/mail";
import {
  base64_to_array,
  decrypt_envelope_with_bytes,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
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

const HASH_ALG = "SHA-256";
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];

async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<ScanEnvelope | null> {
  const encrypted_bytes = base64_to_array(encrypted);

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await decrypt_aes_gcm_with_fallback(crypto_key, encrypted_bytes, nonce_bytes);

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch {
      continue;
    }
  }

  return null;
}

async function decrypt_scan_envelope(
  encrypted: string,
  nonce: string,
): Promise<ScanEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as ScanEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<ScanEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

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

  const should_full_scan = !cached || cached.subscriptions.length === 0;
  const last_scan_ts = should_full_scan ? "" : cached?.last_scan_ts || "";
  let max_processed_ts = "";

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

  while (has_next) {
    const { data, error } = await list_mail_items({
      item_type: "received",
      limit: 200,
      cursor,
    });

    if (error || !data) break;

    const { items, has_more, next_cursor } = data;

    for (const item of items) {
      if (last_scan_ts && item.created_at <= last_scan_ts) continue;
      if (has_protected_folder_label(item.labels)) continue;

      if (item.created_at > max_processed_ts) {
        max_processed_ts = item.created_at;
      }

      try {
        const envelope = await decrypt_scan_envelope(
          item.encrypted_envelope,
          item.envelope_nonce,
        );

        if (envelope?.from?.email) {
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
        }
      } catch {}
    }

    has_next = has_more && !!next_cursor;
    cursor = next_cursor;
  }

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
    version: SUBSCRIPTION_CACHE_VERSION,
  };

  await save_subscription_cache(new_cache, vault);
}

export function use_background_subscription_scan(): void {
  const { vault } = use_auth();
  const has_started_ref = useRef(false);
  const is_scanning_ref = useRef(false);

  const trigger_scan = useCallback(() => {
    if (!vault || is_scanning_ref.current) return;
    is_scanning_ref.current = true;

    run_background_scan(vault)
      .catch(() => {})
      .finally(() => {
        is_scanning_ref.current = false;
      });
  }, [vault]);

  useEffect(() => {
    if (!vault) return;
    if (has_started_ref.current) return;
    has_started_ref.current = true;

    const timeout_id = setTimeout(trigger_scan, 3000);

    return () => {
      clearTimeout(timeout_id);
    };
  }, [vault, trigger_scan]);

  useEffect(() => {
    if (!vault) return;

    let scan_timeout: ReturnType<typeof setTimeout> | null = null;

    const handle_new_email = () => {
      if (scan_timeout) clearTimeout(scan_timeout);
      scan_timeout = setTimeout(trigger_scan, 5000);
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_new_email);

    return () => {
      if (scan_timeout) clearTimeout(scan_timeout);
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_new_email);
    };
  }, [vault, trigger_scan]);
}
