//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { on_vault_cleared } from "@/services/crypto/memory_key_store";

export interface InboundAttachmentEntry {
  key: string;
  filename?: string;
  content_type?: string;
  content_id?: string;
  size?: number;
}

const registry = new Map<string, InboundAttachmentEntry>();

const listed_items = new Set<string>();

const registry_key = (mail_item_id: string, seq: number): string =>
  `${mail_item_id}:${seq}`;

let version = 0;

const item_versions = new Map<string, number>();

const listeners = new Set<() => void>();

export const attachment_keys_version = (mail_item_id?: string): number =>
  mail_item_id ? (item_versions.get(mail_item_id) ?? 0) : version;

export const subscribe_attachment_keys = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

let notify_scheduled = false;

const notify_listeners_soon = (): void => {
  if (notify_scheduled) return;
  notify_scheduled = true;
  queueMicrotask(() => {
    notify_scheduled = false;

    for (const listener of listeners) {
      listener();
    }
  });
};

let vault_listener_armed = false;

const arm_vault_listener = (): void => {
  if (vault_listener_armed) return;
  vault_listener_armed = true;
  on_vault_cleared((event) => {
    if (event?.same_owner) return;
    clear_attachment_keys();
  });
};

export const register_attachment_entry = (
  mail_item_id: string,
  seq: number,
  entry: InboundAttachmentEntry,
): void => {
  arm_vault_listener();

  const key = registry_key(mail_item_id, seq);
  const existing = registry.get(key);

  registry.set(key, entry);

  if (existing?.key === entry.key) return;

  version += 1;
  item_versions.set(mail_item_id, (item_versions.get(mail_item_id) ?? 0) + 1);
  notify_listeners_soon();
};

export const register_envelope_attachment_keys = (
  mail_item_id: string | undefined,
  envelope: unknown,
): void => {
  if (!mail_item_id || typeof envelope !== "object" || envelope === null) {
    return;
  }

  const keys = (envelope as { attachment_keys?: unknown }).attachment_keys;

  if (!Array.isArray(keys)) return;

  for (const entry of keys) {
    if (typeof entry?.seq !== "number" || typeof entry?.key !== "string") {
      continue;
    }

    listed_items.add(mail_item_id);
    register_attachment_entry(mail_item_id, entry.seq, {
      key: entry.key,
      filename: typeof entry.filename === "string" ? entry.filename : undefined,
      content_type:
        typeof entry.content_type === "string" ? entry.content_type : undefined,
      content_id:
        typeof entry.content_id === "string" ? entry.content_id : undefined,
      size: typeof entry.size === "number" ? entry.size : undefined,
    });
  }
};

export const get_attachment_entry = (
  mail_item_id: string,
  seq: number,
): InboundAttachmentEntry | null =>
  registry.get(registry_key(mail_item_id, seq)) ?? null;

export const get_attachment_key = (mail_item_id: string, seq: number): string =>
  registry.get(registry_key(mail_item_id, seq))?.key ?? "";

export const has_envelope_attachment_keys = (mail_item_id: string): boolean =>
  listed_items.has(mail_item_id);

export const is_attachment_row_listed = (
  mail_item_id: string,
  seq: number,
): boolean =>
  !listed_items.has(mail_item_id) ||
  registry.has(registry_key(mail_item_id, seq));

export const listed_attachment_rows = <
  Row extends { mail_item_id: string; seq_num: number },
>(
  rows: Row[],
): Row[] =>
  rows.filter((row) => is_attachment_row_listed(row.mail_item_id, row.seq_num));

export const clear_attachment_keys = (): void => {
  registry.clear();
  listed_items.clear();
  item_versions.clear();
  version += 1;

  for (const listener of listeners) {
    listener();
  }
};
