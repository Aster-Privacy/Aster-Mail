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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MASTER = new Uint8Array(32).map((_, i) => i + 1);
const LEGACY = new Uint8Array(32).map((_, i) => 200 - i);
const served = new Map<string, Record<string, string>>();
const failing_rows = new Set<string>();
const failures_left = new Map<string, number>();
const requested: string[] = [];
const cached = new Map<string, string>();

const escrow_switch = vi.hoisted(() => ({ bound_only: true }));

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(MASTER),
  get_vault_from_memory: () => ({
    data_kek: Buffer.from(MASTER).toString("base64"),
    data_kek_random: true,
    server_known_kek_ids: undefined,
  }),
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({
    bound_escrow_writes: escrow_switch.bound_only,
  }),
}));

vi.mock("./legacy_keks", () => ({
  decrypt_with_legacy_derived_keys: async (
    derive: (base: CryptoKey) => Promise<CryptoKey>,
    ciphertext: BufferSource,
    iv: BufferSource,
    additional_data?: BufferSource,
  ) => {
    const base = await crypto.subtle.importKey("raw", LEGACY, "HKDF", false, [
      "deriveKey",
    ]);
    const key = await derive(base);
    const params: AesGcmParams = additional_data
      ? { name: "AES-GCM", iv, additionalData: additional_data }
      : { name: "AES-GCM", iv };

    return crypto.subtle.decrypt(params, key, ciphertext).catch(() => null);
  },
}));

vi.mock("./ratchet_plaintext_cache", () => ({
  set_cached_ratchet_plaintext: async (key: string, value: string) => {
    cached.set(key, value);
  },
  is_cached_plaintext_foreign: async () => false,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: async () => ({ data: {} }),
    get: async (url: string) => {
      const key = decodeURIComponent(url.split("/plaintext/")[1]);

      requested.push(key);

      const left = failures_left.get(key) ?? 0;

      if (left > 0) failures_left.set(key, left - 1);

      if (failing_rows.has(key) || left > 0) {
        return { error: "unavailable", code: "SERVER_ERROR" };
      }

      const entry = served.get(key);

      return entry ? { data: entry } : { code: "NOT_FOUND" };
    },
  },
}));

import {
  bound_escrow_key,
  clear_escrow_miss_cache,
  escrow_aad_v2,
  escrow_aad_v3,
  EscrowUnavailableError,
  fetch_from_escrow,
  fetch_verified_from_escrow,
} from "./message_escrow";
import { array_to_base64 } from "./base64";

const REFUSAL_FLAG = "VITE_REFUSE_UNBOUND_STORED_DATA";
const ALICE = { sender: "alice@astermail.org", conversation_id: "conv-a" };
const KEY_A = "mail-a:BA==:1";
const KEY_B = "mail-b:BA==:1";

async function escrow_key(master: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", master, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode("Aster_Mail_Plaintext_Escrow"),
      info: new TextEncoder().encode("plaintext_escrow_key"),
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(
  message_id: string,
  plaintext: string,
  additional_data?: Uint8Array,
  master: Uint8Array = MASTER,
): Promise<Record<string, string>> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = additional_data
    ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
    : { name: "AES-GCM", iv: nonce };
  const ciphertext = await crypto.subtle.encrypt(
    params,
    await escrow_key(master),
    new TextEncoder().encode(plaintext),
  );

  return {
    message_id,
    encrypted_plaintext: array_to_base64(new Uint8Array(ciphertext)),
    plaintext_nonce: array_to_base64(nonce),
  };
}

function bound_body(plaintext: string): string {
  return `${JSON.stringify({ s: ALICE.sender, c: ALICE.conversation_id })}\n${plaintext}`;
}

beforeEach(() => {
  served.clear();
  failing_rows.clear();
  failures_left.clear();
  requested.length = 0;
  cached.clear();
  clear_escrow_miss_cache();
  escrow_switch.bound_only = true;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("escrow reads follow the stored data policy", () => {
  it("opens an unbound copy as unverified while the switch is off", async () => {
    served.set(KEY_B, await seal(KEY_B, "old body"));

    expect(await fetch_from_escrow(KEY_B, ALICE)).toEqual({
      plaintext: "old body",
      verified: false,
      unconfirmed_sender: false,
      downgraded: false,
      account_unbound: true,
    });
  });

  it("refuses an unbound copy under the current key once the switch is set", async () => {
    served.set(KEY_B, await seal(KEY_B, "old body"));
    vi.stubEnv(REFUSAL_FLAG, "1");

    expect(await fetch_from_escrow(KEY_B, ALICE)).toBeNull();
    expect(cached.has(KEY_B)).toBe(false);
  });

  it("refuses an unbound copy under a legacy key once the switch is set", async () => {
    served.set(KEY_B, await seal(KEY_B, "legacy body", undefined, LEGACY));

    expect((await fetch_from_escrow(KEY_B, ALICE))?.plaintext).toBe(
      "legacy body",
    );

    cached.clear();
    clear_escrow_miss_cache();
    vi.stubEnv(REFUSAL_FLAG, "1");

    expect(await fetch_from_escrow(KEY_B, ALICE)).toBeNull();
    expect(cached.has(KEY_B)).toBe(false);
  });

  it("refuses an unbound copy moved from another message once the switch is set", async () => {
    const for_a = await seal(KEY_A, "body of a");

    served.set(KEY_B, { ...for_a, message_id: KEY_B });
    vi.stubEnv(REFUSAL_FLAG, "1");

    expect(await fetch_from_escrow(KEY_B, ALICE)).toBeNull();
  });

  it("still opens copies bound to their message once the switch is set", async () => {
    vi.stubEnv(REFUSAL_FLAG, "1");
    served.set(KEY_B, await seal(KEY_B, "current body", escrow_aad_v2(KEY_B)));
    served.set(
      KEY_A,
      await seal(KEY_A, "legacy bound body", escrow_aad_v2(KEY_A), LEGACY),
    );

    expect((await fetch_from_escrow(KEY_B, ALICE))?.plaintext).toBe(
      "current body",
    );
    expect((await fetch_from_escrow(KEY_A, ALICE))?.plaintext).toBe(
      "legacy bound body",
    );
  });
});

describe("a sender-bound copy that fails to open is final", () => {
  for (const bound_only of [true, false]) {
    it(`keeps the older copy unused when the bound copy belongs to another message (bound writes ${bound_only ? "on" : "off"})`, async () => {
      escrow_switch.bound_only = bound_only;

      const moved = await seal(
        bound_escrow_key(KEY_A),
        bound_body("body of a"),
        escrow_aad_v3(KEY_A),
      );

      served.set(bound_escrow_key(KEY_B), {
        ...moved,
        message_id: bound_escrow_key(KEY_B),
      });
      served.set(KEY_B, await seal(KEY_B, "older body", escrow_aad_v2(KEY_B)));

      expect(await fetch_from_escrow(KEY_B, ALICE)).toBeNull();
      expect(requested).not.toContain(KEY_B);
      expect(cached.has(KEY_B)).toBe(false);
    });
  }

  it("keeps the older copy unused when the bound copy is damaged", async () => {
    const sealed = await seal(
      bound_escrow_key(KEY_B),
      bound_body("body of b"),
      escrow_aad_v3(KEY_B),
    );

    served.set(bound_escrow_key(KEY_B), {
      ...sealed,
      encrypted_plaintext: array_to_base64(new Uint8Array(40)),
    });
    served.set(KEY_B, await seal(KEY_B, "older body", escrow_aad_v2(KEY_B)));

    expect(await fetch_from_escrow(KEY_B, ALICE)).toBeNull();
    expect(await fetch_verified_from_escrow(KEY_B, ALICE)).toBeNull();
  });

  it("reports an unavailable bound copy without reading the older copy", async () => {
    failing_rows.add(bound_escrow_key(KEY_B));
    served.set(KEY_B, await seal(KEY_B, "older body", escrow_aad_v2(KEY_B)));

    await expect(fetch_from_escrow(KEY_B, ALICE)).rejects.toBeInstanceOf(
      EscrowUnavailableError,
    );
    await expect(
      fetch_verified_from_escrow(KEY_B, ALICE),
    ).rejects.toBeInstanceOf(EscrowUnavailableError);
    expect(requested).not.toContain(KEY_B);
    expect(cached.has(KEY_B)).toBe(false);
  });

  it("reads the bound copy once a lookup that failed recovers", async () => {
    const body = bound_body("bound body");

    served.set(
      bound_escrow_key(KEY_B),
      await seal(bound_escrow_key(KEY_B), body, escrow_aad_v3(KEY_B)),
    );
    served.set(KEY_B, await seal(KEY_B, "older body", escrow_aad_v2(KEY_B)));
    failing_rows.add(bound_escrow_key(KEY_B));

    await expect(fetch_from_escrow(KEY_B, ALICE)).rejects.toBeInstanceOf(
      EscrowUnavailableError,
    );

    failing_rows.clear();

    expect(await fetch_from_escrow(KEY_B, ALICE)).toEqual({
      plaintext: "bound body",
      verified: true,
      unconfirmed_sender: false,
      downgraded: false,
      account_unbound: true,
    });
    expect(requested).not.toContain(KEY_B);
  });

  it("retries a bound copy lookup that fails once", async () => {
    const body = bound_body("bound body");

    served.set(
      bound_escrow_key(KEY_B),
      await seal(bound_escrow_key(KEY_B), body, escrow_aad_v3(KEY_B)),
    );
    failures_left.set(bound_escrow_key(KEY_B), 1);

    expect(await fetch_verified_from_escrow(KEY_B, ALICE)).toBe("bound body");
  });

  for (const bound_only of [true, false]) {
    it(`reads the older copy as unverified when no bound copy exists (bound writes ${bound_only ? "on" : "off"})`, async () => {
      escrow_switch.bound_only = bound_only;
      served.set(KEY_B, await seal(KEY_B, "older body", escrow_aad_v2(KEY_B)));

      expect(await fetch_from_escrow(KEY_B, ALICE)).toEqual({
        plaintext: "older body",
        verified: false,
        unconfirmed_sender: false,
        downgraded: false,
        account_unbound: true,
      });
    });
  }

  it("still uses a bound copy that opens for this message", async () => {
    served.set(
      bound_escrow_key(KEY_B),
      await seal(
        bound_escrow_key(KEY_B),
        bound_body("body of b"),
        escrow_aad_v3(KEY_B),
      ),
    );

    expect(await fetch_from_escrow(KEY_B, ALICE)).toEqual({
      plaintext: "body of b",
      verified: true,
      unconfirmed_sender: false,
      downgraded: false,
      account_unbound: true,
    });
  });
});
