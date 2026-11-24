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
import type { EncryptedVault } from "../key_manager_core";
import type { ResealKeys } from "./reseal_keys";
import type { ResealStepContext } from "./reseal_io";

import { afterEach, describe, expect, it } from "vitest";

import { array_to_base64 } from "../base64";
import { escrow_aad_v2 } from "../message_escrow";
import { import_storage_aes_key } from "../storage_write_key";
import { empty_counts } from "./reseal_io";
import {
  build_reseal_keys,
  decode_b64,
  derive_escrow_aes_key,
  derive_ratchet_aes_key,
  open_with_any,
} from "./reseal_keys";
import {
  ESCROW_DELETE_PATH,
  ESCROW_UPSERT_PATH,
  escrow_step,
  open_escrow_row,
  type EscrowRow,
} from "./steps_escrow";

const NEW_RAW = new Uint8Array(32).fill(1);
const TRUSTED_RAW = new Uint8Array(32).fill(2);
const UNTRUSTED_RAW = new Uint8Array(32).fill(3);
const NONCE = new Uint8Array(12).fill(4);
const MESSAGE_ID = "message-1";

let opened_keys: ResealKeys[] = [];

function vault(): EncryptedVault {
  return {
    data_kek: array_to_base64(NEW_RAW),
    data_kek_random: true,
    legacy_keks: [
      { k: array_to_base64(TRUSTED_RAW), added_at: "2026-01-01T00:00:00Z" },
    ],
  } as EncryptedVault;
}

async function keys(): Promise<ResealKeys> {
  const built = await build_reseal_keys(vault(), {
    untrusted_old_raws: [new Uint8Array(UNTRUSTED_RAW)],
  });

  if (!built) throw new Error("no reseal keys");
  opened_keys.push(built);

  return built;
}

async function seal(
  key: CryptoKey,
  plaintext: string,
  aad?: Uint8Array,
): Promise<string> {
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: NONCE, additionalData: aad }
    : { name: "AES-GCM", iv: NONCE };

  return array_to_base64(
    new Uint8Array(
      await crypto.subtle.encrypt(
        params,
        key,
        new TextEncoder().encode(plaintext),
      ),
    ),
  );
}

async function escrow_row(raw: Uint8Array): Promise<EscrowRow> {
  return {
    message_id: MESSAGE_ID,
    encrypted_plaintext: await seal(
      await derive_escrow_aes_key(raw),
      "escrowed body",
      escrow_aad_v2(MESSAGE_ID),
    ),
    plaintext_nonce: array_to_base64(NONCE),
  };
}

afterEach(() => {
  opened_keys.forEach((entry) => entry.dispose());
  opened_keys = [];
});

describe("reseal provenance", () => {
  it("does not reseal an escrow row that opens only under a server-derivable key", async () => {
    const opened = await open_escrow_row(
      await keys(),
      await escrow_row(UNTRUSTED_RAW),
    );

    expect(opened).toEqual({ state: "quarantined" });
  });

  it("still reseals an escrow row under a key the vault holds", async () => {
    const opened = await open_escrow_row(
      await keys(),
      await escrow_row(TRUSTED_RAW),
    );

    expect(opened.state).toBe("stale");
  });

  it("opens storage only under keys the vault holds", async () => {
    const reseal = await keys();
    const open = async (candidates: CryptoKey[], key: CryptoKey) =>
      open_with_any(
        candidates,
        decode_b64(await seal(key, "folder name"))!,
        NONCE,
      );

    expect(
      await open(reseal.old_aes, await import_storage_aes_key(UNTRUSTED_RAW)),
    ).toBeNull();
    expect(
      await open(
        reseal.old_ratchet,
        await derive_ratchet_aes_key(UNTRUSTED_RAW),
      ),
    ).toBeNull();
    expect(
      await open(reseal.old_aes, await import_storage_aes_key(TRUSTED_RAW)),
    ).not.toBeNull();
  });

  it("leaves a server-derivable escrow row in place during the escrow pass", async () => {
    const row = await escrow_row(UNTRUSTED_RAW);
    const posts: string[] = [];
    const ctx: ResealStepContext = {
      keys: await keys(),
      api: {
        get: async <T>() => ({ data: { entries: [row] } as T }),
        post: async <T>(path: string) => {
          posts.push(path);

          return { data: {} as T };
        },
        put: async <T>() => ({ data: {} as T }),
      },
      progress: { key_id: "key", steps: {}, hash_moves: [] },
      persist: () => undefined,
      sleep: async () => undefined,
      is_cancelled: () => false,
      still_current: async () => true,
      counts: empty_counts(),
    };

    await escrow_step.run(ctx);

    expect(posts).not.toContain(ESCROW_UPSERT_PATH);
    expect(posts).not.toContain(ESCROW_DELETE_PATH);
    expect(ctx.counts.resealed).toBe(0);
  });
});
