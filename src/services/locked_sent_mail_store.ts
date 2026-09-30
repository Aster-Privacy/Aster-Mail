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
import { ignore_error } from "@/lib/ignore_error";

const LOCKED_SENT_KEY_PREFIX = "aster_locked_sent_mail_";

export const LOCKED_DATA_CHANGED_EVENT = "aster:locked-data-changed";

function locked_sent_key(account_id: string): string {
  return `${LOCKED_SENT_KEY_PREFIX}${account_id}`;
}

export function read_locked_sent_mail(account_id: string): number {
  if (!account_id) return 0;

  try {
    const raw = Number(localStorage.getItem(locked_sent_key(account_id)) ?? 0);

    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

export function write_locked_sent_mail(account_id: string, count: number) {
  if (!account_id) return;

  const next = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  try {
    if (next === 0) {
      localStorage.removeItem(locked_sent_key(account_id));
    } else {
      localStorage.setItem(locked_sent_key(account_id), String(next));
    }
  } catch (caught) {
    ignore_error("services/locked_sent_mail_store:write", caught);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCKED_DATA_CHANGED_EVENT));
  }
}
