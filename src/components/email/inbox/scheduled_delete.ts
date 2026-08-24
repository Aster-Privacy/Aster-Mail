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
import { emit_scheduled_changed, emit_mail_changed } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { cancel_scheduled_email } from "@/services/api/scheduled";

export async function cancel_scheduled_ids(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];

  const results = await Promise.allSettled(
    ids.map((id) => cancel_scheduled_email(id)),
  );
  const succeeded = ids.filter((_id, index) => {
    const result = results[index];

    return result.status === "fulfilled" && !!result.value.data?.success;
  });

  invalidate_mail_stats();

  for (const id of succeeded) {
    emit_scheduled_changed({ action: "cancelled", email_id: id });
  }

  if (succeeded.length !== ids.length) {
    emit_scheduled_changed({ action: "cancelled" });
  }

  emit_mail_changed();

  return succeeded;
}
