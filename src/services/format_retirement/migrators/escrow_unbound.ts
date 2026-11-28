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
import type { BatchResult, FormatMigrator, MigratorContext } from "../migrator";
import type { EscrowRow } from "@/services/crypto/storage_rotation/steps_escrow";

import {
  decode_b64,
  try_open,
} from "@/services/crypto/storage_rotation/reseal_keys";
import { array_to_base64 } from "@/services/crypto/base64";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { escrow_aad_v2 } from "@/services/crypto/message_escrow";

export interface EscrowPage {
  entries: EscrowRow[];
  next_cursor?: string | null;
}

export interface EscrowUnboundDeps {
  list_page: (cursor: string | null, limit: number) => Promise<EscrowPage>;
  upsert: (row: EscrowRow) => Promise<void>;
  escrow_key: () => Promise<CryptoKey | null>;
  open_legacy_unbound: (
    ciphertext: Uint8Array,
    nonce: Uint8Array,
  ) => Promise<Uint8Array | null>;
}

export const ESCROW_UNBOUND_VERSION = 1;

const BOUND_PREFIX = "v3:";
const COUNT_PAGE_SIZE = 500;
const MAX_COUNT_PAGES = 10_000;

type RowState =
  | { kind: "bound" }
  | { kind: "other" }
  | { kind: "unbound"; plaintext: Uint8Array };

export async function classify_escrow_row(
  key: CryptoKey,
  row: EscrowRow,
  deps: Pick<EscrowUnboundDeps, "open_legacy_unbound">,
): Promise<RowState> {
  if (row.message_id.startsWith(BOUND_PREFIX)) return { kind: "bound" };

  const ciphertext = decode_b64(row.encrypted_plaintext);
  const nonce = decode_b64(row.plaintext_nonce);

  if (!ciphertext || !nonce) return { kind: "other" };

  const bound = await try_open(
    key,
    ciphertext,
    nonce,
    escrow_aad_v2(row.message_id),
  );

  if (bound) {
    zero_uint8_array(bound);

    return { kind: "bound" };
  }

  const plaintext =
    (await try_open(key, ciphertext, nonce)) ??
    (await deps.open_legacy_unbound(ciphertext, nonce));

  return plaintext ? { kind: "unbound", plaintext } : { kind: "other" };
}

async function rebind_row(
  key: CryptoKey,
  row: EscrowRow,
  plaintext: Uint8Array,
  deps: EscrowUnboundDeps,
): Promise<boolean> {
  const aad = escrow_aad_v2(row.message_id);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      key,
      plaintext,
    ),
  );
  const reopened = await try_open(key, ciphertext, nonce, aad);

  if (!reopened) return false;
  zero_uint8_array(reopened);

  await deps.upsert({
    message_id: row.message_id,
    encrypted_plaintext: array_to_base64(ciphertext),
    plaintext_nonce: array_to_base64(nonce),
  });

  return true;
}

async function require_key(deps: EscrowUnboundDeps): Promise<CryptoKey> {
  const key = await deps.escrow_key();

  if (!key) throw new Error("escrow key unavailable");

  return key;
}

export function create_escrow_unbound_migrator(
  deps: EscrowUnboundDeps,
): FormatMigrator {
  return {
    id: "escrow_unbound",
    version: ESCROW_UNBOUND_VERSION,

    async detect() {
      await require_key(deps);

      return true;
    },

    async rewrap_batch(
      ctx: MigratorContext,
      limit: number,
    ): Promise<BatchResult> {
      const key = await require_key(deps);
      const cursor =
        typeof ctx.state.cursor === "string" ? ctx.state.cursor : null;
      const page = await deps.list_page(cursor, limit);
      const result: BatchResult = {
        examined: 0,
        migrated: 0,
        failed: 0,
        done: false,
      };

      for (const row of page.entries ?? []) {
        if (!ctx.is_active()) return result;

        result.examined += 1;

        const state = await classify_escrow_row(key, row, deps);

        if (state.kind !== "unbound") continue;

        try {
          if (await rebind_row(key, row, state.plaintext, deps)) {
            result.migrated += 1;
          } else {
            result.failed += 1;
          }
        } catch {
          result.failed += 1;
        } finally {
          zero_uint8_array(state.plaintext);
        }
      }

      ctx.state.cursor = page.next_cursor ?? null;
      result.done = !page.next_cursor;

      return result;
    },

    async count(ctx: MigratorContext): Promise<number | null> {
      const key = await require_key(deps);
      let cursor: string | null = null;
      let remaining = 0;

      for (let index = 0; index < MAX_COUNT_PAGES; index++) {
        if (!ctx.is_active()) return null;

        const page = await deps.list_page(cursor, COUNT_PAGE_SIZE);

        for (const row of page.entries ?? []) {
          const state = await classify_escrow_row(key, row, deps);

          if (state.kind === "unbound") {
            remaining += 1;
            zero_uint8_array(state.plaintext);
          }
        }

        cursor = page.next_cursor ?? null;
        if (!cursor) return remaining;
      }

      return null;
    },

    async verify() {
      return (await deps.escrow_key()) !== null;
    },
  };
}
