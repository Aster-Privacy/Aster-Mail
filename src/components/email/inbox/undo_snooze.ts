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
  emit_mail_item_updated,
  emit_snoozed_changed,
  MAIL_EVENTS,
} from "@/hooks/mail_events";
import { unsnooze_by_mail_item } from "@/services/api/snooze";
import { reindex_ids } from "@/services/category_index";

export async function undo_snooze(mail_item_ids: string[]): Promise<void> {
  const results = await Promise.allSettled(
    mail_item_ids.map((id) => unsnooze_by_mail_item(id)),
  );
  const restored_ids = mail_item_ids.filter((_, index) => {
    const result = results[index];

    return result.status === "fulfilled" && !result.value.error;
  });

  for (const id of restored_ids) {
    emit_mail_item_updated({ id, snoozed_until: null });
  }
  if (restored_ids.length > 0) {
    reindex_ids(restored_ids);
    emit_snoozed_changed();
  }
  window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_SOFT_REFRESH));

  if (restored_ids.length < mail_item_ids.length) {
    throw new Error("undo snooze failed");
  }
}
