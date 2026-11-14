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

import { describe, expect, it } from "vitest";

import { array_to_base64, base64_to_array } from "../base64";
import { derive_ratchet_encryption_key } from "../ratchet_sync";
import { derive_ratchet_aes_key } from "./reseal_keys";
import { memory_progress_store } from "./reseal_io";
import { DEFAULT_RESEAL_STEPS, run_storage_reseal } from "./run";
import {
  PQ_SECRET_BULK_PATH,
  PQ_SECRET_IDS_PATH,
  pq_secret_path,
  pq_secrets_step,
} from "./steps_pq_secrets";

interface SecretRow {
  encrypted_secret: string;
  secret_nonce: string;
}

const LONG_TEST = { timeout: 120000 };

function raw_of(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

const new_raw = raw_of(11);
const old_raw = raw_of(22);
const stranger_raw = raw_of(33);

async function seal_secret(raw: Uint8Array, secret: Uint8Array): Promise<SecretRow> {
  const key = await derive_ratchet_aes_key(raw);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, secret);

  return {
    encrypted_secret: array_to_base64(new Uint8Array(ciphertext)),
    secret_nonce: array_to_base64(nonce),
  };
}

async function open_secret(raw: Uint8Array, row: SecretRow): Promise<Uint8Array | null> {
  try {
    const key = await derive_ratchet_aes_key(raw);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(row.secret_nonce) },
      key,
      base64_to_array(row.encrypted_secret),
    );

    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

function secret_of(id: number): Uint8Array {
  return new Uint8Array(64).fill(id % 251);
}

class PqServer {
  rows = new Map<number, SecretRow>();
  listed: number[] | null = null;
  ids_status: number | null = null;
  bulk_sizes: number[] = [];
  bulk_failure: ApiResponse<never> | null = null;

  api: ResealApi = {
    get: async <T>(path: string): Promise<ApiResponse<T>> => {
      if (path === PQ_SECRET_IDS_PATH) {
        if (this.ids_status) return { error: "missing", status: this.ids_status };

        return { data: { key_ids: this.listed ?? [...this.rows.keys()] } as T };
      }

      const id = Number(path.slice(path.lastIndexOf("/") + 1));
      const row = this.rows.get(id);

      if (path !== pq_secret_path(id) || !row) {
        return { error: "not found", code: "NOT_FOUND", status: 404 };
      }

      return { data: { key_id: id, ...row } as T };
    },
    post: async <T>(path: string, body: unknown): Promise<ApiResponse<T>> => {
      if (path !== PQ_SECRET_BULK_PATH) throw new Error(`unexpected POST ${path}`);
      if (this.bulk_failure) return this.bulk_failure as ApiResponse<T>;

      const secrets = (body as { secrets: ({ key_id: number } & SecretRow)[] }).secrets;

      this.bulk_sizes.push(secrets.length);
      for (const { key_id, encrypted_secret, secret_nonce } of secrets) {
        this.rows.set(key_id, { encrypted_secret, secret_nonce });
      }

      return { data: { success: true } as T };
    },
    put: async <T>(): Promise<ApiResponse<T>> => {
      throw new Error("unexpected PUT");
    },
  };
}

function pending_vault(): Pick<
  EncryptedVault,
  "data_kek" | "legacy_keks" | "storage_rekey" | "data_kek_random"
> {
  const now = new Date().toISOString();

  return {
    data_kek: array_to_base64(new_raw),
    data_kek_random: true,
    legacy_keks: [{ k: array_to_base64(old_raw), added_at: now }],
    storage_rekey: {
      state: "pending",
      started_at: now,
      prior_keys: [array_to_base64(old_raw)],
    },
  };
}

function reseal(server: PqServer) {
  return run_storage_reseal({
    vault: pending_vault(),
    api: server.api,
    store: memory_progress_store(),
    finish: async () => "done",
    sleep: async () => {},
    steps: [pq_secrets_step],
  });
}

describe("pq_secrets_step", () => {
  it("is part of the default reseal", () => {
    expect(DEFAULT_RESEAL_STEPS).toContain(pq_secrets_step);
  });

  it("uses the same key the post-quantum store reads with", async () => {
    const row = await seal_secret(new_raw, secret_of(5));
    const store_key = await derive_ratchet_encryption_key(new_raw.slice());
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(row.secret_nonce) },
      store_key,
      base64_to_array(row.encrypted_secret),
    );

    expect(new Uint8Array(plain)).toEqual(secret_of(5));
  });

  it("reseals legacy secrets, skips current ones and keeps unreadable ones", LONG_TEST, async () => {
    const server = new PqServer();
    const current = await seal_secret(new_raw, secret_of(2));
    const lost = await seal_secret(stranger_raw, secret_of(3));

    server.rows.set(1, await seal_secret(old_raw, secret_of(1)));
    server.rows.set(2, current);
    server.rows.set(3, lost);

    const result = await reseal(server);

    expect(result.status).toBe("done");
    expect(result.counts.resealed).toBe(1);
    expect(result.counts.current).toBe(1);
    expect(result.counts.unreadable).toBe(1);
    expect(await open_secret(new_raw, server.rows.get(1)!)).toEqual(secret_of(1));
    expect(await open_secret(old_raw, server.rows.get(1)!)).toBeNull();
    expect(server.rows.get(2)).toEqual(current);
    expect(server.rows.get(3)).toEqual(lost);
    expect(server.bulk_sizes).toEqual([1]);
  });

  it("uploads resealed secrets in batches of at most 200", LONG_TEST, async () => {
    const server = new PqServer();

    for (let id = 1; id <= 450; id++) {
      server.rows.set(id, await seal_secret(old_raw, secret_of(id)));
    }

    const result = await reseal(server);

    expect(result.status).toBe("done");
    expect(server.bulk_sizes).toEqual([200, 200, 50]);
    expect(await open_secret(new_raw, server.rows.get(450)!)).toEqual(secret_of(450));
  });

  it("skips a secret that disappears between listing and fetching", async () => {
    const server = new PqServer();

    server.listed = [9];

    const result = await reseal(server);

    expect(result.status).toBe("done");
    expect(server.bulk_sizes).toEqual([]);
    expect(server.rows.has(9)).toBe(false);
  });

  it("treats a server without the secret list as nothing to reseal", async () => {
    const server = new PqServer();

    server.rows.set(1, await seal_secret(old_raw, secret_of(1)));
    server.ids_status = 404;

    expect((await reseal(server)).status).toBe("done");
    expect(server.bulk_sizes).toEqual([]);
  });

  it("stops without finishing when an upload fails, then completes on retry", async () => {
    const server = new PqServer();

    server.rows.set(1, await seal_secret(old_raw, secret_of(1)));
    server.bulk_failure = { error: "bad", status: 400 };

    expect((await reseal(server)).status).toBe("interrupted");
    expect(await open_secret(old_raw, server.rows.get(1)!)).toEqual(secret_of(1));

    server.bulk_failure = null;

    expect((await reseal(server)).status).toBe("done");
    expect(await open_secret(new_raw, server.rows.get(1)!)).toEqual(secret_of(1));
  });

  it("counts a malformed row as unreadable and keeps going", async () => {
    const server = new PqServer();

    server.rows.set(1, { encrypted_secret: "%%%", secret_nonce: "" });
    server.rows.set(2, await seal_secret(old_raw, secret_of(2)));

    const result = await reseal(server);

    expect(result.status).toBe("done");
    expect(result.counts.unreadable).toBe(1);
    expect(result.counts.resealed).toBe(1);
  });
});
