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
import {
  classify_recipients,
  is_internal_recipient,
} from "./recipient_classification";
import { assert_required_encryption_keys } from "./send_queue_execute";

import { get_active_translations } from "@/lib/i18n/translations";

export async function check_reply_send(
  recipients: string[],
  require_encryption: boolean,
): Promise<string | null> {
  const strings = get_active_translations();

  try {
    await classify_recipients(recipients);
  } catch {
    return strings.errors.key_trust_check_failed;
  }

  const external = recipients.filter((r) => !is_internal_recipient(r));

  if (external.length > 0 && require_encryption) {
    try {
      await assert_required_encryption_keys(external);
    } catch (error) {
      return error instanceof Error
        ? error.message
        : strings.errors.cannot_send_no_recipient_keys;
    }
  }

  return null;
}
