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

import { proxy_unsubscribe } from "@/services/api/subscriptions";
import { open_external } from "@/utils/open_link";
import { confirm_unsubscribe } from "@/components/modals/unsubscribe_confirmation_modal";

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

function extract_link_from_anchor(
  html: string,
  pattern: RegExp,
): string | null {
  const matches = [...html.matchAll(pattern)];

  for (const match of matches) {
    const url = match[1];

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

function extract_http_from_header(header: string): string | null {
  const http_match = header.match(/<(https?:\/\/[^>]+)>/i);

  if (http_match) {
    return http_match[1];
  }

  const bare_match = header.match(/(https?:\/\/[^,\s>]+)/i);

  if (bare_match) {
    return bare_match[1];
  }

  return null;
}

export function detect_unsubscribe_info(
  html_content?: string,
  text_content?: string,
  headers?: { list_unsubscribe?: string; list_unsubscribe_post?: string },
): UnsubscribeInfo {
  const result: UnsubscribeInfo = {
    has_unsubscribe: false,
    method: "none",
  };

  if (headers?.list_unsubscribe) {
    result.list_unsubscribe_header = headers.list_unsubscribe;

    const mailto = extract_mailto_from_header(headers.list_unsubscribe);
    const http_link = extract_http_from_header(headers.list_unsubscribe);

    if (headers.list_unsubscribe_post && http_link) {
      result.has_unsubscribe = true;
      result.method = "one-click";
      result.unsubscribe_link = http_link;
      result.list_unsubscribe_post = headers.list_unsubscribe_post;
    } else if (http_link) {
      result.has_unsubscribe = true;
      result.method = "link";
      result.unsubscribe_link = http_link;
    } else if (mailto) {
      result.has_unsubscribe = true;
      result.method = "mailto";
      result.unsubscribe_mailto = mailto;
    }

    if (result.has_unsubscribe) {
      return result;
    }
  }

  if (html_content) {
    for (const pattern of UNSUBSCRIBE_LINK_PATTERNS) {
      const link = extract_link_from_anchor(html_content, pattern);

      if (link) {
        result.has_unsubscribe = true;
        result.method = "link";
        result.unsubscribe_link = link;

        return result;
      }
    }

    const unsubscribe_section_match = html_content.match(
      /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*(?:unsubscribe|opt[\s-]?out)[^<]*<\/a>/gi,
    );

    if (unsubscribe_section_match) {
      const href_match = unsubscribe_section_match[0].match(
        /href=["']([^"']+)["']/i,
      );

      if (href_match && is_valid_url(href_match[1])) {
        result.has_unsubscribe = true;
        result.method = "link";
        result.unsubscribe_link = href_match[1];

        return result;
      }
    }
  }

  if (text_content) {
    const url_pattern = /https?:\/\/[^\s]+(?:unsubscribe|opt-?out)[^\s]*/gi;
    const matches = text_content.match(url_pattern);

    if (matches && matches.length > 0) {
      const url = matches[0];

      if (is_valid_url(url)) {
        result.has_unsubscribe = true;
        result.method = "link";
        result.unsubscribe_link = url;

        return result;
      }
    }

    for (const pattern of UNSUBSCRIBE_TEXT_PATTERNS) {
      if (pattern.test(text_content)) {
        const all_urls = text_content.match(/https?:\/\/[^\s]+/g) || [];

        for (const url of all_urls) {
          if (
            url.toLowerCase().includes("unsubscribe") ||
            url.toLowerCase().includes("opt")
          ) {
            if (is_valid_url(url)) {
              result.has_unsubscribe = true;
              result.method = "link";
              result.unsubscribe_link = url;

              return result;
            }
          }
        }
      }
    }
  }

  return result;
}

export function has_unsubscribe_content(content?: string): boolean {
  if (!content) return false;

  for (const pattern of UNSUBSCRIBE_TEXT_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
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

export type UnsubscribeResult = "api" | "link" | "mailto";

export async function execute_unsubscribe(
  unsub_info: UnsubscribeInfo,
): Promise<UnsubscribeResult> {
  const confirm_destination =
    unsub_info.unsubscribe_link || unsub_info.unsubscribe_mailto || "";

  if (!confirm_destination) {
    throw new Error("No unsubscribe method available");
  }

  if (unsub_info.method === "one-click" && unsub_info.unsubscribe_link) {
    const result = await proxy_unsubscribe({
      method: "one-click",
      url: unsub_info.unsubscribe_link,
      list_unsubscribe_post: unsub_info.list_unsubscribe_post,
    });

    if (result.data?.success) {
      return "api";
    }
  }

  if (unsub_info.unsubscribe_link) {
    if (unsub_info.method === "link" || unsub_info.method === "one-click") {
      const result = await proxy_unsubscribe({
        method: "link",
        url: unsub_info.unsubscribe_link,
      });

      if (result.data?.success) {
        return "api";
      }
    }

    return "link";
  }

  if (unsub_info.unsubscribe_mailto) {
    const result = await proxy_unsubscribe({
      method: "mailto",
      mailto_address: unsub_info.unsubscribe_mailto,
    });

    if (result.data?.success) {
      return "api";
    }

    return "mailto";
  }

  throw new Error("No unsubscribe method available");
}

export async function perform_unsubscribe(
  _sender_email: string,
  sender_name: string,
  unsub_info: UnsubscribeInfo,
): Promise<UnsubscribeResult> {
  const confirm_kind =
    unsub_info.method === "one-click"
      ? "one_click"
      : unsub_info.method === "mailto"
        ? "mailto"
        : "url";
  const confirm_destination =
    unsub_info.unsubscribe_link || unsub_info.unsubscribe_mailto || "";

  if (!confirm_destination) {
    throw new Error("No unsubscribe method available");
  }

  const confirmed = await confirm_unsubscribe(
    confirm_kind,
    confirm_destination,
    sender_name,
  );

  if (!confirmed) {
    throw new Error("cancelled");
  }

  if (unsub_info.method === "one-click" && unsub_info.unsubscribe_link) {
    const result = await proxy_unsubscribe({
      method: "one-click",
      url: unsub_info.unsubscribe_link,
      list_unsubscribe_post: unsub_info.list_unsubscribe_post,
    });

    if (result.data?.success) {
      return "api";
    }
  }

  if (unsub_info.unsubscribe_link) {
    if (unsub_info.method === "link" || unsub_info.method === "one-click") {
      const result = await proxy_unsubscribe({
        method: "link",
        url: unsub_info.unsubscribe_link,
      });

      if (result.data?.success) {
        return "api";
      }
    }

    open_external(unsub_info.unsubscribe_link);

    return "link";
  }

  if (unsub_info.unsubscribe_mailto) {
    const result = await proxy_unsubscribe({
      method: "mailto",
      mailto_address: unsub_info.unsubscribe_mailto,
    });

    if (result.data?.success) {
      return "api";
    }

    const mailto_address = unsub_info.unsubscribe_mailto;
    const is_valid_address =
      typeof mailto_address === "string" &&
      mailto_address.length > 0 &&
      mailto_address.length < 320 &&
      !/[\r\n\t<>"']/.test(mailto_address) &&
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailto_address);

    if (!is_valid_address) {
      throw new Error("Invalid unsubscribe mailto address");
    }

    window.location.href = `mailto:${encodeURIComponent(mailto_address)}?subject=Unsubscribe`;

    return "mailto";
  }

  throw new Error("No unsubscribe method available");
}
