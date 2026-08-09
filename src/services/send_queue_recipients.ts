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
import { en } from "@/lib/i18n/translations/en";
import { is_ghost_email, looks_like_unregistered_ghost_email } from "@/stores/ghost_alias_store";
import { get_current_account } from "./account_manager";
import { extract_username_from_email, get_recipient_public_key, is_internal_email } from "./api/keys";
import { create_error } from "./send_queue_types";

export function plain_text_to_html(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export async function resolve_username_for_key_lookup(
  email: string,
): Promise<string | null> {
  if (is_ghost_email(email)) {
    const account = await get_current_account();

    if (account?.user?.username) {
      return account.user.username;
    }
  }

  return extract_username_from_email(email);
}

export async function resolve_own_username_for_key_lookup(
  email: string,
): Promise<string | null> {
  if (is_ghost_email(email) || looks_like_unregistered_ghost_email(email)) {
    const account = await get_current_account();

    if (account?.user?.username) {
      return account.user.username;
    }
  }

  return extract_username_from_email(email);
}

export async function fetch_internal_public_keys(
  recipients: string[],
): Promise<string[]> {
  const internal_recipients = recipients.filter(is_internal_email);
  const public_keys: string[] = [];

  for (const recipient of internal_recipients) {
    const username = await resolve_username_for_key_lookup(recipient);

    if (!username) {
      throw create_error(
        "encryption_failed",
        en.errors.cannot_send_no_recipient_keys,
      );
    }

    const key_response = await get_recipient_public_key(username, recipient);

    if (key_response.error || !key_response.data) {
      throw create_error(
        "encryption_failed",
        en.errors.cannot_send_no_recipient_keys,
      );
    }

    public_keys.push(key_response.data.public_key);
  }

  return public_keys;
}
