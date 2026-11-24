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

import { sha256 } from "@noble/hashes/sha256";
import { afterEach, describe, expect, it } from "vitest";

import { array_to_base64 } from "../base64";
import { escrow_aad_v2 } from "../message_escrow";
import { import_storage_aes_key } from "../storage_write_key";
import { empty_counts } from "./reseal_io";
import {
  build_reseal_keys,
  decode_b64,
  derive_escrow_aes_key,
  open_with_any,
  type ResealKeyOptions,
} from "./reseal_keys";
import {
  ESCROW_UPSERT_PATH,
  escrow_step,
  open_escrow_row,
  type EscrowRow,
} from "./steps_escrow";

const NEW_RAW = new Uint8Array(32).fill(1);
const TRUSTED_RAW = new Uint8Array(32).fill(2);
const NONCE = new Uint8Array(12).fill(4);
const MESSAGE_ID = "message-1";
const ADDED_AT = "2026-01-01T00:00:00Z";

type Placement = "legacy_keks" | "prior_keys" | "extra";

const PUBLIC_CASES: [string, string, Placement][] = [
  ["undefined", "astermail-envelope-v1", "legacy_keks"],
  ["undefined", "astermail-import-v1", "legacy_keks"],
  ["null", "astermail-tags-v1", "legacy_keks"],
  ["", "astermail-draft-v2", "legacy_keks"],
  ["undefined", "astermail-draft-v1", "prior_keys"],
  ["undefined", "astermail-envelope-v1", "prior_keys"],
  ["undefined", "astermail-preferences-v1", "extra"],
];

let opened_keys: ResealKeys[] = [];

function public_raw(material: string, context: string): Uint8Array {
  return sha256(new TextEncoder().encode(material + context));
}

function vault_with(raw: Uint8Array, placement: Placement): EncryptedVault {
  const legacy_keks = [{ k: array_to_base64(TRUSTED_RAW), added_at: ADDED_AT }];

  if (placement === "legacy_keks") {
    legacy_keks.push({ k: array_to_base64(raw), added_at: ADDED_AT });
  }

  return {
    data_kek: array_to_base64(NEW_RAW),
    data_kek_random: true,
    legacy_keks,
    ...(placement === "prior_keys"
      ? { storage_rekey: { prior_keys: [array_to_base64(raw)] } }
      : {}),
  } as EncryptedVault;
}

async function keys_with(
  raw: Uint8Array,
  placement: Placement,
): Promise<ResealKeys> {
  const options: ResealKeyOptions =
    placement === "extra" ? { extra_old_raws: [new Uint8Array(raw)] } : {};
  const built = await build_reseal_keys(vault_with(raw, placement), options);

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

function escrow_context(keys: ResealKeys, row: EscrowRow) {
  const posts: string[] = [];
  const ctx: ResealStepContext = {
    keys,
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

  return { ctx, posts };
}

afterEach(() => {
  opened_keys.forEach((entry) => entry.dispose());
  opened_keys = [];
});

describe("reseal with public constant keys", () => {
  it.each(PUBLIC_CASES)(
    "holds an escrow row keyed to %j + %s from %s instead of resealing it",
    async (material, context, placement) => {
      const raw = public_raw(material, context);
      const opened = await open_escrow_row(
        await keys_with(raw, placement),
        await escrow_row(raw),
      );

      expect(opened).toEqual({ state: "quarantined" });
    },
  );

  it.each(PUBLIC_CASES)(
    "never opens stored data keyed to %j + %s from %s as user data",
    async (material, context, placement) => {
      const raw = public_raw(material, context);
      const keys = await keys_with(raw, placement);
      const sealed = decode_b64(
        await seal(await import_storage_aes_key(raw), "folder name"),
      )!;

      expect(await open_with_any(keys.old_aes, sealed, NONCE)).toBeNull();
    },
  );

  it.each(PUBLIC_CASES)(
    "leaves an escrow row keyed to %j + %s from %s on the server",
    async (material, context, placement) => {
      const raw = public_raw(material, context);
      const { ctx, posts } = escrow_context(
        await keys_with(raw, placement),
        await escrow_row(raw),
      );

      await escrow_step.run(ctx);

      expect(posts).not.toContain(ESCROW_UPSERT_PATH);
      expect(ctx.counts.resealed).toBe(0);
    },
  );

  it("still reseals an escrow row under a random key the vault holds", async () => {
    const raw = public_raw("undefined", "astermail-envelope-v1");
    const opened = await open_escrow_row(
      await keys_with(raw, "legacy_keks"),
      await escrow_row(TRUSTED_RAW),
    );

    expect(opened.state).toBe("stale");
  });
});
