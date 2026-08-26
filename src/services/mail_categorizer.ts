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
  DecryptedEnvelope,
  EmailCategory,
  MailItemMetadata,
} from "@/types/email";
import type { CustomCategoryRule } from "@/data/category_catalog";
import type { SenderTrustSource } from "@/lib/utils";

import { get_sender_domain } from "@/utils/unsubscribe_detector";
import { is_official_sender } from "@/lib/utils";
import {
  ASTER_DOMAIN_SUFFIXES,
  SOCIAL_DOMAIN_SUFFIXES,
  FORUM_DOMAIN_SUFFIXES,
  FINANCE_DOMAIN_SUFFIXES,
  TRAVEL_DOMAIN_SUFFIXES,
  SHOPPING_DOMAIN_SUFFIXES,
  UPDATES_DOMAIN_SUFFIXES,
  MARKETING_DOMAIN_SUFFIXES,
  BULK_INFRA_DOMAIN_SUFFIXES,
  BULK_SENDER_LOCALPARTS,
  PROMOTIONS_SUBJECT_PATTERNS,
  UPDATES_SUBJECT_PATTERNS,
  FINANCE_SUBJECT_PATTERNS,
  TRAVEL_SUBJECT_PATTERNS,
  SHOPPING_SUBJECT_PATTERNS,
} from "@/data/category_signals";
import { BUILTIN_CATEGORY_IDS, fold_builtin } from "@/data/category_catalog";

export const CLASSIFIER_VERSION = 3;

export const CATEGORY_TABS: readonly EmailCategory[] = [
  "primary",
  "promotions",
  "social",
  "updates",
];

const UPDATES_LOCALPARTS = new Set([
  "receipts",
  "receipt",
  "billing",
  "invoice",
  "invoices",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "security",
  "orders",
  "order",
  "statements",
  "statement",
]);

const PROMO_LOCALPARTS = new Set([
  "marketing",
  "offers",
  "deals",
  "promo",
  "promotions",
  "news",
  "newsletter",
  "newsletters",
]);

// Sets are built once. domain_in_set walks parent domains (a.b.c -> b.c -> c),
// so it is O(labels) per lookup regardless of list size and matches subdomains.
const ASTER_SET = new Set(ASTER_DOMAIN_SUFFIXES);
const SOCIAL_SET = new Set(SOCIAL_DOMAIN_SUFFIXES);
const FORUM_SET = new Set(FORUM_DOMAIN_SUFFIXES);
const FINANCE_SET = new Set(FINANCE_DOMAIN_SUFFIXES);
const TRAVEL_SET = new Set(TRAVEL_DOMAIN_SUFFIXES);
const SHOPPING_SET = new Set(SHOPPING_DOMAIN_SUFFIXES);
const UPDATES_SET = new Set(UPDATES_DOMAIN_SUFFIXES);
const MARKETING_SET = new Set(MARKETING_DOMAIN_SUFFIXES);
const BULK_INFRA_SET = new Set(BULK_INFRA_DOMAIN_SUFFIXES);
const BULK_LOCALPARTS_SET = new Set(BULK_SENDER_LOCALPARTS);
const BUILTIN_CATEGORY_ID_SET = new Set(BUILTIN_CATEGORY_IDS);

function domain_in_set(domain: string, set: Set<string>): boolean {
  let current = domain;

  while (current) {
    if (set.has(current)) return true;
    const dot = current.indexOf(".");

    if (dot === -1) return false;
    current = current.slice(dot + 1);
  }

  return false;
}

function get_localpart(email: string): string {
  const at = email.indexOf("@");

  return (at === -1 ? email : email.slice(0, at)).toLowerCase();
}

function domain_of_value(value: string): string {
  const match = value.match(/@([^@>\s]+)/);

  return match ? match[1].toLowerCase().replace(/[.>]+$/, "") : "";
}

const MAX_HEADER_VALUE = 2048;
const MAX_SUBJECT = 512;

function dkim_domain(headers: Map<string, string>): string {
  const sig = headers.get("dkim-signature") || "";
  // d= is a DKIM tag; its value ends at the next ';' or whitespace (RFC 6376).
  const match = sig.match(/(?:^|;)\s*d=\s*([^;\s]+)/i);

  return match ? match[1].toLowerCase().replace(/[.>]+$/, "") : "";
}

function build_header_lookup(
  raw_headers?: { name: string; value: string }[],
): Map<string, string> {
  const lookup = new Map<string, string>();

  if (!raw_headers) return lookup;

  for (const header of raw_headers) {
    if (header?.name) {
      // Bound attacker-controlled header length before any regex matching.
      lookup.set(
        header.name.toLowerCase(),
        (header.value || "").slice(0, MAX_HEADER_VALUE),
      );
    }
  }

  return lookup;
}

function matches_any(text: string, patterns: readonly RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

function match_custom_category(
  auth_domains: string[],
  subject: string,
  custom_categories?: readonly CustomCategoryRule[] | null,
): string | null {
  if (!custom_categories || custom_categories.length === 0) return null;

  const lower_subject = subject.toLowerCase();

  for (const rule of custom_categories) {
    if (!rule.enabled) continue;

    const domain_match = rule.match_domains.some((suffix) =>
      auth_domains.some((d) => domain_in_set(d, new Set([suffix]))),
    );

    if (domain_match) return rule.id;

    const keyword_match = rule.match_keywords.some((keyword) =>
      lower_subject.includes(keyword),
    );

    if (keyword_match) return rule.id;
  }

  return null;
}

export interface ClassifyOptions {
  custom_categories?: readonly CustomCategoryRule[] | null;
  rule_category?: string | null;
  trust?: SenderTrustSource | null;
}

let active_custom_categories: readonly CustomCategoryRule[] = [];

export function set_active_custom_categories(
  rules: readonly CustomCategoryRule[],
): void {
  active_custom_categories = rules;
}

function resolve_rule_category(
  rule_category: string | null | undefined,
  custom_categories?: readonly CustomCategoryRule[] | null,
): EmailCategory | null {
  if (!rule_category) return null;
  if (BUILTIN_CATEGORY_ID_SET.has(rule_category)) return rule_category;

  const custom = custom_categories?.some(
    (rule) => rule.id === rule_category && rule.enabled,
  );

  return custom ? rule_category : null;
}

export function is_locked_to_primary(
  envelope: DecryptedEnvelope,
  trust?: SenderTrustSource | null,
): boolean {
  const email = envelope.from?.email || "";

  return (
    domain_in_set(get_sender_domain(email), ASTER_SET) &&
    is_official_sender({
      ...(trust ?? {}),
      sender_email: email,
      sender_verification: envelope.sender_verification,
    })
  );
}

export function classify(
  envelope: DecryptedEnvelope,
  metadata?: MailItemMetadata | null,
  options?: ClassifyOptions,
): EmailCategory {
  if (is_locked_to_primary(envelope, options?.trust)) return "primary";

  if (metadata?.category_pinned && metadata.category) {
    return metadata.category;
  }

  const rules = options?.custom_categories ?? active_custom_categories;
  const email = envelope.from?.email || "";
  const from_domain = get_sender_domain(email);

  if (
    domain_in_set(from_domain, ASTER_SET) &&
    envelope.sender_verification !== "invalid"
  ) {
    return "primary";
  }

  const from_rule = resolve_rule_category(options?.rule_category, rules);

  if (from_rule) return from_rule;

  const localpart = get_localpart(email);
  const subject = (envelope.subject || "").slice(0, MAX_SUBJECT);
  const headers = build_header_lookup(envelope.raw_headers);
  const precedence = (headers.get("precedence") || "").toLowerCase();

  // Collect the domains that actually authenticated / sent this message so a
  // brand mailing through an ESP (visible From is the brand, but DKIM d= /
  // Return-Path is the ESP) is still detected correctly.
  const auth_domains = [from_domain];
  const dkim = dkim_domain(headers);

  if (dkim) auth_domains.push(dkim);
  const return_path = domain_of_value(headers.get("return-path") || "");

  if (return_path) auth_domains.push(return_path);
  const sender_domain = domain_of_value(headers.get("sender") || "");

  if (sender_domain) auth_domains.push(sender_domain);

  const in_any = (set: Set<string>): boolean =>
    auth_domains.some((d) => domain_in_set(d, set));

  // 1b. User-defined custom categories take priority over every built-in
  //     bucket below, since the user explicitly asked for this sender/subject
  //     to land somewhere specific.
  const custom_match = match_custom_category(auth_domains, subject, rules);

  if (custom_match) {
    return custom_match;
  }

  // 2. Social networks - reliable, unambiguous sender-domain signal.
  if (domain_in_set(from_domain, SOCIAL_SET)) {
    return "social";
  }

  // 2b. Finance / travel / shopping - reliable sender-domain whitelists for
  //     opt-in built-in categories. Domains here are unambiguous (a real bank,
  //     airline, or retailer never also sends social/forum mail), so this is
  //     safe to check unconditionally, before the automated/bulk heuristics.
  if (in_any(FINANCE_SET) && matches_any(subject, FINANCE_SUBJECT_PATTERNS)) {
    return "finance";
  }

  if (domain_in_set(from_domain, FINANCE_SET)) {
    return "finance";
  }

  if (in_any(TRAVEL_SET) && matches_any(subject, TRAVEL_SUBJECT_PATTERNS)) {
    return "travel";
  }

  if (domain_in_set(from_domain, TRAVEL_SET)) {
    return "travel";
  }

  if (in_any(SHOPPING_SET) && matches_any(subject, SHOPPING_SUBJECT_PATTERNS)) {
    return "shopping";
  }

  // 3. Mailing lists / forums - reliable header signal (folded into Updates).
  const has_list_headers =
    headers.has("list-id") ||
    headers.has("list-post") ||
    headers.has("mailing-list");

  if (has_list_headers || domain_in_set(from_domain, FORUM_SET)) {
    return "forums";
  }

  // 4. Is this bulk / automated at all? Personal, human-sent mail has none of
  //    these markers and must NEVER be pulled out of Primary. Precision guard.
  const has_unsubscribe =
    !!envelope.list_unsubscribe ||
    !!envelope.list_unsubscribe_post ||
    headers.has("list-unsubscribe");
  const auto_submitted = (headers.get("auto-submitted") || "").toLowerCase();
  const bulk_precedence =
    precedence === "bulk" ||
    precedence === "list" ||
    precedence === "auto_replied";
  const is_automated =
    has_unsubscribe ||
    bulk_precedence ||
    headers.has("feedback-id") ||
    headers.has("x-csa-complaints") ||
    (auto_submitted !== "" && auto_submitted !== "no") ||
    BULK_LOCALPARTS_SET.has(localpart) ||
    in_any(MARKETING_SET) ||
    in_any(BULK_INFRA_SET);

  if (!is_automated) {
    // A known service domain (Updates, or finance/travel/shopping's own
    // whitelists) with a clearly transactional subject (e.g. a receipt that
    // carries no bulk markers) is Updates. Everything else with no
    // automation markers is personal and stays in Primary.
    if (
      (in_any(UPDATES_SET) ||
        in_any(SHOPPING_SET) ||
        in_any(FINANCE_SET) ||
        in_any(TRAVEL_SET)) &&
      matches_any(subject, UPDATES_SUBJECT_PATTERNS)
    ) {
      return "updates";
    }

    return "primary";
  }

  // 5. Automated mail only: refine into Promotions vs Updates.
  const promo_signal =
    in_any(MARKETING_SET) ||
    PROMO_LOCALPARTS.has(localpart) ||
    matches_any(subject, PROMOTIONS_SUBJECT_PATTERNS);
  const trusted_transactional =
    in_any(UPDATES_SET) || UPDATES_LOCALPARTS.has(localpart);
  const transactional_signal =
    trusted_transactional || matches_any(subject, UPDATES_SUBJECT_PATTERNS);

  // A trusted transactional sender (known service or receipts@/security@) wins
  // even if a promo-ish word appears, so a 2FA/receipt never lands in Promos.
  if (transactional_signal && (!promo_signal || trusted_transactional)) {
    return "updates";
  }

  if (promo_signal) {
    return "promotions";
  }

  // 6. Bulk mail with an unsubscribe / ESP infra but no clear signal is a
  //    newsletter / marketing send -> Promotions. Anything else automated but
  //    unclassified (e.g. a plain no-reply) stays in Primary.
  if (has_unsubscribe || in_any(BULK_INFRA_SET)) {
    return "promotions";
  }

  return "primary";
}

export function category_for_tab(category?: EmailCategory): EmailCategory {
  if (category && (CATEGORY_TABS as readonly string[]).includes(category)) {
    return category;
  }

  if (category && BUILTIN_CATEGORY_ID_SET.has(category)) {
    return fold_builtin(category) as EmailCategory;
  }

  return "primary";
}
