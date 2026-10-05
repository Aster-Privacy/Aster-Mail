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
import type { InboxEmail } from "@/types/email";
import type {
  ForwardData,
  ReplyData,
} from "@/components/email/inbox/inbox_types";

import { useCallback } from "react";

import { build_reply_recipient } from "@/components/email/build_reply_recipient";
import {
  build_reply_from_address,
  resolve_received_on_alias,
} from "@/components/email/build_reply_from_address";
import { get_cached_aliases } from "@/components/settings/hooks/use_aliases";
import {
  get_cached_alias_for_routing_token,
  get_cached_ghost_for_routing_token,
} from "@/hooks/use_sender_aliases";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
  is_password_protected_body,
} from "@/utils/email_crypto";
import {
  await_preloaded_email,
  get_preloaded_email,
  preload_email_detail,
} from "@/components/email/hooks/preload_cache";
import { set_forward_mail_id } from "@/services/forward_store";
import mail_logo_url from "@/assets/mail_logo.webp";

export type ReplyComposeMode = "reply" | "reply_all" | "forward";

export function use_open_reply_compose(
  on_reply: ((data: ReplyData) => void) | undefined,
  on_forward: ((data: ForwardData) => void) | undefined,
  user_email: string | undefined,
): (mode: ReplyComposeMode, email: InboxEmail) => void {
  const open_compose = useCallback(
    (
      mode: "reply" | "reply_all" | "forward",
      email: InboxEmail,
      safe_body: string,
      cc_emails?: string[],
      raw_headers?: { name: string; value: string }[],
    ) => {
      if (mode !== "forward" && on_reply) {
        const is_own_message = email.item_type === "sent";
        const is_forwarded = !is_own_message && !!email.display_sender_email;
        const first_recipient = email.recipient_addresses?.[0];
        const { recipient_name, recipient_email } = build_reply_recipient(
          {
            sender_name: email.sender_name,
            sender_email: email.sender_email,
            first_to: first_recipient
              ? { name: "", email: first_recipient }
              : undefined,
            reply_to: email.reply_to
              ? { name: email.reply_to.name ?? "", email: email.reply_to.email }
              : undefined,
            reply_alias: is_forwarded
              ? { name: email.sender_name, email: email.sender_email }
              : undefined,
          },
          is_own_message,
        );

        const reply_from_address = build_reply_from_address(
          {
            sender_email: email.sender_email,
            raw_headers,
            to_emails: email.recipient_addresses,
            cc_emails,
            received_on_alias:
              resolve_received_on_alias(
                email.routing_token,
                get_cached_aliases(),
              ) ??
              get_cached_alias_for_routing_token(email.routing_token) ??
              get_cached_ghost_for_routing_token(email.routing_token),
          },
          is_own_message,
        );

        on_reply({
          recipient_name,
          recipient_email,
          recipient_avatar: email.avatar_url,
          original_subject: email.subject,
          original_body: safe_body,
          original_timestamp: email.timestamp,
          thread_token: email.thread_token,
          original_email_id: email.id,
          original_to: email.recipient_addresses ?? [],
          reply_from_address,
          ...(mode === "reply_all"
            ? {
                reply_all: true,
                original_cc: cc_emails ?? [],
              }
            : {}),
        });
      } else if (mode === "forward" && on_forward) {
        set_forward_mail_id(email.id);
        on_forward({
          sender_name: email.sender_name,
          sender_email: email.sender_email,
          sender_avatar: email.avatar_url || mail_logo_url,
          email_subject: email.subject,
          email_body: safe_body,
          email_timestamp: email.timestamp,
          original_mail_id: email.id,
        });
      }
    },
    [on_reply, on_forward],
  );

  const handle_open_compose = useCallback(
    (mode: "reply" | "reply_all" | "forward", email: InboxEmail) => {
      const is_sentinel = (value: string | undefined): boolean =>
        value === RATCHET_UNDECRYPTABLE_SENTINEL ||
        value === PGP_UNDECRYPTABLE_SENTINEL ||
        is_password_protected_body(value ?? "");
      const fallback_body =
        (is_sentinel(email.body_html) ? "" : email.body_html) ||
        (is_sentinel(email.preview) ? "" : email.preview) ||
        "";
      const cached = get_preloaded_email(email.id, user_email)?.email;
      const cached_body = cached?.body ?? "";

      if (!cached_body) {
        void (async () => {
          let resolved = fallback_body;
          let resolved_cc: string[] | undefined;
          let resolved_headers: { name: string; value: string }[] | undefined;

          try {
            await preload_email_detail(email.id, user_email);

            const preloaded = await await_preloaded_email(
              email.id,
              undefined,
              { user_email },
            );
            const body = preloaded?.email.body ?? "";

            resolved_headers = preloaded?.email.raw_headers;

            if (body && !is_sentinel(body)) resolved = body;
            resolved_cc = preloaded?.email.cc?.flatMap((r) =>
              r.email ? [r.email] : [],
            );
          } catch {
            resolved = fallback_body;
          }

          open_compose(mode, email, resolved, resolved_cc, resolved_headers);
        })();

        return;
      }

      open_compose(
        mode,
        email,
        is_sentinel(cached_body) ? fallback_body : cached_body,
        cached?.cc?.flatMap((r) => (r.email ? [r.email] : [])),
        cached?.raw_headers,
      );
    },
    [open_compose, user_email],
  );

  return handle_open_compose;
}
