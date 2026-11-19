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
import type { ApiResponse } from "./api/client";

import {
  extract_username_from_email,
  get_recipient_public_key,
  is_internal_email,
} from "./api/keys";
import {
  recipient_keys_unavailable_error,
  recipient_not_on_aster_error,
  type SendError,
} from "./send_queue_types";

import { is_ghost_email } from "@/stores/ghost_alias_store";

function is_checkable_aster_address(email: string): boolean {
  return is_internal_email(email) && !is_ghost_email(email);
}

function is_not_found(response: ApiResponse<unknown>): boolean {
  return response.code === "NOT_FOUND" || response.status === 404;
}

export async function is_unregistered_aster_address(
  email: string,
): Promise<boolean> {
  try {
    if (!is_checkable_aster_address(email)) return false;

    const username = extract_username_from_email(email);

    if (!username) return false;

    const response = await get_recipient_public_key(username, email);

    if (response.data && !response.error) return false;

    return is_not_found(response);
  } catch {
    return false;
  }
}

export async function find_unregistered_aster_addresses(
  recipients: string[],
): Promise<string[]> {
  const checks = await Promise.all(
    recipients.map(async (recipient) =>
      (await is_unregistered_aster_address(recipient)) ? recipient : null,
    ),
  );

  return checks.filter((recipient): recipient is string => recipient !== null);
}

export function missing_recipient_key_error(
  recipient: string,
  response: ApiResponse<unknown>,
): SendError {
  return is_checkable_aster_address(recipient) && is_not_found(response)
    ? recipient_not_on_aster_error([recipient])
    : recipient_keys_unavailable_error([recipient]);
}
