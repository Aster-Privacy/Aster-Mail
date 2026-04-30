//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type { DecryptedEmail } from "@/components/email/hooks/email_detail_types";
import type {
  ExternalContentReport,
  SanitizeResult,
} from "@/lib/html_sanitizer";
import type { ThreadReplySentEventDetail } from "@/hooks/mail_events";

import { get_email_username, is_system_email } from "@/lib/utils";
import { get_mail_item, type MailItem } from "@/services/api/mail";
import { fetch_and_decrypt_thread_messages } from "@/services/thread_service";
import {
  try_decrypt_ratchet_body,
  try_decrypt_pgp_body,
  try_extract_mime_body,
} from "@/utils/email_crypto";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  get_draft_by_thread,
  type DraftWithContent,
} from "@/services/api/multi_drafts";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { get_current_account } from "@/services/account_manager";
import { set_cached_iframe_height } from "@/components/email/sandboxed_email_renderer";
import { EMAIL_BODY_CSS } from "@/lib/email_body_styles";
import { MAIL_EVENTS } from "@/hooks/mail_events";

export interface PreloadedSanitizedContent {
  html: string;
  body_background?: string;
  is_plain_text: boolean;
  external_content: ExternalContentReport;
}

export interface PreloadedEmail {
  mail_item: MailItem;
  email: DecryptedEmail;
  thread_messages: DecryptedThreadMessage[];
  thread_draft: DraftWithContent | null;
  current_user_email: string;
  current_user_name: string;
  thread_sanitized: Map<string, PreloadedSanitizedContent>;
  time: number;
  is_stale: boolean;
  conversation_grouping: boolean;
}

const EMPTY_EXTERNAL_CONTENT: ExternalContentReport = {
  has_remote_images: false,
  has_remote_fonts: false,
  has_remote_css: false,
  has_tracking_pixels: false,
  blocked_count: 0,
  blocked_items: [],
  cleaned_links: [],
};

const preload_cache = new Map<string, PreloadedEmail>();
const preload_in_flight = new Map<string, Promise<void>>();
const MAX_PRELOAD_CACHE_SIZE = 100;

export function get_preloaded_email(email_id: string): PreloadedEmail | null {
  const in_flight = preload_in_flight.get(email_id);

  if (in_flight) {
    return null;
  }

  return preload_cache.get(email_id) ?? null;
}

export const consume_preloaded_email = get_preloaded_email;

export async function await_preloaded_email(
  email_id: string,
  conversation_grouping?: boolean,
): Promise<PreloadedEmail | null> {
  const in_flight = preload_in_flight.get(email_id);

  if (in_flight) {
    try {
      await Promise.race([
        in_flight,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("preload timeout")), 10000),
        ),
      ]);
    } catch {
      preload_in_flight.delete(email_id);

      return null;
    }
  }

  const cached = preload_cache.get(email_id) ?? null;

  if (
    cached &&
    conversation_grouping !== undefined &&
    cached.conversation_grouping !== conversation_grouping
  ) {
    return null;
  }

  return cached;
}

function evict_stale_cache_entries(): void {
  if (preload_cache.size > MAX_PRELOAD_CACHE_SIZE) {
    const entries = Array.from(preload_cache.entries()).sort(
      (a, b) => a[1].time - b[1].time,
    );
    const to_remove = entries.length - MAX_PRELOAD_CACHE_SIZE;

    for (let i = 0; i < to_remove; i++) {
      preload_cache.delete(entries[i][0]);
    }
  }
}

export function clear_preload_cache(): void {
  preload_cache.clear();
}

export function mark_preload_stale(email_id?: string): void {
  if (email_id) {
    const cached = preload_cache.get(email_id);

    if (cached) {
      preload_cache.set(email_id, { ...cached, is_stale: true });
    }
  } else {
    for (const [key, cached] of preload_cache.entries()) {
      preload_cache.set(key, { ...cached, is_stale: true });
    }
  }
}

export function delete_preloaded_email(email_id: string): void {
  preload_cache.delete(email_id);
}

export function get_preload_cache(): Map<string, PreloadedEmail> {
  return preload_cache;
}

export function get_preload_in_flight(): Map<string, Promise<void>> {
  return preload_in_flight;
}

function invalidate_thread_in_preload_cache(
  thread_token: string,
  original_email_id?: string,
): void {
  for (const [key, cached] of preload_cache.entries()) {
    if (
      cached.mail_item.thread_token === thread_token ||
      (original_email_id && key === original_email_id)
    ) {
      preload_cache.set(key, { ...cached, is_stale: true });
    }
  }
}

window.addEventListener(MAIL_EVENTS.THREAD_REPLY_SENT, ((
  event: CustomEvent<ThreadReplySentEventDetail>,
) => {
  if (event.detail) {
    invalidate_thread_in_preload_cache(
      event.detail.thread_token,
      event.detail.original_email_id,
    );
  }
}) as EventListener);

function presanitize(
  html_content: string | undefined,
  body: string,
  sender_email: string,
): PreloadedSanitizedContent {
  const raw = html_content || body;
  const is_plain = !raw || !has_rich_html(raw);
  const is_system = is_system_email(sender_email);

  if (!is_html_content(raw)) {
    return {
      html: plain_text_to_html(raw),
      is_plain_text: true,
      external_content: EMPTY_EXTERNAL_CONTENT,
    };
  }

  const result: SanitizeResult = sanitize_html(raw, {
    external_content_mode: is_system ? "always" : "ask",
    image_proxy_url: get_image_proxy_url(),
    sandbox_mode: true,
  });

  return {
    html: result.html,
    body_background: result.body_background,
    is_plain_text: is_plain,
    external_content: result.external_content,
  };
}

let measure_container: HTMLDivElement | null = null;

function premeasure_height(
  email_id: string,
  sanitized_html: string,
  is_plain_text: boolean,
  body_background?: string,
): void {
  if (!measure_container || !document.body.contains(measure_container)) {
    measure_container = document.createElement("div");
    measure_container.style.cssText =
      "position:fixed;left:-20000px;top:0;pointer-events:none;visibility:hidden;overflow:hidden;height:0";
    document.body.appendChild(measure_container);
  }

  const viewer_width = Math.max(
    400,
    document.querySelector(".email-frame-container")?.clientWidth ||
      window.innerWidth - 320,
  );

  const wrapper = document.createElement("div");
  const shadow = wrapper.attachShadow({ mode: "open" });

  wrapper.style.cssText = `width:${viewer_width}px;position:absolute;left:0;top:0`;

  const body_style = is_plain_text
    ? "margin:0;padding:16px 20px;font-family:'Google Sans Flex',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word"
    : `margin:0;padding:8px 16px 16px 16px;background-color:${body_background || "transparent"}`;

  shadow.innerHTML =
    `<style>${EMAIL_BODY_CSS}</style>` +
    `<div style="${body_style}">${sanitized_html}</div>`;

  measure_container.appendChild(wrapper);

  const content = shadow.querySelector("div");
  const height = content ? Math.min(content.scrollHeight + 2, 12000) : 0;

  measure_container.removeChild(wrapper);

  if (height > 0) {
    set_cached_iframe_height(email_id, height);
  }
}

export async function preload_email_detail(
  target_id: string,
  user_email?: string,
  force?: boolean,
  conversation_grouping?: boolean,
): Promise<void> {
  if (!force) {
    const existing = preload_cache.get(target_id);

    if (
      existing &&
      existing.conversation_grouping === (conversation_grouping !== false)
    ) {
      return;
    }
  }
  if (preload_in_flight.has(target_id)) return preload_in_flight.get(target_id);

  const task = (async () => {
    try {
      const response = await get_mail_item(target_id);

      if (response.error || !response.data) return;

      const item = response.data;
      let decrypted_metadata = item.metadata ?? null;

      if (
        !decrypted_metadata &&
        item.encrypted_metadata &&
        item.metadata_nonce
      ) {
        decrypted_metadata = await decrypt_mail_metadata(
          item.encrypted_metadata,
          item.metadata_nonce,
          item.metadata_version,
        );
      }

      const envelope = await decrypt_mail_envelope(
        item.encrypted_envelope,
        item.envelope_nonce,
      );

      if (!envelope) return;

      let resolved_html = envelope.body_html ?? envelope.html_body ?? undefined;

      if (resolved_html && /^content-type\s*:/im.test(resolved_html)) {
        resolved_html = try_extract_mime_body(resolved_html) || undefined;
      }
      const resolved_text = envelope.body_text ?? envelope.text_body ?? "";

      let body_text = user_email
        ? await try_decrypt_ratchet_body(
            resolved_text,
            user_email,
            envelope.from.email,
          )
        : resolved_text;

      const pre_pgp_text = body_text;

      body_text = await try_decrypt_pgp_body(body_text);
      const pre_mime_text = body_text;

      body_text = try_extract_mime_body(body_text);
      const mime_extracted = body_text !== pre_mime_text;

      const pgp_was_decrypted = body_text !== pre_pgp_text;
      const html_has_pgp =
        resolved_html?.includes("-----BEGIN PGP MESSAGE-----") ?? false;
      const text_had_pgp =
        pre_pgp_text.includes("-----BEGIN PGP MESSAGE-----") &&
        pgp_was_decrypted;
      const content_is_html = /<[a-z][\s\S]*>/i.test(body_text);
      const decrypted_is_html =
        (html_has_pgp || text_had_pgp) && pgp_was_decrypted && content_is_html;
      const safe_html =
        mime_extracted && content_is_html
          ? body_text
          : html_has_pgp || text_had_pgp
            ? decrypted_is_html
              ? body_text
              : undefined
            : resolved_html;

      const unsubscribe_info = detect_unsubscribe_info(
        resolved_html || "",
        body_text,
        {
          list_unsubscribe: envelope.list_unsubscribe,
          list_unsubscribe_post: envelope.list_unsubscribe_post,
        },
      );

      const decrypted: DecryptedEmail = {
        id: item.id,
        sender: envelope.from.name || get_email_username(envelope.from.email),
        sender_email: envelope.from.email,
        subject: envelope.subject || "",
        preview: (
          body_text ||
          (safe_html
            ? safe_html
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
            : "")
        ).substring(0, 200),
        timestamp: new Date(
          envelope.sent_at || item.created_at,
        ).toLocaleString(),
        is_read: decrypted_metadata?.is_read ?? false,
        is_starred: decrypted_metadata?.is_starred ?? false,
        has_attachment: decrypted_metadata?.has_attachments ?? false,
        thread_count: 1,
        body: body_text,
        html_content: safe_html,
        to: envelope.to || [],
        cc: envelope.cc || [],
        bcc: envelope.bcc || [],
        replies: [],
        attachments: [],
        labels: [],
        unsubscribe_info,
      };

      const single_message: DecryptedThreadMessage = {
        id: item.id,
        item_type: item.item_type as "received" | "sent" | "draft",
        sender_name:
          envelope.from.name ||
          get_email_username(envelope.from.email) ||
          "Unknown",
        sender_email: envelope.from.email || "",
        subject: envelope.subject || "",
        body: body_text || "",
        html_content: safe_html,
        timestamp: item.message_ts || item.created_at,
        is_read: decrypted_metadata?.is_read ?? false,
        is_starred: decrypted_metadata?.is_starred ?? false,
        is_deleted: false,
        is_external: item.is_external,
        encrypted_metadata: item.encrypted_metadata,
        metadata_nonce: item.metadata_nonce,
        to_recipients: envelope.to || [],
        cc_recipients: envelope.cc || [],
        raw_headers: envelope.raw_headers,
      };

      let thread_messages: DecryptedThreadMessage[] = [single_message];

      if (conversation_grouping !== false && item.thread_token) {
        const thread_result = await fetch_and_decrypt_thread_messages(
          item.thread_token,
          user_email,
        );

        if (thread_result.messages.length > 0) {
          thread_messages = thread_result.messages;
        }
      }

      let thread_draft: DraftWithContent | null = null;

      if (item.thread_token) {
        const vault = get_vault_from_memory();

        if (vault) {
          const draft_result = await get_draft_by_thread(
            item.thread_token,
            vault,
          );

          if (draft_result.data) {
            thread_draft = draft_result.data;
          }
        }
      }

      const thread_sanitized = new Map<string, PreloadedSanitizedContent>();

      for (const msg of thread_messages) {
        thread_sanitized.set(
          msg.id,
          presanitize(msg.html_content, msg.body, msg.sender_email),
        );
      }

      const main_sanitized = presanitize(
        safe_html,
        body_text,
        envelope.from.email,
      );

      premeasure_height(
        target_id,
        main_sanitized.html,
        main_sanitized.is_plain_text,
        main_sanitized.body_background,
      );

      let current_user_name = "";

      try {
        const account = await get_current_account();

        if (account) {
          current_user_name = account.user.display_name || account.user.email;
        }
      } catch {}

      evict_stale_cache_entries();

      if (decrypted_metadata) {
        item.metadata = decrypted_metadata;
      }

      preload_cache.set(target_id, {
        mail_item: item,
        email: decrypted,
        thread_messages,
        thread_draft,
        current_user_email: user_email || "",
        current_user_name,
        thread_sanitized,
        time: Date.now(),
        is_stale: false,
        conversation_grouping: conversation_grouping !== false,
      });
    } catch {
    } finally {
      preload_in_flight.delete(target_id);
    }
  })();

  preload_in_flight.set(target_id, task);

  return task;
}
