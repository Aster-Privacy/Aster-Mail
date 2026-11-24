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
import type { MailItem } from "@/services/api/mail";
import type { UserPreferences } from "@/services/api/preferences";

import { is_ratchet_body_text } from "@/services/crypto/ratchet_types";
import { build_category_preview } from "@/lib/category_preview_text";
import { get_favicon_url } from "@/lib/favicon_url";
import { get_root_domain } from "@/lib/utils";

export interface NotificationSenderPreview {
  sender: string;
  subject: string;
  domain: string | null;
}

export interface NotificationContent {
  title: string;
  body: string;
  icon?: string;
}

type PreviewItem = Pick<
  MailItem,
  "id" | "item_type" | "encrypted_envelope" | "envelope_nonce"
>;

function sender_domain(email: string): string | null {
  const at = email.lastIndexOf("@");

  if (at <= 0 || at === email.length - 1) return null;

  return get_root_domain(
    email
      .slice(at + 1)
      .trim()
      .toLowerCase(),
  );
}

export async function load_notification_preview(
  item: PreviewItem | null | undefined,
): Promise<NotificationSenderPreview | null> {
  if (!item || item.item_type !== "received") return null;
  if (!item.encrypted_envelope || !item.envelope_nonce) return null;

  let envelope;

  try {
    const { decrypt_envelope } = await import("@/hooks/email_list_helpers");

    envelope = await decrypt_envelope(
      item.encrypted_envelope,
      item.envelope_nonce,
      item.id,
    );
  } catch {
    return null;
  }

  if (!envelope) return null;

  const email = (envelope.from?.email ?? "").trim();
  const name = envelope.from?.name;

  if (!email && !name?.trim()) return null;

  const sealed = is_ratchet_body_text(envelope.body_text);
  const preview = build_category_preview(
    name,
    email,
    sealed ? "" : envelope.subject,
  );

  if (!preview.sender) return null;

  return {
    sender: preview.sender,
    subject: preview.subject,
    domain: sender_domain(email),
  };
}

function sender_icon(
  domain: string | null,
  preferences: Pick<
    UserPreferences,
    "show_profile_pictures" | "low_network_mode"
  >,
): string | undefined {
  if (!domain) return undefined;
  if (preferences.show_profile_pictures === false) return undefined;
  if (preferences.low_network_mode) return undefined;

  const url = get_favicon_url(domain);

  return url.startsWith("data:") ? undefined : url;
}

export function build_notification_content(
  preview: NotificationSenderPreview | null,
  fallback: NotificationContent,
  preferences: Pick<
    UserPreferences,
    "show_profile_pictures" | "low_network_mode"
  >,
): NotificationContent {
  if (!preview) return fallback;

  const icon = sender_icon(preview.domain, preferences);

  return {
    title: preview.sender,
    body: preview.subject || fallback.body,
    ...(icon ? { icon } : {}),
  };
}
