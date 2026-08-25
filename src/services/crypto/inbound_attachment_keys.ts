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
export interface InboundAttachmentEntry {
  key: string;
  filename?: string;
  content_type?: string;
  content_id?: string;
  size?: number;
}

const registry = new Map<string, InboundAttachmentEntry>();

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

export const register_attachment_entry = (
  mail_item_id: string,
  seq: number,
  entry: InboundAttachmentEntry,
): void => {
  const key = registry_key(mail_item_id, seq);
  const existing = registry.get(key);

  registry.set(key, entry);

  if (existing?.key === entry.key) return;

  version += 1;
  item_versions.set(mail_item_id, (item_versions.get(mail_item_id) ?? 0) + 1);

  for (const listener of listeners) {
    listener();
  }
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

export const clear_attachment_keys = (): void => {
  registry.clear();
  item_versions.clear();
  version += 1;

  for (const listener of listeners) {
    listener();
  }
};
