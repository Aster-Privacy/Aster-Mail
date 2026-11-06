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
import type { ApiResponse } from "@/services/api/client";
import type { EncryptedVault } from "../key_manager_core";
import type { ResealApi } from "./reseal_io";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { array_to_base64, base64_to_array } from "../base64";
import {
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
  derive_encryption_key_from_passphrase,
} from "../memory_key_store";
import {
  derive_storage_hmac_key,
  import_storage_aes_key,
} from "../storage_write_key";
import { escrow_aad_v2, escrow_aad_v3 } from "../message_escrow";
import { derive_escrow_aes_key } from "./reseal_keys";
import { memory_progress_store } from "./reseal_io";
import { STORAGE_REKEY_PATH } from "./step_helpers";
import { needs_storage_reseal, run_storage_reseal } from "./run";
import {
  BLOCKED_SENDERS_INFO,
  CONTACTS_HMAC_INFO,
  blocked_senders_step,
  contacts_step,
} from "./steps_lists";
import {
  ESCROW_DELETE_PATH,
  ESCROW_LIST_PATH,
  ESCROW_UPSERT_PATH,
  escrow_step,
} from "./steps_escrow";

const PASSWORD = "Rotation-Passw0rd-77";
const STEPS = [contacts_step, blocked_senders_step, escrow_step];
const LONG_TEST = { timeout: 120000 };

interface BlockedRow {
  id: string;
  encrypted_sender_data: string;
  sender_data_nonce: string;
  sender_token: string;
  integrity_hash: string;
  is_domain: boolean;
}

interface ContactRow {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
  data_version: number | null;
}

interface EscrowRow {
  message_id: string;
  encrypted_plaintext: string;
  plaintext_nonce: string;
  created_at: number;
}

interface RecordedWrite {
  method: "post" | "put";
  path: string;
  body: unknown;
}

type FailRule = (
  method: "get" | "post" | "put",
  path: string,
  body: unknown,
) => ApiResponse<never> | null;

let v1_raw: Uint8Array;
let v2_raw: Uint8Array;
let key_material_raw: Uint8Array;

function random_raw(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function seal(
  raw: Uint8Array,
  value: string,
  aad?: Uint8Array,
  escrow = false,
): Promise<{ ciphertext: string; nonce: string }> {
  const key = escrow
    ? await derive_escrow_aes_key(raw)
    : await import_storage_aes_key(raw);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: nonce, additionalData: aad }
    : { name: "AES-GCM", iv: nonce };
  const ciphertext = await crypto.subtle.encrypt(
    params,
    key,
    new TextEncoder().encode(value),
  );

  return {
    ciphertext: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

async function opens(
  raw: Uint8Array,
  ciphertext: string,
  nonce: string,
  aad?: Uint8Array,
  escrow = false,
): Promise<string | null> {
  const key = escrow
    ? await derive_escrow_aes_key(raw)
    : await import_storage_aes_key(raw);
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: base64_to_array(nonce), additionalData: aad }
    : { name: "AES-GCM", iv: base64_to_array(nonce) };

  try {
    const plain = await crypto.subtle.decrypt(
      params,
      key,
      base64_to_array(ciphertext),
    );

    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

async function hmac(raw: Uint8Array, info: string, value: string): Promise<string> {
  const key = await derive_storage_hmac_key(raw, info);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return array_to_base64(new Uint8Array(sig));
}

function escrow_aad(message_id: string): Uint8Array {
  return message_id.startsWith("v3:")
    ? escrow_aad_v3(message_id.slice(3))
    : escrow_aad_v2(message_id);
}

class FakeServer {
  blocked = new Map<string, BlockedRow>();
  contacts = new Map<string, ContactRow>();
  escrow = new Map<string, EscrowRow>();
  writes: RecordedWrite[] = [];
  fail: FailRule | null = null;
  private clock = 1000;

  tick(): number {
    this.clock += 1;

    return this.clock;
  }

  row_count(): number {
    return this.blocked.size + this.contacts.size + this.escrow.size;
  }

  api: ResealApi = {
    get: async <T>(path: string): Promise<ApiResponse<T>> => {
      const failure = this.fail?.("get", path, undefined);

      if (failure) return failure as ApiResponse<T>;

      return { data: this.handle_get(path) as T };
    },
    post: async <T>(path: string, body: unknown): Promise<ApiResponse<T>> => {
      const failure = this.fail?.("post", path, body);

      if (failure) return failure as ApiResponse<T>;
      this.writes.push({ method: "post", path, body });

      return this.handle_post(path, body) as ApiResponse<T>;
    },
    put: async <T>(path: string, body: unknown): Promise<ApiResponse<T>> => {
      const failure = this.fail?.("put", path, body);

      if (failure) return failure as ApiResponse<T>;
      this.writes.push({ method: "put", path, body });

      return { error: "not found", status: 404 };
    },
  };

  private handle_get(path: string): unknown {
    const url = new URL(path, "https://fake.invalid");

    if (url.pathname === "/contacts/v1/blocked_senders") {
      return { blocked_senders: [...this.blocked.values()] };
    }
    if (url.pathname === "/contacts/v1") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const cursor = url.searchParams.get("cursor");
      const ids = [...this.contacts.keys()].sort();
      const start = cursor ? ids.findIndex((id) => id > cursor) : 0;
      const slice = start < 0 ? [] : ids.slice(start, start + limit);
      const has_more = start >= 0 && start + limit < ids.length;

      return {
        items: slice.map((id) => this.contacts.get(id)),
        next_cursor: has_more ? slice[slice.length - 1] : null,
        has_more,
      };
    }
    if (url.pathname === ESCROW_LIST_PATH) {
      const limit = Number(url.searchParams.get("limit") ?? "500");
      const cursor = url.searchParams.get("cursor");
      const bound = cursor ? Number(cursor) : Number.POSITIVE_INFINITY;
      const rows = [...this.escrow.values()]
        .filter((row) => row.created_at < bound)
        .sort((a, b) => b.created_at - a.created_at);
      const page = rows.slice(0, limit);

      return {
        entries: page.map(({ created_at: _created, ...rest }) => rest),
        next_cursor:
          rows.length > limit ? String(page[page.length - 1].created_at) : null,
      };
    }

    throw new Error(`unexpected GET ${path}`);
  }

  private handle_post(path: string, body: unknown): ApiResponse<unknown> {
    const payload = body as Record<string, unknown>;

    if (path === STORAGE_REKEY_PATH) {
      const blocked = payload.blocked_senders as
        | Record<string, string>[]
        | undefined;
      const contacts = payload.contacts as Record<string, string>[] | undefined;

      if (blocked) {
        for (const item of blocked) {
          const clash = [...this.blocked.values()].some(
            (row) => row.id !== item.id && row.sender_token === item.sender_token,
          );

          if (clash) return { error: "conflict", status: 409 };
        }
        for (const item of blocked) {
          const row = this.blocked.get(item.id);

          if (!row) continue;
          row.encrypted_sender_data = item.encrypted_sender_data;
          row.sender_data_nonce = item.sender_data_nonce;
          row.sender_token = item.sender_token;
          row.integrity_hash = item.integrity_hash;
        }
      }
      for (const item of contacts ?? []) {
        const row = this.contacts.get(item.id);

        if (!row) continue;
        row.encrypted_data = item.encrypted_contact_data;
        row.data_nonce = item.contact_nonce;
        row.contact_token = item.contact_token;
      }

      return { data: { success: true } };
    }
    if (path === ESCROW_UPSERT_PATH) {
      const message_id = String(payload.message_id);
      const existing = this.escrow.get(message_id);

      this.escrow.set(message_id, {
        message_id,
        encrypted_plaintext: String(payload.encrypted_plaintext),
        plaintext_nonce: String(payload.plaintext_nonce),
        created_at: this.tick(),
      });

      return { data: { success: true, replaced: !!existing } };
    }
    if (path === ESCROW_DELETE_PATH) {
      for (const id of payload.message_ids as string[]) {
        this.escrow.delete(id);
      }

      return { data: { success: true } };
    }

    throw new Error(`unexpected POST ${path}`);
  }
}

async function seeded_server(options: {
  unreadable_escrow?: boolean;
} = {}): Promise<FakeServer> {
  const server = new FakeServer();
  const old_keys = [v1_raw, v2_raw, key_material_raw];
  const senders = ["spam@example.com", "junk@example.org", "promo@example.net"];

  for (let i = 0; i < senders.length; i++) {
    const raw = old_keys[i % old_keys.length];
    const sealed = await seal(raw, JSON.stringify({ email: senders[i] }));

    server.blocked.set(`b${i}`, {
      id: `b${i}`,
      encrypted_sender_data: sealed.ciphertext,
      sender_data_nonce: sealed.nonce,
      sender_token: await hmac(raw, BLOCKED_SENDERS_INFO, senders[i]),
      integrity_hash: "old",
      is_domain: false,
    });
  }

  for (let i = 0; i < 4; i++) {
    const raw = old_keys[i % old_keys.length];
    const record = {
      first_name: `First${i}`,
      last_name: `Last${i}`,
      emails: [`person${i}@example.com`],
    };
    const sealed = await seal(raw, JSON.stringify(record));

    server.contacts.set(`c${i}`, {
      id: `c${i}`,
      encrypted_data: sealed.ciphertext,
      data_nonce: sealed.nonce,
      contact_token: "old",
      data_version: null,
    });
  }

  const escrow_ids = ["m1", "m2", "v3:dedupe-a", "v3:dedupe-b", "m5"];

  for (let i = 0; i < escrow_ids.length; i++) {
    const raw = old_keys[i % old_keys.length];
    const sealed = await seal(
      raw,
      `body ${escrow_ids[i]}`,
      escrow_aad(escrow_ids[i]),
      true,
    );

    server.escrow.set(escrow_ids[i], {
      message_id: escrow_ids[i],
      encrypted_plaintext: sealed.ciphertext,
      plaintext_nonce: sealed.nonce,
      created_at: server.tick(),
    });
  }

  if (options.unreadable_escrow) {
    const sealed = await seal(random_raw(), "lost", escrow_aad("gone"), true);

    server.escrow.set("gone", {
      message_id: "gone",
      encrypted_plaintext: sealed.ciphertext,
      plaintext_nonce: sealed.nonce,
      created_at: server.tick(),
    });
  }

  return server;
}

function rotated_vault(data_kek: Uint8Array): EncryptedVault {
  const now = new Date().toISOString();
  const prior = [v1_raw, v2_raw, key_material_raw].map((raw) =>
    array_to_base64(raw),
  );

  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    vault_format: 2,
    data_kek: array_to_base64(data_kek),
    data_kek_random: true,
    legacy_keks: prior.map((k) => ({ k, added_at: now })),
    storage_rekey: { state: "pending", started_at: now, prior_keys: prior },
  };
}

async function expect_only_new_key(
  server: FakeServer,
  new_raw: Uint8Array,
): Promise<void> {
  const old_keys = [v1_raw, v2_raw, key_material_raw];

  for (const row of server.blocked.values()) {
    expect(
      await opens(new_raw, row.encrypted_sender_data, row.sender_data_nonce),
    ).not.toBeNull();
    for (const raw of old_keys) {
      expect(
        await opens(raw, row.encrypted_sender_data, row.sender_data_nonce),
      ).toBeNull();
    }
  }
  for (const row of server.contacts.values()) {
    expect(await opens(new_raw, row.encrypted_data, row.data_nonce)).not.toBeNull();
    for (const raw of old_keys) {
      expect(await opens(raw, row.encrypted_data, row.data_nonce)).toBeNull();
    }
  }
  for (const row of server.escrow.values()) {
    const aad = escrow_aad(row.message_id);

    expect(
      await opens(
        new_raw,
        row.encrypted_plaintext,
        row.plaintext_nonce,
        aad,
        true,
      ),
    ).toBe(`body ${row.message_id}`);
    for (const raw of old_keys) {
      expect(
        await opens(raw, row.encrypted_plaintext, row.plaintext_nonce, aad, true),
      ).toBeNull();
      expect(
        await opens(raw, row.encrypted_plaintext, row.plaintext_nonce, aad),
      ).toBeNull();
    }
  }
}

const no_sleep = async (): Promise<void> => {};

describe("storage reseal engine", () => {
  beforeAll(async () => {
    const bytes = new TextEncoder().encode(PASSWORD);

    v1_raw = await derive_encryption_key_from_passphrase(
      bytes,
      STORAGE_KDF_VERSION_LEGACY,
    );
    v2_raw = await derive_encryption_key_from_passphrase(
      bytes,
      STORAGE_KDF_VERSION_STRETCHED,
    );

    const base = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, [
      "deriveBits",
    ]);

    key_material_raw = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode("account-salt"),
          iterations: 1000,
          hash: "SHA-256",
        },
        base,
        256,
      ),
    );
  }, 120000);

  it("needs a reseal only for a random key with a pending rekey", () => {
    const vault = rotated_vault(random_raw());

    expect(needs_storage_reseal(vault)).toBe(true);
    expect(needs_storage_reseal({ ...vault, data_kek_random: false })).toBe(
      false,
    );
    expect(
      needs_storage_reseal({
        ...vault,
        storage_rekey: { state: "done", started_at: "x", done_at: "y" },
      }),
    ).toBe(false);
    expect(needs_storage_reseal(null)).toBe(false);
  });

  it(
    "reseals every row in place and recomputes tokens",
    LONG_TEST,
    async () => {
      const server = await seeded_server();
      const new_raw = random_raw();
      const vault = rotated_vault(new_raw);
      const store = memory_progress_store();
      const finish = vi.fn(async () => "done" as const);
      const rows_before = server.row_count();

      const result = await run_storage_reseal({
        vault,
        api: server.api,
        store,
        finish,
        still_current: async () => true,
        sleep: no_sleep,
        steps: STEPS,
      });

      expect(result.status).toBe("done");
      expect(result.counts.resealed).toBe(rows_before);
      expect(result.counts.unreadable).toBe(0);
      expect(server.row_count()).toBe(rows_before);
      expect(finish).toHaveBeenCalledWith(vault.data_kek);
      expect(store.snapshot()).toBeNull();

      await expect_only_new_key(server, new_raw);

      for (const row of server.blocked.values()) {
        const plain = await opens(
          new_raw,
          row.encrypted_sender_data,
          row.sender_data_nonce,
        );
        const email = (JSON.parse(plain ?? "{}") as { email: string }).email;

        expect(row.sender_token).toBe(
          await hmac(new_raw, BLOCKED_SENDERS_INFO, email),
        );
      }
      for (const [id, row] of server.contacts) {
        const i = Number(id.slice(1));

        expect(row.contact_token).toBe(
          await hmac(
            new_raw,
            CONTACTS_HMAC_INFO,
            `first${i} last${i} person${i}@example.com`,
          ),
        );
      }
    },
  );

  it("writes nothing on a second run", LONG_TEST, async () => {
    const server = await seeded_server();
    const new_raw = random_raw();
    const vault = rotated_vault(new_raw);

    await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: async () => "done",
      sleep: no_sleep,
      steps: STEPS,
    });

    const writes_after_first = server.writes.length;
    const rows = server.row_count();
    const second = await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: async () => "done",
      sleep: no_sleep,
      steps: STEPS,
    });

    expect(second.status).toBe("done");
    expect(second.counts.resealed).toBe(0);
    expect(second.counts.current).toBe(rows);
    expect(server.writes.length).toBe(writes_after_first);
    expect(server.row_count()).toBe(rows);
  });

  it("resumes after an interruption without repeating finished steps", LONG_TEST, async () => {
    const server = await seeded_server();
    const new_raw = random_raw();
    const vault = rotated_vault(new_raw);
    const store = memory_progress_store();
    const finish = vi.fn(async () => "done" as const);

    server.fail = (method, path) =>
      method === "get" && path.startsWith(ESCROW_LIST_PATH)
        ? { error: "unavailable", status: 503 }
        : null;

    const first = await run_storage_reseal({
      vault,
      api: server.api,
      store,
      finish,
      sleep: no_sleep,
      steps: STEPS,
    });

    expect(first.status).toBe("interrupted");
    expect(finish).not.toHaveBeenCalled();
    expect(store.snapshot()?.steps.contacts?.done).toBe(true);
    expect(store.snapshot()?.steps.blocked_senders?.done).toBe(true);

    const writes_before_resume = server.writes.length;

    server.fail = null;

    const second = await run_storage_reseal({
      vault,
      api: server.api,
      store,
      finish,
      sleep: no_sleep,
      steps: STEPS,
    });

    expect(second.status).toBe("done");
    expect(finish).toHaveBeenCalledTimes(1);
    expect(
      server.writes
        .slice(writes_before_resume)
        .every((write) => write.path === ESCROW_UPSERT_PATH),
    ).toBe(true);
    expect(second.counts.resealed).toBe(server.escrow.size);
    await expect_only_new_key(server, new_raw);
  });

  it("keeps old rows readable through legacy keys before and after a partial run", LONG_TEST, async () => {
    const server = await seeded_server();
    const new_raw = random_raw();
    const vault = rotated_vault(new_raw);

    server.fail = (method, path) =>
      method === "get" && path.startsWith(ESCROW_LIST_PATH)
        ? { error: "unavailable", status: 503 }
        : null;

    await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: async () => "done",
      sleep: no_sleep,
      steps: STEPS,
    });

    const readers = [
      base64_to_array(vault.data_kek ?? ""),
      ...(vault.legacy_keks ?? []).map((entry) => base64_to_array(entry.k)),
    ];

    for (const row of server.escrow.values()) {
      const aad = escrow_aad(row.message_id);
      let plain: string | null = null;

      for (const raw of readers) {
        plain ??= await opens(
          raw,
          row.encrypted_plaintext,
          row.plaintext_nonce,
          aad,
          true,
        );
      }
      expect(plain).toBe(`body ${row.message_id}`);
    }
    for (const row of server.contacts.values()) {
      let plain: string | null = null;

      for (const raw of readers) {
        plain ??= await opens(raw, row.encrypted_data, row.data_nonce);
      }
      expect(plain).not.toBeNull();
    }
  });

  it("splits a conflicting batch and writes the other rows", LONG_TEST, async () => {
    const server = await seeded_server();
    const new_raw = random_raw();
    const vault = rotated_vault(new_raw);
    const squatter = await seal(new_raw, JSON.stringify({ email: "other@x.y" }));

    server.blocked.set("squat", {
      id: "squat",
      encrypted_sender_data: squatter.ciphertext,
      sender_data_nonce: squatter.nonce,
      sender_token: await hmac(new_raw, BLOCKED_SENDERS_INFO, "spam@example.com"),
      integrity_hash: "x",
      is_domain: false,
    });

    const result = await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: async () => "done",
      sleep: no_sleep,
      steps: [blocked_senders_step],
    });

    expect(result.status).toBe("done");
    expect(result.counts.conflicts).toBe(1);
    expect(result.counts.resealed).toBe(2);
    expect(server.blocked.size).toBe(4);

    const kept = server.blocked.get("b0");

    expect(
      await opens(v1_raw, kept?.encrypted_sender_data ?? "", kept?.sender_data_nonce ?? ""),
    ).not.toBeNull();
  });

  it("deletes unreadable escrow rows only while the key is still current", LONG_TEST, async () => {
    const kept_server = await seeded_server({ unreadable_escrow: true });
    const new_raw = random_raw();
    const vault = rotated_vault(new_raw);

    const kept = await run_storage_reseal({
      vault,
      api: kept_server.api,
      store: memory_progress_store(),
      finish: async () => "done",
      still_current: async () => false,
      sleep: no_sleep,
      steps: [escrow_step],
    });

    expect(kept.counts.unreadable).toBe(1);
    expect(kept.counts.deleted).toBe(0);
    expect(kept_server.escrow.has("gone")).toBe(true);

    const server = await seeded_server({ unreadable_escrow: true });
    const deleted = await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: async () => "done",
      still_current: async () => true,
      sleep: no_sleep,
      steps: [escrow_step],
    });

    expect(deleted.counts.deleted).toBe(1);
    expect(server.escrow.has("gone")).toBe(false);
    expect(server.escrow.size).toBe(5);
  });

  it("leaves a vault that already finished untouched", LONG_TEST, async () => {
    const server = await seeded_server();
    const vault = {
      ...rotated_vault(random_raw()),
      storage_rekey: { state: "done" as const, started_at: "x", done_at: "y" },
    };
    const finish = vi.fn(async () => "done" as const);

    const result = await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish,
      sleep: no_sleep,
      steps: STEPS,
    });

    expect(result.status).toBe("not_needed");
    expect(server.writes).toEqual([]);
    expect(finish).not.toHaveBeenCalled();

    const weak = await run_storage_reseal({
      vault: { ...rotated_vault(v1_raw), data_kek_random: false },
      api: server.api,
      store: memory_progress_store(),
      finish,
      sleep: no_sleep,
      steps: STEPS,
    });

    expect(weak.status).toBe("not_needed");
    expect(server.writes).toEqual([]);
  });

  it("starts over when the stored progress belongs to another key", LONG_TEST, async () => {
    const server = await seeded_server();
    const vault = rotated_vault(random_raw());
    const store = memory_progress_store({
      key_id: "someone-else",
      steps: { contacts: { done: true }, blocked_senders: { done: true } },
      hash_moves: [],
    });

    const result = await run_storage_reseal({
      vault,
      api: server.api,
      store,
      finish: async () => "superseded",
      sleep: no_sleep,
      steps: STEPS,
    });

    expect(result.status).toBe("superseded");
    expect(result.counts.resealed).toBe(server.row_count());
    expect(store.snapshot()).toBeNull();
  });
});
