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
import type { EncryptedVault } from "./key_manager_core";
import type {
  LockedFolderPageItem,
  LockedFolderRekeyDeps,
} from "./locked_folder_rekey";

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./envelope", () => ({
  normalize_parsed_envelope: (value: unknown) => value,
  decrypt_envelope_plaintext_with_bytes: vi.fn(async (encrypted: string) => {
    const text = atob(encrypted);

    return text.startsWith("good") ? `{"subject":"${text}"}` : null;
  }),
}));

import {
  LOCKED_FOLDER_REKEY_LIMIT,
  read_locked_folder_rekey_cursor,
  reset_locked_folder_rekey,
  trigger_locked_folder_rekey,
} from "./locked_folder_rekey";
import { reset_attachment_meta_rekey_cache } from "./envelope_v2_rekey";
import { ATTACHMENT_META_V2_NONCE } from "./attachment_meta_v2";
import { decrypt_envelope_v2_plaintext, envelope_sha256_hex } from "./envelope_v2";
import { base64_to_array } from "./base64";
import { mark_level2_admitted, reset_level2_state } from "./vault_level2";
import {
  clear_all_folder_unlock_records,
  clear_folder_unlock_record,
  get_unlock_token,
  on_folder_unlock_change,
  set_folder_unlock_record,
} from "@/services/folder_unlock_store";
import {
  note_locked_folder_listing,
  on_locked_folder_listing,
} from "@/services/locked_folder_listing";

const DATA_KEK = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const FOLDER = "folder-token";
const USER_ID = "user-1";
const UNLOCK_SECRET = "secret-unlock";

type TestRow = LockedFolderPageItem & { is_trashed?: boolean };

function row(
  id: string,
  item_type: string,
  text: string,
  nonce = "AQ==",
): TestRow {
  return { id, item_type, encrypted_envelope: btoa(text), envelope_nonce: nonce };
}

function trashed_row(
  id: string,
  item_type: string,
  text: string,
  nonce = "AQ==",
): TestRow {
  return { ...row(id, item_type, text, nonce), is_trashed: true };
}

function memory_store() {
  const map = new Map<string, string>();

  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

function make_deps(
  rows: TestRow[],
  unlocked: () => boolean = () => true,
) {
  const store = memory_store();
  const list_page = vi.fn(
    async (_folder: string, offset: number, limit: number, trashed: boolean) => {
      const visible = rows.filter((entry) => !!entry.is_trashed === trashed);

      return {
        data: {
          items: visible
            .slice(offset, offset + limit)
            .map(({ is_trashed: _trashed, ...entry }) => entry),
          has_more: offset + limit < visible.length,
        },
      };
    },
  );
  const update = vi.fn(
    async (id: string, data: { envelope_nonce?: string }) => {
      const target = rows.find((entry) => entry.id === id);

      if (target && data.envelope_nonce) target.envelope_nonce = data.envelope_nonce;

      return { data: { success: true } };
    },
  );
  const is_unlocked = vi.fn(() => unlocked());
  const deps = {
    list_page,
    update,
    get_vault: () => ({ data_kek: DATA_KEK }) as EncryptedVault,
    get_passphrase_bytes: () => new TextEncoder().encode("pass"),
    storage: () => store,
    now: () => 5_000,
    is_unlocked,
    get_user_id: () => USER_ID,
  } as unknown as LockedFolderRekeyDeps;

  return { deps, list_page, update, is_unlocked, store };
}

function v1_rows_left(rows: TestRow[]): number {
  return rows.filter(
    (entry) =>
      (entry.item_type === "sent" || entry.item_type === "draft") &&
      entry.envelope_nonce === "AQ==",
  ).length;
}

beforeEach(() => {
  reset_locked_folder_rekey();
  reset_attachment_meta_rekey_cache();
  reset_level2_state();
  mark_level2_admitted();
  clear_all_folder_unlock_records();
});

describe("trigger_locked_folder_rekey", () => {
  it("rekeys v1 sent and draft rows and leaves received mail alone", async () => {
    const sent = row("s1", "sent", "good-s1");
    const original = sent.encrypted_envelope as string;
    const rows = [
      sent,
      row("d1", "draft", "good-d1"),
      row("r1", "received", "good-r1"),
      row("s2", "sent", "good-s2", "Ag=="),
    ];
    const { deps, update } = make_deps(rows);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(update.mock.calls.map((c) => c[0])).toEqual(["s1", "d1"]);

    const body = (update.mock.calls[0] as unknown as [
      string,
      { encrypted_envelope: string; envelope_nonce: string; expected_envelope_sha256: string },
    ])[1];

    expect(body.envelope_nonce).toBe("Ag==");
    expect(body.expected_envelope_sha256).toBe(await envelope_sha256_hex(original));
    expect(
      await decrypt_envelope_v2_plaintext(body.encrypted_envelope, [
        base64_to_array(DATA_KEK),
      ]),
    ).toBe('{"subject":"good-s1"}');
    expect(JSON.stringify(update.mock.calls)).not.toContain("unlock");
  });

  it("resumes on later unlocks until no v1 rows remain", async () => {
    const rows = Array.from({ length: 2 * LOCKED_FOLDER_REKEY_LIMIT + 50 }, (_, i) =>
      row(`s${i}`, i % 3 === 0 ? "draft" : "sent", `good-${i}`),
    );
    const { deps, update, store, list_page } = make_deps(rows);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("more");
    expect(update).toHaveBeenCalledTimes(LOCKED_FOLDER_REKEY_LIMIT);
    expect(read_locked_folder_rekey_cursor(store, USER_ID, FOLDER)).toEqual({
      offset: LOCKED_FOLDER_REKEY_LIMIT,
      trash_offset: 0,
    });

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("more");
    expect(update).toHaveBeenCalledTimes(LOCKED_FOLDER_REKEY_LIMIT);

    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("more");
    expect(update).toHaveBeenCalledTimes(2 * LOCKED_FOLDER_REKEY_LIMIT);
    expect(list_page.mock.calls[list_page.mock.calls.length - 1]?.[1]).toBe(
      2 * LOCKED_FOLDER_REKEY_LIMIT,
    );

    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(update).toHaveBeenCalledTimes(rows.length);
    expect(v1_rows_left(rows)).toBe(0);
    expect(read_locked_folder_rekey_cursor(store, USER_ID, FOLDER)).toEqual({
      offset: 0,
      done_at: 5_000,
      trash_offset: 0,
      trash_done_at: 5_000,
    });

    const listed = list_page.mock.calls.length;

    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(list_page).toHaveBeenCalledTimes(listed);
    expect(new Set(update.mock.calls.map((c) => c[0])).size).toBe(rows.length);
  });

  it("never stores or passes the unlock token", async () => {
    set_folder_unlock_record({
      folder_id: "f1",
      folder_token: FOLDER,
      unlock_token: UNLOCK_SECRET,
      unlock_expires_at: null,
    });

    const rows = Array.from({ length: LOCKED_FOLDER_REKEY_LIMIT + 10 }, (_, i) =>
      row(`s${i}`, "sent", `good-${i}`),
    );
    const { deps, store, list_page, update } = make_deps(
      rows,
      () => get_unlock_token(FOLDER) !== null,
    );

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("more");
    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");

    const persisted = JSON.stringify([...store.map.entries()]);

    expect(store.map.size).toBe(1);
    expect(persisted).not.toContain(UNLOCK_SECRET);
    expect(JSON.stringify(list_page.mock.calls)).not.toContain(UNLOCK_SECRET);
    expect(JSON.stringify(update.mock.calls)).not.toContain(UNLOCK_SECRET);
    for (const call of list_page.mock.calls) expect(call).toHaveLength(4);
  });

  it("stops as soon as the folder locks and resumes after the next unlock", async () => {
    let unlocked = true;
    const rows = [row("s1", "sent", "good-1"), row("s2", "sent", "good-2"), row("d1", "draft", "good-3")];
    const { deps, update } = make_deps(rows, () => unlocked);
    const write = update.getMockImplementation();

    update.mockImplementationOnce(async (id, data) => {
      unlocked = false;

      return write ? write(id, data) : { data: { success: true } };
    });

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("stopped");
    expect(update).toHaveBeenCalledTimes(1);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("stopped");
    expect(update).toHaveBeenCalledTimes(1);

    unlocked = true;
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(update.mock.calls.map((c) => c[0])).toEqual(["s1", "s2", "d1"]);
    expect(v1_rows_left(rows)).toBe(0);
  });

  it("keeps the folder open while a held draft still needs work", async () => {
    const rows = [row("d1", "draft", "good-d1"), row("s1", "sent", "good-s1")];
    const { deps, update, store } = make_deps(rows);
    const busy = new Set(["d1"]);

    deps.is_draft_busy = (id) => busy.has(id);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("incomplete");
    expect(read_locked_folder_rekey_cursor(store, USER_ID, FOLDER).done_at).toBeUndefined();

    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("incomplete");
    expect(update.mock.calls.map((c) => c[0])).toEqual(["s1"]);

    busy.clear();
    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(update.mock.calls.map((c) => c[0])).toEqual(["s1", "d1"]);
  });

  it("moves password attachment metas in the folder under the data key", async () => {
    const rows = [
      { ...row("s1", "sent", "good-s1", "Ag=="), has_attachments: true },
      { ...row("r1", "received", "good-r1", "Ag=="), has_attachments: true },
    ];
    const { deps } = make_deps(rows);
    const nonce = btoa(String.fromCharCode(7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7));
    const batch_meta = vi.fn(async (mail_ids: string[]) => ({
      data: {
        items: Object.fromEntries(
          mail_ids.map((id) => [
            id,
            [
              {
                id: `att-${id}`,
                mail_item_id: id,
                encrypted_meta: btoa(`good-meta-${id}`),
                meta_nonce: nonce,
                size_bytes: 1,
                seq_num: 0,
              },
            ],
          ]),
        ),
      },
    }));
    const update_meta = vi.fn(
      async (_id: string, _data: { encrypted_meta: string; meta_nonce: string }) => ({
        data: { status: "ok" },
      }),
    );

    deps.batch_meta = batch_meta;
    deps.update_meta = update_meta;

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(batch_meta.mock.calls).toEqual([[["s1"]]]);
    expect(update_meta).toHaveBeenCalledTimes(1);

    const [id, body] = update_meta.mock.calls[0] as [
      string,
      { encrypted_meta: string; meta_nonce: string },
    ];

    expect(id).toBe("att-s1");
    expect(body.meta_nonce).toBe(ATTACHMENT_META_V2_NONCE);
    expect(
      await decrypt_envelope_v2_plaintext(body.encrypted_meta, [
        base64_to_array(DATA_KEK),
      ]),
    ).toBe('{"subject":"good-meta-s1"}');
  });

  it("does nothing when the account is not admitted", async () => {
    reset_level2_state();
    const { deps, update, list_page } = make_deps([row("s1", "sent", "good-1")]);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("unavailable");
    expect(list_page).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("locked folder trash phase", () => {
  function phases(list_page: ReturnType<typeof make_deps>["list_page"]) {
    return list_page.mock.calls.map((call) => [call[1], call[3]]);
  }

  it("rekeys live mail first and trashed mail after it", async () => {
    const rows = [
      trashed_row("t1", "sent", "good-t1"),
      row("s1", "sent", "good-s1"),
      trashed_row("t2", "received", "good-t2"),
      trashed_row("t3", "draft", "good-t3"),
      row("d1", "draft", "good-d1"),
    ];
    const { deps, update, list_page, store } = make_deps(rows);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(update.mock.calls.map((c) => c[0])).toEqual(["s1", "d1", "t1", "t3"]);
    expect(phases(list_page)).toEqual([
      [0, false],
      [0, true],
    ]);
    expect(rows.find((entry) => entry.id === "t2")?.envelope_nonce).toBe("AQ==");

    const body = (update.mock.calls[2] as unknown as [
      string,
      { encrypted_envelope: string; envelope_nonce: string; expected_envelope_sha256: string },
    ])[1];

    expect(body.envelope_nonce).toBe("Ag==");
    expect(body.expected_envelope_sha256).toBe(
      await envelope_sha256_hex(btoa("good-t1")),
    );
    expect(read_locked_folder_rekey_cursor(store, USER_ID, FOLDER)).toEqual({
      offset: 0,
      done_at: 5_000,
      trash_offset: 0,
      trash_done_at: 5_000,
    });
  });

  it("shares one unlock budget across both phases", async () => {
    const live = Array.from({ length: LOCKED_FOLDER_REKEY_LIMIT - 10 }, (_, i) =>
      row(`s${i}`, "sent", `good-s${i}`),
    );
    const trash = Array.from({ length: 30 }, (_, i) =>
      trashed_row(`t${i}`, "sent", `good-t${i}`),
    );
    const rows = [...live, ...trash];
    const { deps, update, store } = make_deps(rows);

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("more");
    expect(update).toHaveBeenCalledTimes(LOCKED_FOLDER_REKEY_LIMIT);

    const cursor = read_locked_folder_rekey_cursor(store, USER_ID, FOLDER);

    expect(cursor.done_at).toBe(5_000);
    expect(cursor.trash_done_at).toBeUndefined();

    reset_locked_folder_rekey(FOLDER);
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(update).toHaveBeenCalledTimes(rows.length);
    expect(v1_rows_left(rows)).toBe(0);
  });

  it("resumes from a cursor saved before the trash phase existed", async () => {
    const rows = [
      row("s0", "sent", "good-s0", "Ag=="),
      row("s1", "sent", "good-s1", "Ag=="),
      row("s2", "sent", "good-s2"),
      trashed_row("t1", "sent", "good-t1"),
    ];
    const { deps, update, list_page, store } = make_deps(rows);
    const key = `astermail_locked_folder_rekey_${USER_ID}_${FOLDER}`;

    store.setItem(key, JSON.stringify({ offset: 2 }));
    expect(read_locked_folder_rekey_cursor(store, USER_ID, FOLDER)).toEqual({
      offset: 2,
      trash_offset: 0,
    });

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(phases(list_page)).toEqual([
      [2, false],
      [0, true],
    ]);
    expect(update.mock.calls.map((c) => c[0])).toEqual(["s2", "t1"]);
  });

  it("runs only the trash phase for a folder finished before it existed", async () => {
    const rows = [row("s1", "sent", "good-s1"), trashed_row("t1", "draft", "good-t1")];
    const { deps, update, list_page, store } = make_deps(rows);
    const key = `astermail_locked_folder_rekey_${USER_ID}_${FOLDER}`;

    store.setItem(key, JSON.stringify({ offset: 0, done_at: 4_000 }));

    const before = read_locked_folder_rekey_cursor(store, USER_ID, FOLDER);

    expect(before.done_at).toBe(4_000);
    expect(before.trash_done_at).toBeUndefined();

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(phases(list_page)).toEqual([[0, true]]);
    expect(update.mock.calls.map((c) => c[0])).toEqual(["t1"]);
    expect(read_locked_folder_rekey_cursor(store, USER_ID, FOLDER)).toEqual({
      offset: 0,
      done_at: 4_000,
      trash_offset: 0,
      trash_done_at: 5_000,
    });
  });

  it("stops writing when the folder locks during the trash phase", async () => {
    let unlocked = true;
    const trash = Array.from({ length: 60 }, (_, i) =>
      trashed_row(`t${i}`, "sent", `good-t${i}`),
    );
    const rows = [row("s1", "sent", "good-s1"), ...trash];
    const { deps, update, store, list_page } = make_deps(rows, () => unlocked);
    const write = update.getMockImplementation();

    update.mockImplementation(async (id, data) => {
      const result = write ? await write(id, data) : { data: { success: true } };

      if (id === "t51") unlocked = false;

      return result;
    });

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("stopped");
    expect(update.mock.calls.map((c) => c[0])).toContain("t51");
    expect(update).toHaveBeenCalledTimes(1 + 52);

    const cursor = read_locked_folder_rekey_cursor(store, USER_ID, FOLDER);

    expect(cursor.done_at).toBe(5_000);
    expect(cursor.trash_offset).toBe(50);
    expect(cursor.trash_done_at).toBeUndefined();

    const listed = list_page.mock.calls.length;

    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("stopped");
    expect(list_page).toHaveBeenCalledTimes(listed);
    expect(update).toHaveBeenCalledTimes(1 + 52);

    unlocked = true;
    expect(await trigger_locked_folder_rekey(FOLDER, deps)).toBe("done");
    expect(list_page.mock.calls[listed]?.slice(1)).toEqual([50, 50, true]);
    expect(update).toHaveBeenCalledTimes(rows.length);
    expect(v1_rows_left(rows)).toBe(0);
    expect(JSON.stringify([...store.map.entries()])).not.toContain(UNLOCK_SECRET);
  });
});

describe("locked folder signals", () => {
  it("reports listings and unlock changes by folder token only", () => {
    const listed = vi.fn();
    const changed = vi.fn();
    const stop_listing = on_locked_folder_listing(listed);
    const stop_change = on_folder_unlock_change(changed);
    const listed_row = row("s1", "sent", "good-1");

    note_locked_folder_listing(FOLDER, [listed_row]);
    set_folder_unlock_record({
      folder_id: "f1",
      folder_token: FOLDER,
      unlock_token: UNLOCK_SECRET,
      unlock_expires_at: null,
    });
    clear_folder_unlock_record("f1");

    expect(listed).toHaveBeenCalledWith(FOLDER, [listed_row]);
    expect(changed.mock.calls).toEqual([[FOLDER], [FOLDER]]);
    expect(JSON.stringify(changed.mock.calls)).not.toContain(UNLOCK_SECRET);

    stop_listing();
    stop_change();
  });
});
