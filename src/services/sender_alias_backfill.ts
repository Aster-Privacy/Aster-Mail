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

import { list_mail_items } from "@/services/api/mail";
import { backfill_sender_alias_hashes } from "@/services/api/mail_threads";
import { decrypt_envelope } from "@/hooks/email_list_helpers/decrypt";
import { get_alias_hash_by_address } from "@/hooks/use_sidebar_aliases";
import { ignore_error } from "@/lib/ignore_error";

const PAGE_SIZE = 100;

const MAX_BATCH_SIZE = 200;

const PROGRESS_KEY_PREFIX = "aster_sender_alias_backfill_";

export type BackfillStatus = "idle" | "running" | "done";

let status: BackfillStatus = "idle";

let active_account_id: string | null = null;

const listeners = new Set<(next: BackfillStatus) => void>();

function set_status(next: BackfillStatus): void {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener(status));
}

export function get_backfill_status(): BackfillStatus {
  return status;
}

export function subscribe_backfill_status(
  listener: (next: BackfillStatus) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function progress_key(account_id: string): string {
  return `${PROGRESS_KEY_PREFIX}${account_id}`;
}

function read_completed(account_id: string): boolean {
  try {
    return localStorage.getItem(progress_key(account_id)) === "done";
  } catch {
    return false;
  }
}

function write_completed(account_id: string): void {
  try {
    localStorage.setItem(progress_key(account_id), "done");
  } catch {
    ignore_error("services/sender_alias_backfill:write_completed", null);
  }
}

async function sender_alias_hash_for(item: {
  id: string;
  encrypted_envelope: string;
  envelope_nonce: string;
}): Promise<string | null> {
  const envelope = await decrypt_envelope(
    item.encrypted_envelope,
    item.envelope_nonce,
    item.id,
  );
  const from_address = envelope?.from?.email;

  if (!from_address) return null;

  return get_alias_hash_by_address(from_address);
}

async function upload(items: { item_id: string; sender_alias_hash: string }[]) {
  for (let start = 0; start < items.length; start += MAX_BATCH_SIZE) {
    await backfill_sender_alias_hashes(
      items.slice(start, start + MAX_BATCH_SIZE),
    );
  }
}

export async function run_sender_alias_backfill(
  account_id: string,
): Promise<void> {
  if (!account_id) return;
  if (status === "running" && active_account_id === account_id) return;
  if (read_completed(account_id)) {
    set_status("done");

    return;
  }

  active_account_id = account_id;
  set_status("running");

  try {
    let offset = 0;

    for (;;) {
      const response = await list_mail_items({
        item_type: "sent",
        limit: PAGE_SIZE,
        offset,
        order: "desc",
        skip_total: true,
      });
      const items = response.data?.items;

      if (!items) break;

      const resolved = await Promise.all(
        items.map(async (item) => {
          try {
            const hash = await sender_alias_hash_for(item);

            return hash ? { item_id: item.id, sender_alias_hash: hash } : null;
          } catch {
            return null;
          }
        }),
      );

      await upload(
        resolved.filter(
          (entry): entry is { item_id: string; sender_alias_hash: string } =>
            entry !== null,
        ),
      );

      if (items.length < PAGE_SIZE) break;
      offset += items.length;
    }

    write_completed(account_id);
    set_status("done");
  } catch (caught) {
    ignore_error("services/sender_alias_backfill:run", caught);
    set_status("idle");
  } finally {
    active_account_id = null;
  }
}
