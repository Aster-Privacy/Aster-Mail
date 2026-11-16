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
import type { ParsedEmail } from "./types";

export function plan_import_fills(
  emails: ParsedEmail[],
  message_id_hashes: Map<string, string>,
  missing_attachment_hashes: Set<string>,
  attachments_allowed: boolean,
): Set<number> {
  const fills = new Set<number>();

  if (!attachments_allowed || missing_attachment_hashes.size === 0) {
    return fills;
  }

  emails.forEach((email, index) => {
    const hash = message_id_hashes.get(email.message_id);

    if (
      hash &&
      missing_attachment_hashes.has(hash) &&
      (email.attachments.length > 0 || email.attachment_hint === true)
    ) {
      fills.add(index);
    }
  });

  return fills;
}

export function should_flush_import_batch(
  batch_count: number,
  batch_bytes: number,
  next_bytes: number,
  max_bytes: number,
): boolean {
  return batch_count > 0 && batch_bytes + next_bytes > max_bytes;
}
