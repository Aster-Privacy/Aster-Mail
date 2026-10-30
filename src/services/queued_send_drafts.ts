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
import { undo_send_api } from "@/services/api/undo_send";
import { delete_draft } from "@/services/api/multi_drafts";
import { emit_drafts_changed } from "@/hooks/mail_events";

const STORAGE_KEY = "astermail:queued_send_drafts";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

interface QueuedSendDraft {
  queue_id: string;
  draft_id: string;
  at: number;
}

function read_entries(): QueuedSendDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is QueuedSendDraft =>
        !!entry &&
        typeof (entry as QueuedSendDraft).queue_id === "string" &&
        typeof (entry as QueuedSendDraft).draft_id === "string" &&
        typeof (entry as QueuedSendDraft).at === "number",
    );
  } catch {
    return [];
  }
}

function write_entries(entries: QueuedSendDraft[]): void {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    return;
  }
}

export function remember_queued_send_draft(
  queue_id: string,
  draft_id: string | undefined,
): void {
  if (!draft_id) return;

  const entries = read_entries().filter((entry) => entry.queue_id !== queue_id);

  entries.push({ queue_id, draft_id, at: Date.now() });
  write_entries(entries.slice(-MAX_ENTRIES));
}

export function forget_queued_send_draft(queue_id: string): void {
  const entries = read_entries();
  const remaining = entries.filter((entry) => entry.queue_id !== queue_id);

  if (remaining.length !== entries.length) write_entries(remaining);
}

export async function settle_queued_send_drafts(): Promise<void> {
  const entries = read_entries();

  if (entries.length === 0) return;

  const now = Date.now();
  const settled = new Set<string>();
  let deleted_any = false;

  for (const entry of entries) {
    if (entry.at + MAX_AGE_MS < now) {
      settled.add(entry.queue_id);
      continue;
    }

    const response = await undo_send_api
      .get_status(entry.queue_id)
      .catch(() => undefined);
    const status = response?.data?.status;

    if (status === "sent") {
      const deleted = await delete_draft(entry.draft_id).catch(() => undefined);

      if (deleted?.data || deleted?.code === "NOT_FOUND") {
        settled.add(entry.queue_id);
        deleted_any = true;
      }
    } else if (status === "failed" || status === "cancelled") {
      settled.add(entry.queue_id);
    }
  }

  if (settled.size > 0) {
    write_entries(
      read_entries().filter((entry) => !settled.has(entry.queue_id)),
    );
  }

  if (deleted_any) emit_drafts_changed();
}
