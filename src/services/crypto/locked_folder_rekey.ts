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
import type { ApiResponse } from "@/services/api/client/helpers";
import type { EnvelopeV2RekeyDeps } from "./envelope_v2_rekey";

import { rekey_attachment_metas, rekey_envelope_item } from "./envelope_v2_rekey";
import {
  envelope_v2_write_key,
  is_envelope_v1_nonce,
  wipe_envelope_v2_keys,
} from "./envelope_v2";
import { is_level2_admitted } from "./vault_level2";
import { zero_uint8_array } from "./secure_memory";

export const LOCKED_FOLDER_REKEY_LIMIT = 200;
export const LOCKED_FOLDER_REKEY_PAGE_SIZE = 50;

const CURSOR_KEY_PREFIX = "astermail_locked_folder_rekey_";
const RESCAN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const REKEY_ITEM_TYPES = new Set(["sent", "draft"]);

export type LockedFolderRekeyResult =
  | "done"
  | "more"
  | "incomplete"
  | "paused"
  | "stopped"
  | "unavailable";

export interface LockedFolderPageItem {
  id: string;
  item_type?: string;
  encrypted_envelope?: string;
  envelope_nonce?: string;
  has_attachments?: boolean;
  attachment_count?: number;
}

export interface LockedFolderRekeyCursor {
  offset: number;
  incomplete?: boolean;
  done_at?: number;
  trash_offset: number;
  trash_incomplete?: boolean;
  trash_done_at?: number;
}

interface FolderPhase {
  trashed: boolean;
  offset: "offset" | "trash_offset";
  incomplete: "incomplete" | "trash_incomplete";
  done_at: "done_at" | "trash_done_at";
}

const FOLDER_PHASES: FolderPhase[] = [
  {
    trashed: false,
    offset: "offset",
    incomplete: "incomplete",
    done_at: "done_at",
  },
  {
    trashed: true,
    offset: "trash_offset",
    incomplete: "trash_incomplete",
    done_at: "trash_done_at",
  },
];

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export interface LockedFolderRekeyDeps
  extends Pick<
    EnvelopeV2RekeyDeps,
    | "update"
    | "get_vault"
    | "get_passphrase_bytes"
    | "is_draft_busy"
    | "storage"
    | "now"
    | "batch_meta"
    | "update_meta"
  > {
  list_page: (
    folder_token: string,
    offset: number,
    limit: number,
    trashed: boolean,
  ) => Promise<
    ApiResponse<{ items: LockedFolderPageItem[]; has_more?: boolean }>
  >;
  is_unlocked: (folder_token: string) => boolean;
  get_user_id: () => string | null;
}

interface UnlockSession {
  attempted: number;
  settled: LockedFolderRekeyResult | null;
  running: Promise<LockedFolderRekeyResult> | null;
}

const sessions = new Map<string, UnlockSession>();

export function reset_locked_folder_rekey(folder_token?: string | null): void {
  if (folder_token) {
    sessions.delete(folder_token);
  } else {
    sessions.clear();
  }
}

function cursor_key(user_id: string, folder_token: string): string {
  return `${CURSOR_KEY_PREFIX}${user_id}_${folder_token}`;
}

export function read_locked_folder_rekey_cursor(
  store: KeyValueStore | null,
  user_id: string,
  folder_token: string,
): LockedFolderRekeyCursor {
  try {
    const raw = store?.getItem(cursor_key(user_id, folder_token));

    if (!raw) return { offset: 0, trash_offset: 0 };

    const parsed = JSON.parse(raw) as Partial<
      Record<keyof LockedFolderRekeyCursor, unknown>
    >;

    return {
      offset: read_offset(parsed.offset),
      incomplete: parsed.incomplete === true ? true : undefined,
      done_at: read_time(parsed.done_at),
      trash_offset: read_offset(parsed.trash_offset),
      trash_incomplete: parsed.trash_incomplete === true ? true : undefined,
      trash_done_at: read_time(parsed.trash_done_at),
    };
  } catch {
    return { offset: 0, trash_offset: 0 };
  }
}

function read_offset(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function read_time(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function write_cursor(
  store: KeyValueStore | null,
  user_id: string,
  folder_token: string,
  cursor: LockedFolderRekeyCursor,
): void {
  const stored: LockedFolderRekeyCursor = {
    offset: cursor.offset,
    trash_offset: cursor.trash_offset,
  };

  if (cursor.incomplete) stored.incomplete = true;
  if (cursor.done_at !== undefined) stored.done_at = cursor.done_at;
  if (cursor.trash_incomplete) stored.trash_incomplete = true;
  if (cursor.trash_done_at !== undefined) {
    stored.trash_done_at = cursor.trash_done_at;
  }

  try {
    store?.setItem(cursor_key(user_id, folder_token), JSON.stringify(stored));
  } catch {
    return;
  }
}

function may_have_attachments(item: LockedFolderPageItem): boolean {
  return item.has_attachments === true || (item.attachment_count ?? 0) > 0;
}

function has_v1_envelope(
  item: LockedFolderPageItem,
): item is LockedFolderPageItem & { encrypted_envelope: string } {
  return !!item.encrypted_envelope && is_envelope_v1_nonce(item.envelope_nonce);
}

interface PhaseContext {
  folder_token: string;
  session: UnlockSession;
  deps: LockedFolderRekeyDeps;
  cursor: LockedFolderRekeyCursor;
  passphrase: Uint8Array;
  kek: Uint8Array;
  active: () => boolean;
  stop: () => "stopped";
  save: () => void;
}

async function run_phase(
  phase: FolderPhase,
  context: PhaseContext,
): Promise<LockedFolderRekeyResult | "finished"> {
  const { folder_token, session, deps, cursor, passphrase, kek } = context;
  const { active, stop, save } = context;

  for (;;) {
    if (!active()) return stop();

    const page_offset = cursor[phase.offset];
    const response = await deps.list_page(
      folder_token,
      page_offset,
      LOCKED_FOLDER_REKEY_PAGE_SIZE,
      phase.trashed,
    );

    if (!active()) return stop();
    if (!response.data) return "paused";

    const items = response.data.items ?? [];
    const meta_items: LockedFolderPageItem[] = [];

    for (const item of items) {
      if (!active()) return stop();
      if (!item.id || !item.item_type) continue;
      if (!REKEY_ITEM_TYPES.has(item.item_type)) continue;

      if (deps.is_draft_busy?.(item.id)) {
        if (has_v1_envelope(item) || may_have_attachments(item)) {
          cursor[phase.incomplete] = true;
          save();
        }
        continue;
      }

      meta_items.push(item);

      if (!has_v1_envelope(item)) continue;
      if (session.attempted >= LOCKED_FOLDER_REKEY_LIMIT) {
        save();

        return "more";
      }

      session.attempted += 1;

      const outcome = await rekey_envelope_item(item, passphrase, kek, deps);

      if (outcome === "paused" || outcome === "unavailable") {
        save();

        return outcome;
      }
      if (outcome === "changed" || outcome === "failed") {
        cursor[phase.incomplete] = true;
        save();
      }
    }

    if (!active()) return stop();

    const metas = await rekey_attachment_metas(
      meta_items,
      passphrase,
      kek,
      deps,
      LOCKED_FOLDER_REKEY_LIMIT - session.attempted,
    );

    session.attempted += metas.attempted;

    if (metas.outcome === "limit") {
      save();

      return "more";
    }
    if (metas.outcome === "paused" || metas.outcome === "unavailable") {
      save();

      return metas.outcome;
    }
    if (metas.outcome === "incomplete" || metas.outcome === "failed") {
      cursor[phase.incomplete] = true;
    }

    const finished =
      items.length === 0 ||
      (items.length < LOCKED_FOLDER_REKEY_PAGE_SIZE && !response.data.has_more);

    if (finished) {
      cursor[phase.done_at] = cursor[phase.incomplete] ? undefined : deps.now();
      cursor[phase.offset] = 0;
      cursor[phase.incomplete] = undefined;
      save();

      return "finished";
    }

    cursor[phase.offset] = page_offset + items.length;
    save();
  }
}

function take_pending_phases(
  cursor: LockedFolderRekeyCursor,
  now: number,
): FolderPhase[] {
  return FOLDER_PHASES.filter((phase) => {
    const done_at = cursor[phase.done_at];

    if (done_at === undefined) return true;
    if (now - done_at < RESCAN_AFTER_MS) return false;

    cursor[phase.offset] = 0;
    cursor[phase.incomplete] = undefined;
    cursor[phase.done_at] = undefined;

    return true;
  });
}

async function run_folder(
  folder_token: string,
  session: UnlockSession,
  deps: LockedFolderRekeyDeps,
): Promise<LockedFolderRekeyResult> {
  const user_id = deps.get_user_id();

  if (!user_id) return "unavailable";

  const store = deps.storage();
  const cursor = read_locked_folder_rekey_cursor(store, user_id, folder_token);
  const pending = take_pending_phases(cursor, deps.now());

  if (pending.length === 0) return "done";

  const kek = envelope_v2_write_key(deps.get_vault());

  if (!kek) return "unavailable";

  const passphrase = deps.get_passphrase_bytes();

  if (!passphrase) {
    wipe_envelope_v2_keys([kek]);

    return "unavailable";
  }

  const context: PhaseContext = {
    folder_token,
    session,
    deps,
    cursor,
    passphrase,
    kek,
    active: () =>
      sessions.get(folder_token) === session &&
      is_level2_admitted() &&
      deps.is_unlocked(folder_token),
    stop: () => {
      if (sessions.get(folder_token) === session) sessions.delete(folder_token);

      return "stopped";
    },
    save: () => write_cursor(store, user_id, folder_token, cursor),
  };

  try {
    for (const phase of pending) {
      const result = await run_phase(phase, context);

      if (result !== "finished") return result;
    }

    return FOLDER_PHASES.every((phase) => cursor[phase.done_at] !== undefined)
      ? "done"
      : "incomplete";
  } catch {
    return "paused";
  } finally {
    zero_uint8_array(passphrase);
    wipe_envelope_v2_keys([kek]);
  }
}

export function trigger_locked_folder_rekey(
  folder_token: string,
  deps: LockedFolderRekeyDeps,
): Promise<LockedFolderRekeyResult> {
  if (!folder_token || !is_level2_admitted()) {
    return Promise.resolve("unavailable");
  }
  if (!deps.is_unlocked(folder_token)) {
    reset_locked_folder_rekey(folder_token);

    return Promise.resolve("stopped");
  }

  let session = sessions.get(folder_token);

  if (!session) {
    session = { attempted: 0, settled: null, running: null };
    sessions.set(folder_token, session);
  }

  if (session.running) return session.running;
  if (session.settled) return Promise.resolve(session.settled);
  if (session.attempted >= LOCKED_FOLDER_REKEY_LIMIT) {
    return Promise.resolve("more");
  }

  const current = session;

  current.running = run_folder(folder_token, current, deps)
    .catch((): LockedFolderRekeyResult => "paused")
    .then((result) => {
      if (result === "done" || result === "incomplete") {
        current.settled = result;
      }

      return result;
    })
    .finally(() => {
      current.running = null;
    });

  return current.running;
}
