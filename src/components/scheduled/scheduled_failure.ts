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
import type { TranslationKey } from "@/lib/i18n/types";

export const SENDING_DISABLED_FAILURE = "ALIAS_SENDING_DISABLED";

export function scheduled_failure_message_key(
  failure_reason: string | null | undefined,
): TranslationKey {
  if (failure_reason?.trim() === SENDING_DISABLED_FAILURE) {
    return "mail.scheduled_send_failed_sending_disabled";
  }

  return "mail.scheduled_send_failed";
}
