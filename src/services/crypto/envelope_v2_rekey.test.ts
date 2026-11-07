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
import type { EnvelopeV2RekeyDeps } from "./envelope_v2_rekey";

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./envelope", () => ({
  normalize_parsed_envelope: (value: unknown) => value,
  decrypt_envelope_plaintext_with_bytes: vi.fn(async (encrypted: string) => {
    const text = atob(encrypted);

    return text.startsWith("good") ? `{"subject":"${text}"}` : null;
  }),
}));

import {
  ENVELOPE_V2_REKEY_RUN_LIMIT,
  read_envelope_v2_rekey_state,
  reset_attachment_meta_rekey_cache,
  run_envelope_v2_rekey,
} from "./envelope_v2_rekey";
import { ATTACHMENT_META_V2_NONCE } from "./attachment_meta_v2";
import { decrypt_envelope_v2_plaintext, envelope_sha256_hex } from "./envelope_v2";
import { base64_to_array } from "./base64";
import {
  get_level2_admission,
  mark_level2_admitted,
  reset_level2_state,
} from "./vault_level2";

const DATA_KEK = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const USER_ID = "user-1";

function item(id: string, text: string, nonce = "AQ==") {
  return { id, encrypted_envelope: btoa(text), envelope_nonce: nonce };
}

function memory_store() {
  const map = new Map<string, string>();

  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function make_deps(
  pages: Record<string, Array<{ items: unknown[]; next_cursor?: string }>>,
  update_status: (id: string) => { error?: string; status?: number; server_code?: string } = () => ({}),
) {
  const store = memory_store();
  const list = vi.fn(async (params: { item_type?: string; cursor?: string }) => {
    const type_pages = pages[params.item_type ?? ""] ?? [];
    const index = params.cursor ? Number(params.cursor) : 0;
    const page = type_pages[index] ?? { items: [] };

    return {
      data: {
        items: page.items,
        total: page.items.length,
        next_cursor: page.next_cursor,
        has_more: !!page.next_cursor,
      },
    };
  });
  const update = vi.fn(async (id: string) => {
    const result = update_status(id);

    return result.error ? result : { data: { success: true }, ...result };
  });
  const deps = {
    list,
    update,
    get_vault: () => ({ data_kek: DATA_KEK }) as EncryptedVault,
    get_passphrase_bytes: () => new TextEncoder().encode("pass"),
    storage: () => store,
    now: () => 1_000,
  } as unknown as EnvelopeV2RekeyDeps;

  return { deps, list, update, store };
}

function track_conversions(deps: EnvelopeV2RekeyDeps) {
  const converted = new Set<string>();
  const list = deps.list;
  const update = deps.update;

  deps.list = async (params) => {
    const response = await list(params);

    if (!response.data) return response;

    return {
      ...response,
      data: {
        ...response.data,
        items: response.data.items.map((entry) =>
          converted.has(entry.id) ? { ...entry, envelope_nonce: "Ag==" } : entry,
        ),
      },
    };
  };
  deps.update = async (id, data) => {
    const response = await update(id, data);

    if (!response.error) converted.add(id);

    return response;
  };

  return converted;
}

const PASSWORD_META_NONCE = btoa(String.fromCharCode(9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1));
const SEALED_ZERO_NONCE = btoa(String.fromCharCode(...new Array(12).fill(0)));

function meta(id: string, mail_item_id: string, text: string, nonce = PASSWORD_META_NONCE) {
  return {
    id,
    mail_item_id,
    encrypted_meta: btoa(text),
    meta_nonce: nonce,
    size_bytes: 1,
    seq_num: 0,
  };
}

function with_metas(
  deps: EnvelopeV2RekeyDeps,
  metas: ReturnType<typeof meta>[],
  update_status: (id: string) => { error?: string; status?: number } = () => ({}),
) {
  const batch_meta = vi.fn(async (mail_ids: string[]) => {
    const items: Record<string, ReturnType<typeof meta>[]> = {};

    for (const mail_id of mail_ids) {
      items[mail_id] = metas.filter((entry) => entry.mail_item_id === mail_id);
    }

    return { data: { items } };
  });
  const update_meta = vi.fn(
    async (id: string, _data: { encrypted_meta: string; meta_nonce: string }) => {
      const result = update_status(id);

      return result.error ? result : { data: { status: "ok" } };
    },
  );

  deps.batch_meta = batch_meta;
  deps.update_meta = update_meta;

  return { batch_meta, update_meta };
}

beforeEach(() => {
  reset_level2_state();
  mark_level2_admitted();
  reset_attachment_meta_rekey_cache();
});

describe("run_envelope_v2_rekey", () => {
  it("rekeys items outside the default listing", async () => {
    const trashed_sent = {
      ...item("ts", "good-ts"),
      is_trashed: true,
      is_spam: false,
    };
    const trashed_draft = { ...item("td", "good-td"), is_trashed: true };
    const archived_sent = { ...item("as", "good-as"), is_archived: true };
    const spam_sent = { ...item("ss", "good-ss"), is_spam: true };
    const { deps, list, update } = make_deps({
      sent: [{ items: [trashed_sent, archived_sent, spam_sent] }],
      draft: [{ items: [trashed_draft] }],
    });

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      "ts",
      "as",
      "ss",
      "td",
    ]);

    for (const call of list.mock.calls) {
      const params = call[0] as Record<string, unknown>;

      expect(params.include_reactions).toBe(true);
      expect(params).not.toHaveProperty("is_trashed");
      expect(params).not.toHaveProperty("folder_token");
    }
  });

  it("rewrites v1 items as v2 against the stored envelope hash", async () => {
    const first = item("a", "good-a");
    const { deps, update, store } = make_deps({
      sent: [{ items: [first, item("b", "good-b", "Ag=="), item("c", "bad")] }],
      draft: [{ items: [item("d", "good-d")] }],
    });

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update).toHaveBeenCalledTimes(2);

    const [id, body] = update.mock.calls[0] as unknown as [
      string,
      {
        encrypted_envelope: string;
        envelope_nonce: string;
        expected_envelope_sha256: string;
      },
    ];

    expect(id).toBe("a");
    expect(body.envelope_nonce).toBe("Ag==");
    expect(body.expected_envelope_sha256).toBe(
      await envelope_sha256_hex(first.encrypted_envelope),
    );
    expect(
      await decrypt_envelope_v2_plaintext(body.encrypted_envelope, [
        base64_to_array(DATA_KEK),
      ]),
    ).toBe('{"subject":"good-a"}');
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBe(1_000);
    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("skips missing items and finishes the pass", async () => {
    const { deps, update, store } = make_deps(
      { sent: [{ items: [item("a", "good-a"), item("b", "good-b")] }] },
      (id) => (id === "a" ? { error: "x", status: 404 } : {}),
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update).toHaveBeenCalledTimes(2);
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBe(1_000);
  });

  it("skips a changed envelope and leaves the pass open for a retry", async () => {
    let changed = true;
    const { deps, update, store } = make_deps(
      { sent: [{ items: [item("a", "good-a"), item("b", "good-b")] }] },
      (id) =>
        id === "a" && changed
          ? { error: "x", status: 409, server_code: "ENVELOPE_CHANGED" }
          : {},
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("incomplete");
    expect(update).toHaveBeenCalledTimes(2);
    expect(read_envelope_v2_rekey_state(store, USER_ID)).toEqual({
      type_index: 0,
    });

    changed = false;

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update.mock.calls.map((call) => call[0])).toEqual([
      "a",
      "b",
      "a",
      "b",
    ]);
  });

  it.each([
    [{ error: "x", status: 401 }],
    [{ error: "x", status: 403 }],
    [{ error: "x", status: 429 }],
    [{ error: "x", code: "NETWORK_ERROR" }],
  ])("stops on %o and keeps the saved cursor", async (failure) => {
    const { deps, update, store } = make_deps(
      {
        sent: [
          { items: [item("a", "good-a")], next_cursor: "1" },
          { items: [item("b", "good-b"), item("c", "good-c")] },
        ],
      },
      (id) => (id === "b" ? failure : {}),
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("paused");
    expect(update.mock.calls.map((call) => call[0])).toEqual(["a", "b"]);
    expect(read_envelope_v2_rekey_state(store, USER_ID)).toMatchObject({
      type_index: 0,
      cursor: "1",
    });
  });

  it("stops when the update throws", async () => {
    const { deps, update, store } = make_deps({
      sent: [{ items: [item("a", "good-a"), item("b", "good-b")] }],
    });

    update.mockRejectedValueOnce(new Error("offline"));

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("paused");
    expect(update).toHaveBeenCalledTimes(1);
    expect(read_envelope_v2_rekey_state(store, USER_ID)).toEqual({
      type_index: 0,
    });
  });

  it.each([
    [{ error: "x", status: 400 }],
    [{ error: "x", status: 409, server_code: "CONFLICT" }],
  ])("reports %o as a failure", async (failure) => {
    const { deps, update, store } = make_deps(
      { sent: [{ items: [item("a", "good-a"), item("b", "good-b")] }] },
      (id) => (id === "a" ? failure : {}),
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("failed");
    expect(update).toHaveBeenCalledTimes(2);
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBeUndefined();
  });

  it("never sends a rewrite without the envelope hash", async () => {
    const { deps, update } = make_deps({
      sent: [
        {
          items: [
            { id: "a", encrypted_envelope: "%%%", envelope_nonce: "AQ==" },
            item("b", "good-b"),
          ],
        },
      ],
    });

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update.mock.calls.map((call) => call[0])).toEqual(["b"]);

    for (const call of update.mock.calls) {
      expect(((call as unknown[])[1] as { expected_envelope_sha256: string }).expected_envelope_sha256).toMatch(
        /^[0-9a-f]{64}$/,
      );
    }
  });

  it("leaves a draft alone while the composer holds it", async () => {
    const { deps, update, store } = make_deps({
      draft: [{ items: [item("d1", "good-d1"), item("d2", "good-d2")] }],
    });
    const busy = new Set(["d1"]);

    deps.is_draft_busy = (id) => busy.has(id);

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("incomplete");
    expect(update.mock.calls.map((call) => call[0])).toEqual(["d2"]);
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBeUndefined();

    busy.clear();

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update.mock.calls.map((call) => call[0])).toEqual([
      "d2",
      "d1",
      "d2",
    ]);
  });

  it("keeps a held draft open across bounded runs", async () => {
    const many = Array.from({ length: ENVELOPE_V2_REKEY_RUN_LIMIT + 1 }, (_, i) =>
      item(`m${i}`, `good-${i}`),
    );
    const { deps, update, store } = make_deps({
      draft: [
        { items: [item("held", "good-held")], next_cursor: "1" },
        { items: many },
      ],
    });
    const busy = new Set(["held"]);

    track_conversions(deps);
    deps.is_draft_busy = (id) => busy.has(id);

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("more");
    expect(read_envelope_v2_rekey_state(store, USER_ID)).toMatchObject({
      type_index: 1,
      cursor: "1",
      incomplete: true,
    });
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBeUndefined();

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("incomplete");
    expect(read_envelope_v2_rekey_state(store, USER_ID)).toEqual({
      type_index: 0,
    });
    expect(update.mock.calls.map((call) => call[0])).not.toContain("held");

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("incomplete");
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBeUndefined();

    busy.clear();

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update.mock.calls.map((call) => call[0])).toContain("held");
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBe(1_000);
  });

  it("does not hold the pass open for a held draft with nothing to convert", async () => {
    const { deps, update } = make_deps({
      draft: [{ items: [item("held", "good-held", "Ag==")] }],
    });

    deps.is_draft_busy = () => true;

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update).not.toHaveBeenCalled();
  });

  it("moves password attachment metas under the data key", async () => {
    const sent = { ...item("s1", "good-s1", "Ag=="), has_attachments: true };
    const draft = { ...item("d1", "good-d1"), attachment_count: 2 };
    const plain = item("s2", "good-s2", "Ag==");
    const { deps } = make_deps({ sent: [{ items: [sent, plain] }], draft: [{ items: [draft] }] });
    const { batch_meta, update_meta } = with_metas(deps, [
      meta("a1", "s1", "good-meta-a1"),
      meta("a2", "s1", "good-v2", ATTACHMENT_META_V2_NONCE),
      meta("a3", "s1", "good-sealed", SEALED_ZERO_NONCE),
      meta("a4", "d1", "good-meta-a4"),
      meta("a5", "d1", "foreign"),
    ]);

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(batch_meta.mock.calls.map((call) => call[0])).toEqual([["s1"], ["d1"]]);
    expect(update_meta.mock.calls.map((call) => call[0])).toEqual(["a1", "a4"]);

    for (const [id, body] of update_meta.mock.calls) {
      expect(body.meta_nonce).toBe(ATTACHMENT_META_V2_NONCE);
      expect(
        await decrypt_envelope_v2_plaintext(body.encrypted_meta, [
          base64_to_array(DATA_KEK),
        ]),
      ).toBe(`{"subject":"good-meta-${id}"}`);
    }
  });

  it("skips metas of a held draft and keeps the pass open", async () => {
    const draft = { ...item("d1", "good-d1", "Ag=="), has_attachments: true };
    const { deps, store } = make_deps({ draft: [{ items: [draft] }] });
    const { batch_meta } = with_metas(deps, [meta("a1", "d1", "good-meta-a1")]);

    deps.is_draft_busy = () => true;

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("incomplete");
    expect(batch_meta).not.toHaveBeenCalled();
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBeUndefined();
  });

  it("pauses on a 503 meta write and retries it on the next run", async () => {
    let unavailable = true;
    const sent = { ...item("s1", "good-s1", "Ag=="), has_attachments: true };
    const { deps } = make_deps({ sent: [{ items: [sent] }] });
    const { update_meta } = with_metas(
      deps,
      [meta("a1", "s1", "good-meta-a1")],
      () => (unavailable ? { error: "x", status: 503 } : {}),
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("paused");
    unavailable = false;
    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update_meta.mock.calls.map((call) => call[0])).toEqual(["a1", "a1"]);
  });

  it("leaves the pass open when a meta write fails", async () => {
    const sent = { ...item("s1", "good-s1", "Ag=="), has_attachments: true };
    const { deps, store } = make_deps({ sent: [{ items: [sent] }] });

    with_metas(deps, [meta("a1", "s1", "good-meta-a1")], () => ({
      error: "bad",
      status: 400,
    }));

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("failed");
    expect(read_envelope_v2_rekey_state(store, USER_ID).done_at).toBeUndefined();
  });

  it("stops on 503 and resumes from the same page", async () => {
    let unavailable = true;
    const { deps, update, store } = make_deps(
      {
        sent: [
          { items: [item("a", "good-a")], next_cursor: "1" },
          { items: [item("b", "good-b")] },
        ],
      },
      (id) =>
        id === "b" && unavailable ? { error: "x", status: 503 } : {},
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("paused");
    expect(read_envelope_v2_rekey_state(store, USER_ID)).toMatchObject({
      type_index: 0,
      cursor: "1",
    });

    unavailable = false;

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("done");
    expect(update.mock.calls.map((call) => call[0])).toEqual(["a", "b", "b"]);
  });

  it("bounds each run and does not move past unfinished items", async () => {
    const items = Array.from({ length: ENVELOPE_V2_REKEY_RUN_LIMIT + 5 }, (_, i) =>
      item(`i${i}`, `good-${i}`),
    );
    const { deps, update, store } = make_deps({ sent: [{ items }] });

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("more");
    expect(update).toHaveBeenCalledTimes(ENVELOPE_V2_REKEY_RUN_LIMIT);
    expect(read_envelope_v2_rekey_state(store, USER_ID).type_index).toBe(0);
  });

  it("stops when the server refuses level 2", async () => {
    const { deps, update } = make_deps(
      { sent: [{ items: [item("a", "good-a"), item("b", "good-b")] }] },
      () => ({ error: "x", status: 409, server_code: "VAULT_LEVEL2_NOT_ADMITTED" }),
    );

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("unavailable");
    expect(update).toHaveBeenCalledTimes(1);
    expect(get_level2_admission()).toBe("refused");
  });

  it("does nothing until the account is admitted", async () => {
    reset_level2_state();
    const { deps, list } = make_deps({ sent: [{ items: [item("a", "good-a")] }] });

    expect(await run_envelope_v2_rekey(USER_ID, deps)).toBe("unavailable");
    expect(list).not.toHaveBeenCalled();
  });
});
