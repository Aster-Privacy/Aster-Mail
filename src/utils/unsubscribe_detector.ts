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
import type { UnsubscribeInfo } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  proxy_unsubscribe,
  type ProxyUnsubscribeParams,
} from "@/services/api/subscriptions";
import { confirm_unsubscribe } from "@/components/modals/unsubscribe_confirmation_modal";

export type UnsubscribeErrorCode =
  "no_method" | "invalid_address" | "cancelled";

export class UnsubscribeError extends Error {
  code: UnsubscribeErrorCode;
  i18n_key: TranslationKey;
  constructor(code: UnsubscribeErrorCode) {
    super(code);
    this.code = code;
    this.i18n_key =
      code === "no_method"
        ? "errors.no_unsubscribe_method"
        : code === "invalid_address"
          ? "errors.invalid_unsubscribe_address"
          : "mail.unsubscribe_failed";
  }
}

const UNSUBSCRIBE_LINK_PATTERNS = [
  /href=["']([^"']*unsubscribe[^"']*)["']/gi,
  /href=["']([^"']*opt-?out[^"']*)["']/gi,
  /href=["']([^"']*remove[^"']*list[^"']*)["']/gi,
  /href=["']([^"']*manage[^"']*preferences[^"']*)["']/gi,
  /href=["']([^"']*email[^"']*preferences[^"']*)["']/gi,
  /href=["']([^"']*subscription[^"']*settings[^"']*)["']/gi,
];

const UNSUBSCRIBE_TEXT_PATTERNS = [
  /unsubscribe/i,
  /opt[\s-]?out/i,
  /stop\s+receiving/i,
  /remove\s+(from|me)/i,
  /manage\s+(?:email\s+)?preferences/i,
  /update\s+(?:your\s+)?subscription/i,
];

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&#38;": "&",
  "&#x26;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

function decode_html_entities(url: string): string {
  return url
    .replace(
      /&(?:amp|#38|#x26|lt|gt|quot|#39|#x27|nbsp);/gi,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
    )
    .trim();
}

function extract_link_from_anchor(
  html: string,
  pattern: RegExp,
): string | null {
  const matches = [...html.matchAll(pattern)];

  for (const match of matches) {
    const url = match[1] ? decode_html_entities(match[1]) : "";

    if (url && is_valid_url(url)) {
      return url;
    }
  }

  return null;
}

function is_valid_url(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extract_mailto_from_header(header: string): string | null {
  const mailto_match = header.match(/mailto:([^>,\s]+)/i);

  if (mailto_match) {
    return mailto_match[1];
  }

  return null;
}

function extract_http_links_from_header(header: string): string[] {
  const bracketed = [...header.matchAll(/<\s*(https?:\/\/[^>\s]+)\s*>/gi)]
    .map((match) => match[1])
    .filter(is_valid_url);

  if (bracketed.length > 0) {
    return bracketed;
  }

  return [...header.matchAll(/(https?:\/\/[^,\s>]+)/gi)]
    .map((match) => match[1])
    .filter(is_valid_url);
}

function extract_http_from_header(header: string): string | null {
  return extract_http_links_from_header(header)[0] ?? null;
}

function is_https_url(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export const ONE_CLICK_POST_VALUE = "List-Unsubscribe=One-Click";

export function is_one_click_post_header(value?: string | null): boolean {
  return value?.trim().toLowerCase() === ONE_CLICK_POST_VALUE.toLowerCase();
}

function is_dkim_acceptable(dkim_result?: string | null): boolean {
  const normalized = dkim_result?.trim().toLowerCase();

  return !normalized || normalized === "pass";
}

function find_body_unsubscribe_link(
  html_content?: string,
  text_content?: string,
): string | null {
  if (html_content) {
    for (const pattern of UNSUBSCRIBE_LINK_PATTERNS) {
      const link = extract_link_from_anchor(html_content, pattern);

      if (link) {
        return link;
      }
    }

    const unsubscribe_section_match = html_content.match(
      /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*(?:unsubscribe|opt[\s-]?out)[^<]*<\/a>/gi,
    );

    if (unsubscribe_section_match) {
      const href_match = unsubscribe_section_match[0].match(
        /href=["']([^"']+)["']/i,
      );

      if (href_match) {
        const url = decode_html_entities(href_match[1]);

        if (is_valid_url(url)) {
          return url;
        }
      }
    }
  }

  if (text_content) {
    const url_pattern = /https?:\/\/[^\s]+(?:unsubscribe|opt-?out)[^\s]*/gi;
    const matches = text_content.match(url_pattern);

    if (matches && matches.length > 0) {
      const url = decode_html_entities(matches[0]);

      if (is_valid_url(url)) {
        return url;
      }
    }

    for (const pattern of UNSUBSCRIBE_TEXT_PATTERNS) {
      if (pattern.test(text_content)) {
        const all_urls = text_content.match(/https?:\/\/[^\s]+/g) || [];

        for (const raw_url of all_urls) {
          const lowered = raw_url.toLowerCase();

          if (lowered.includes("unsubscribe") || lowered.includes("opt")) {
            const url = decode_html_entities(raw_url);

            if (is_valid_url(url)) {
              return url;
            }
          }
        }
      }
    }
  }

  return null;
}

export function detect_unsubscribe_info(
  html_content?: string,
  text_content?: string,
  headers?: {
    list_unsubscribe?: string;
    list_unsubscribe_post?: string;
    dkim_result?: string | null;
  },
): UnsubscribeInfo {
  const result: UnsubscribeInfo = {
    has_unsubscribe: false,
    method: "none",
  };
  let body_link_resolved = false;
  let body_link: string | null = null;

  const resolve_body_link = (): string | null => {
    if (!body_link_resolved) {
      body_link = find_body_unsubscribe_link(html_content, text_content);
      body_link_resolved = true;
    }

    return body_link;
  };

  if (headers?.list_unsubscribe) {
    result.list_unsubscribe_header = headers.list_unsubscribe;

    const mailto = extract_mailto_from_header(headers.list_unsubscribe);
    const http_links = extract_http_links_from_header(headers.list_unsubscribe);
    const https_link = http_links.find(is_https_url);
    const post_declared = is_one_click_post_header(
      headers.list_unsubscribe_post,
    );

    if (post_declared) {
      result.list_unsubscribe_post = ONE_CLICK_POST_VALUE;
    }

    if (
      post_declared &&
      https_link &&
      is_dkim_acceptable(headers.dkim_result)
    ) {
      result.has_unsubscribe = true;
      result.method = "one-click";
      result.unsubscribe_link = https_link;

      if (mailto) {
        result.unsubscribe_mailto = mailto;
      }

      const page_url = resolve_body_link();

      if (page_url) {
        result.unsubscribe_page_url = page_url;
      }
    } else if (mailto) {
      result.has_unsubscribe = true;
      result.method = "mailto";
      result.unsubscribe_mailto = mailto;

      if (!post_declared && http_links[0]) {
        result.unsubscribe_page_url = http_links[0];
      }
    } else if (http_links[0] && !post_declared) {
      result.has_unsubscribe = true;
      result.method = "link";
      result.unsubscribe_link = http_links[0];
      result.unsubscribe_page_url = http_links[0];
    }

    if (result.has_unsubscribe) {
      return result;
    }
  }

  const fallback_link = resolve_body_link();

  if (fallback_link) {
    result.has_unsubscribe = true;
    result.method = "link";
    result.unsubscribe_link = fallback_link;
    result.unsubscribe_page_url = fallback_link;
  }

  return result;
}

export function unsubscribe_info_from_stored(stored: {
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  list_unsubscribe_post?: string;
}): UnsubscribeInfo {
  const detected = detect_unsubscribe_info(undefined, undefined, {
    list_unsubscribe: stored.list_unsubscribe_header,
    list_unsubscribe_post: stored.list_unsubscribe_post,
  });

  if (detected.has_unsubscribe) {
    return detected;
  }

  if (
    stored.unsubscribe_link &&
    is_valid_url(stored.unsubscribe_link) &&
    !stored.list_unsubscribe_post
  ) {
    return {
      ...detected,
      has_unsubscribe: true,
      method: "link",
      unsubscribe_link: stored.unsubscribe_link,
      unsubscribe_page_url: stored.unsubscribe_link,
    };
  }

  return detected;
}

export function get_unsubscribe_display_text(
  info: UnsubscribeInfo,
  t?: (key: TranslationKey) => string,
): string {
  switch (info.method) {
    case "one-click":
      return t
        ? t("common.one_click_unsubscribe_available")
        : "One-click unsubscribe available";
    case "link":
      return t
        ? t("common.unsubscribe_link_available")
        : "Unsubscribe link available";
    case "mailto":
      return t
        ? t("common.email_unsubscribe_available")
        : "Email unsubscribe available";
    default:
      return "";
  }
}

export function get_sender_domain(email: string): string {
  const match = email.match(/@([^@]+)$/);

  return match ? match[1].toLowerCase() : email.toLowerCase();
}

function to_mailto_url(raw?: string | null): string {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return "";
  }

  const address = trimmed.toLowerCase().startsWith("mailto:")
    ? trimmed.slice("mailto:".length)
    : trimmed;

  if (!address.includes("@")) {
    return "";
  }

  return `mailto:${address}`;
}

export function is_one_click_only(unsub_info: {
  method?: string;
  list_unsubscribe_post?: string;
}): boolean {
  return (
    unsub_info.method === "one-click" ||
    Boolean(unsub_info.list_unsubscribe_post)
  );
}

export function get_manual_unsubscribe_url(unsub_info: {
  unsubscribe_link?: string;
  unsubscribe_mailto?: string;
  unsubscribe_page_url?: string;
  list_unsubscribe_header?: string;
  list_unsubscribe_post?: string;
  method?: string;
}): string {
  if (unsub_info.unsubscribe_page_url) {
    return unsub_info.unsubscribe_page_url;
  }

  const one_click_only = is_one_click_only(unsub_info);

  if (unsub_info.unsubscribe_link && !one_click_only) {
    return unsub_info.unsubscribe_link;
  }

  const from_mailto = to_mailto_url(unsub_info.unsubscribe_mailto);

  if (from_mailto) {
    return from_mailto;
  }

  const header = unsub_info.list_unsubscribe_header;

  if (!header) {
    return "";
  }

  if (!one_click_only) {
    const http_link = extract_http_from_header(header);

    if (http_link) {
      return http_link;
    }
  }

  return to_mailto_url(extract_mailto_from_header(header));
}

export type UnsubscribeResult = "api" | "link" | "mailto";

export interface ExecuteUnsubscribeOptions {
  retry_on_rate_limit?: boolean;
  signal?: AbortSignal;
}

const RATE_LIMIT_MAX_RETRIES = 4;
const RATE_LIMIT_FALLBACK_SECS = 60;

function wait_ms(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();

      return;
    }

    const on_abort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", on_abort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", on_abort, { once: true });
  });
}

async function call_proxy(
  params: ProxyUnsubscribeParams,
  options?: ExecuteUnsubscribeOptions,
): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const result = await proxy_unsubscribe(params);

    if (result.data?.success) {
      return true;
    }

    const rate_limited = result.code === "RATE_LIMIT_EXCEEDED";

    if (
      !rate_limited ||
      !options?.retry_on_rate_limit ||
      options.signal?.aborted ||
      attempt >= RATE_LIMIT_MAX_RETRIES
    ) {
      return false;
    }

    const retry_secs = result.retry_after_secs ?? RATE_LIMIT_FALLBACK_SECS;

    await wait_ms(retry_secs * 1000, options.signal);

    if (options.signal?.aborted) {
      return false;
    }
  }
}

function has_manual_page(unsub_info: UnsubscribeInfo): boolean {
  return Boolean(
    unsub_info.unsubscribe_page_url ||
    (unsub_info.unsubscribe_link && unsub_info.method !== "one-click"),
  );
}

export async function execute_unsubscribe(
  unsub_info: UnsubscribeInfo,
  options?: ExecuteUnsubscribeOptions,
): Promise<UnsubscribeResult> {
  if (!unsub_info.unsubscribe_link && !unsub_info.unsubscribe_mailto) {
    throw new UnsubscribeError("no_method");
  }

  if (unsub_info.method === "one-click" && unsub_info.unsubscribe_link) {
    const succeeded = await call_proxy(
      {
        method: "one-click",
        url: unsub_info.unsubscribe_link,
        list_unsubscribe_post: ONE_CLICK_POST_VALUE,
      },
      options,
    );

    if (succeeded) {
      return "api";
    }
  }

  if (unsub_info.unsubscribe_mailto) {
    const succeeded = await call_proxy(
      { method: "mailto", mailto_address: unsub_info.unsubscribe_mailto },
      options,
    );

    if (succeeded) {
      return "api";
    }
  }

  if (has_manual_page(unsub_info) || !unsub_info.unsubscribe_mailto) {
    return "link";
  }

  return "mailto";
}

function is_safe_mailto_target(raw: string): boolean {
  const address = raw.replace(/^mailto:/i, "").split("?")[0];

  return (
    raw.length > 0 &&
    raw.length < 2048 &&
    !/[<>"'\s]/.test(raw) &&
    address.length < 320 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)
  );
}

export async function perform_unsubscribe(
  _sender_email: string,
  sender_name: string,
  unsub_info: UnsubscribeInfo,
  options?: { skip_confirm?: boolean },
): Promise<UnsubscribeResult> {
  const confirm_kind =
    unsub_info.method === "one-click"
      ? "one_click"
      : unsub_info.method === "mailto"
        ? "mailto"
        : "url";
  const confirm_destination =
    unsub_info.method === "mailto"
      ? unsub_info.unsubscribe_mailto || ""
      : unsub_info.unsubscribe_link || unsub_info.unsubscribe_mailto || "";

  if (!confirm_destination) {
    throw new UnsubscribeError("no_method");
  }

  if (!options?.skip_confirm) {
    const confirmed = await confirm_unsubscribe(
      confirm_kind,
      confirm_destination,
      sender_name,
    );

    if (!confirmed) {
      throw new UnsubscribeError("cancelled");
    }
  }

  const result = await execute_unsubscribe(unsub_info);

  if (result !== "mailto") {
    return result;
  }

  const mailto_target = unsub_info.unsubscribe_mailto ?? "";

  if (!is_safe_mailto_target(mailto_target)) {
    throw new UnsubscribeError("invalid_address");
  }

  window.location.href = to_mailto_url(mailto_target);

  return "mailto";
}
