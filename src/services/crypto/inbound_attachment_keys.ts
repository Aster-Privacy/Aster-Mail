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
  sha256?: string;
  is_inline?: boolean;
  sealed?: boolean;
}

const registry = new Map<string, InboundAttachmentEntry>();

const MAX_REGISTERED_ITEMS = 10000;

const item_seqs = new Map<string, Set<number>>();

const listed_items = new Set<string>();

const unsealed_entries = new Set<string>();

const sealed_items = new Set<string>();

const item_fingerprints = new Map<string, string>();

const entry_fingerprints = new Map<string, string>();

const pending_envelopes = new Map<
  string,
  { keys: unknown; options: AttachmentKeySource }
>();

const registry_key = (mail_item_id: string, seq: number): string =>
  `${mail_item_id}:${seq}`;

let version = 0;

const item_versions = new Map<string, number>();

const touch_item = (mail_item_id: string): void => {
  const seqs = item_seqs.get(mail_item_id);

  if (seqs === undefined) return;

  item_seqs.delete(mail_item_id);
  item_seqs.set(mail_item_id, seqs);
};

const evict_item = (mail_item_id: string): void => {
  const seqs = item_seqs.get(mail_item_id);

  if (seqs === undefined) return;

  for (const seq of seqs) {
    registry.delete(registry_key(mail_item_id, seq));
    unsealed_entries.delete(registry_key(mail_item_id, seq));
    entry_fingerprints.delete(registry_key(mail_item_id, seq));
  }

  item_seqs.delete(mail_item_id);
  listed_items.delete(mail_item_id);
  sealed_items.delete(mail_item_id);
  item_versions.delete(mail_item_id);
  item_fingerprints.delete(mail_item_id);
  pending_envelopes.delete(mail_item_id);
};

const evict_oldest_items = (): void => {
  while (item_seqs.size > MAX_REGISTERED_ITEMS) {
    const oldest = item_seqs.keys().next();

    if (oldest.done) return;

    evict_item(oldest.value);
  }
};

const current_entry = (
  mail_item_id: string,
  seq: number,
): InboundAttachmentEntry | undefined => {
  const key = registry_key(mail_item_id, seq);
  const entry = registry.get(key);

  if (entry === undefined) return undefined;
  if (entry_fingerprints.get(key) !== item_fingerprints.get(mail_item_id)) {
    return undefined;
  }

  return entry;
};

const touch_entry = (
  mail_item_id: string,
  seq: number,
): InboundAttachmentEntry | undefined => {
  const entry = current_entry(mail_item_id, seq);

  if (entry !== undefined) touch_item(mail_item_id);

  return entry;
};

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

const mark_item_changed = (mail_item_id: string): void => {
  version += 1;
  item_versions.set(mail_item_id, (item_versions.get(mail_item_id) ?? 0) + 1);
  notify_listeners_soon();
};

const has_item_state = (mail_item_id: string): boolean =>
  item_seqs.has(mail_item_id) ||
  listed_items.has(mail_item_id) ||
  sealed_items.has(mail_item_id);

const has_encrypted_entry = (mail_item_id: string): boolean => {
  for (const seq of item_seqs.get(mail_item_id) ?? []) {
    const key = registry_key(mail_item_id, seq);

    if (registry.has(key) && !unsealed_entries.has(key)) return true;
  }

  return false;
};

const reset_item = (mail_item_id: string): void => {
  if (!has_item_state(mail_item_id)) return;

  for (const seq of item_seqs.get(mail_item_id) ?? []) {
    const key = registry_key(mail_item_id, seq);

    registry.delete(key);
    unsealed_entries.delete(key);
    entry_fingerprints.delete(key);
  }

  item_seqs.delete(mail_item_id);
  listed_items.delete(mail_item_id);
  sealed_items.delete(mail_item_id);
  mark_item_changed(mail_item_id);
};

const drop_sealed_entries = (mail_item_id: string): void => {
  const seqs = item_seqs.get(mail_item_id);
  let changed = sealed_items.delete(mail_item_id);

  for (const seq of seqs ?? []) {
    const key = registry_key(mail_item_id, seq);

    if (registry.get(key)?.sealed !== true) continue;
    registry.delete(key);
    unsealed_entries.delete(key);
    entry_fingerprints.delete(key);
    seqs?.delete(seq);
    changed = true;
  }

  if (seqs !== undefined && seqs.size === 0) {
    item_seqs.delete(mail_item_id);
    listed_items.delete(mail_item_id);
    item_fingerprints.delete(mail_item_id);
  }

  if (changed) mark_item_changed(mail_item_id);

  const pending = pending_envelopes.get(mail_item_id);

  if (pending === undefined) return;
  pending_envelopes.delete(mail_item_id);
  apply_envelope_keys(mail_item_id, pending.keys, pending.options);
};

const keys_fingerprint = (keys: unknown): string => {
  if (!Array.isArray(keys)) return "";

  const pairs: string[] = [];

  for (const entry of keys) {
    if (typeof entry?.seq !== "number" || typeof entry?.key !== "string") {
      continue;
    }
    pairs.push(`${entry.seq}:${entry.key}`);
  }

  return pairs.join("|");
};

const adopt_fingerprint = (mail_item_id: string, fingerprint: string): void => {
  item_fingerprints.set(mail_item_id, fingerprint);

  for (const seq of item_seqs.get(mail_item_id) ?? []) {
    entry_fingerprints.set(registry_key(mail_item_id, seq), fingerprint);
  }
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

export interface AttachmentKeySource {
  unencrypted?: boolean;
}

export const register_attachment_entry = (
  mail_item_id: string,
  seq: number,
  entry: InboundAttachmentEntry,
  options: AttachmentKeySource = {},
): void => {
  arm_vault_listener();

  const key = registry_key(mail_item_id, seq);
  const existing = registry.get(key);

  if (options.unencrypted) {
    if (existing !== undefined && !unsealed_entries.has(key)) return;
    unsealed_entries.add(key);
  } else {
    unsealed_entries.delete(key);
  }

  registry.set(key, entry);
  if (!item_fingerprints.has(mail_item_id)) {
    item_fingerprints.set(mail_item_id, "");
  }
  entry_fingerprints.set(key, item_fingerprints.get(mail_item_id) ?? "");

  const seqs = item_seqs.get(mail_item_id) ?? new Set<number>();

  seqs.add(seq);
  item_seqs.delete(mail_item_id);
  item_seqs.set(mail_item_id, seqs);
  evict_oldest_items();

  if (existing?.key === entry.key) return;

  mark_item_changed(mail_item_id);
};

export const register_envelope_attachment_keys = (
  mail_item_id: string | undefined,
  envelope: unknown,
  options: AttachmentKeySource = {},
): void => {
  if (!mail_item_id || typeof envelope !== "object" || envelope === null) {
    return;
  }

  const keys = (envelope as { attachment_keys?: unknown }).attachment_keys;

  if (sealed_items.has(mail_item_id)) {
    if (item_fingerprints.get(mail_item_id) === keys_fingerprint(keys)) {
      pending_envelopes.delete(mail_item_id);
    } else {
      pending_envelopes.set(mail_item_id, { keys, options });
    }

    return;
  }

  pending_envelopes.delete(mail_item_id);
  apply_envelope_keys(mail_item_id, keys, options);
};

function apply_envelope_keys(
  mail_item_id: string,
  keys: unknown,
  options: AttachmentKeySource,
): void {
  const fingerprint = keys_fingerprint(keys);
  const previous = item_fingerprints.get(mail_item_id);
  const keeps_encrypted_keys =
    options.unencrypted === true && has_encrypted_entry(mail_item_id);

  if (
    !keeps_encrypted_keys &&
    previous !== undefined &&
    previous !== fingerprint
  ) {
    reset_item(mail_item_id);
  }

  if (keeps_encrypted_keys) {
    item_fingerprints.set(mail_item_id, previous ?? "");
  } else if (has_item_state(mail_item_id)) {
    adopt_fingerprint(mail_item_id, fingerprint);
  } else if (fingerprint) {
    item_fingerprints.set(mail_item_id, fingerprint);
  } else {
    item_fingerprints.delete(mail_item_id);
  }

  if (!Array.isArray(keys)) return;

  for (const entry of keys) {
    if (typeof entry?.seq !== "number" || typeof entry?.key !== "string") {
      continue;
    }

    listed_items.add(mail_item_id);
    register_attachment_entry(
      mail_item_id,
      entry.seq,
      {
        key: entry.key,
        filename:
          typeof entry.filename === "string" ? entry.filename : undefined,
        content_type:
          typeof entry.content_type === "string"
            ? entry.content_type
            : undefined,
        content_id:
          typeof entry.content_id === "string" ? entry.content_id : undefined,
        size: typeof entry.size === "number" ? entry.size : undefined,
      },
      options,
    );
  }
}

const optional_text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const read_sealed_entry = (
  raw: unknown,
): { seq: number; entry: InboundAttachmentEntry } | null => {
  if (typeof raw !== "object" || raw === null) return null;

  const fields = raw as Record<string, unknown>;

  if (
    typeof fields.seq !== "number" ||
    !Number.isInteger(fields.seq) ||
    fields.seq < 0 ||
    typeof fields.key !== "string" ||
    fields.key.length === 0
  ) {
    return null;
  }

  return {
    seq: fields.seq,
    entry: {
      key: fields.key,
      filename: optional_text(fields.filename),
      content_type: optional_text(fields.content_type),
      content_id: optional_text(fields.content_id),
      size: typeof fields.size === "number" ? fields.size : undefined,
      sha256: optional_text(fields.sha256)?.trim().toLowerCase(),
      is_inline: fields.is_inline === true,
      sealed: true,
    },
  };
};

const read_sealed_manifest = (
  manifest: unknown,
): { seq: number; entry: InboundAttachmentEntry }[] | null => {
  if (!Array.isArray(manifest) || manifest.length === 0) return null;

  const entries: { seq: number; entry: InboundAttachmentEntry }[] = [];

  for (const raw of manifest) {
    const parsed = read_sealed_entry(raw);

    if (!parsed) return null;
    entries.push(parsed);
  }

  return entries;
};

const same_sealed_entry = (
  current: InboundAttachmentEntry | undefined,
  next: InboundAttachmentEntry,
): boolean =>
  current !== undefined &&
  current.sealed === true &&
  current.key === next.key &&
  current.filename === next.filename &&
  current.content_type === next.content_type &&
  current.content_id === next.content_id &&
  current.size === next.size &&
  current.sha256 === next.sha256 &&
  current.is_inline === next.is_inline;

const holds_same_manifest = (
  mail_item_id: string,
  entries: { seq: number; entry: InboundAttachmentEntry }[],
): boolean => {
  if (!sealed_items.has(mail_item_id)) return false;

  const seqs = item_seqs.get(mail_item_id);

  if (seqs === undefined || seqs.size !== entries.length) return false;

  return entries.every(({ seq, entry }) =>
    same_sealed_entry(current_entry(mail_item_id, seq), entry),
  );
};

export const register_sealed_attachment_manifest = (
  mail_item_id: string | undefined,
  manifest: unknown,
): boolean => {
  if (!mail_item_id) return false;

  const entries = read_sealed_manifest(manifest);

  if (entries === null) {
    drop_sealed_entries(mail_item_id);

    return false;
  }

  pending_envelopes.delete(mail_item_id);

  if (holds_same_manifest(mail_item_id, entries)) return true;

  reset_item(mail_item_id);

  for (const { seq, entry } of entries) {
    register_attachment_entry(mail_item_id, seq, entry);
  }

  if (!item_seqs.has(mail_item_id)) return false;

  sealed_items.add(mail_item_id);
  listed_items.add(mail_item_id);

  return true;
};

export const has_sealed_attachment_manifest = (mail_item_id: string): boolean =>
  sealed_items.has(mail_item_id);

export const get_attachment_entry = (
  mail_item_id: string,
  seq: number,
): InboundAttachmentEntry | null =>
  touch_entry(mail_item_id, seq) ?? null;

export const get_attachment_key = (mail_item_id: string, seq: number): string =>
  touch_entry(mail_item_id, seq)?.key ?? "";

export const has_envelope_attachment_keys = (mail_item_id: string): boolean =>
  listed_items.has(mail_item_id);

export const is_attachment_row_listed = (
  mail_item_id: string,
  seq: number,
): boolean =>
  !listed_items.has(mail_item_id) ||
  current_entry(mail_item_id, seq) !== undefined;

export const listed_attachment_rows = <
  Row extends { mail_item_id: string; seq_num: number },
>(
  rows: Row[],
): Row[] =>
  rows.filter((row) => is_attachment_row_listed(row.mail_item_id, row.seq_num));

export const clear_attachment_keys = (): void => {
  registry.clear();
  unsealed_entries.clear();
  item_seqs.clear();
  listed_items.clear();
  sealed_items.clear();
  item_versions.clear();
  item_fingerprints.clear();
  entry_fingerprints.clear();
  pending_envelopes.clear();
  version += 1;

  for (const listener of listeners) {
    listener();
  }
};
