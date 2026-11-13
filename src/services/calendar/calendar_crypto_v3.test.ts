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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { beforeEach, describe, expect, it, vi } from "vitest";

const key_state: {
  write: CryptoKey | null;
  bases: CryptoKey[];
  aes: CryptoKey[];
} = { write: null, bases: [], aes: [] };

vi.mock("@/services/crypto/legacy_keks", () => ({
  get_account_data_write_base_key: () => key_state.write,
  get_account_data_base_keys: () => key_state.bases,
  get_account_data_crypto_keys: () => key_state.aes,
  get_account_data_write_key: () =>
    key_state.write ? (key_state.aes[0] ?? null) : null,
}));

vi.mock("@/services/crypto/account_data_writer", () => {
  class AccountKeyUnavailableError extends Error {}

  return {
    AccountKeyUnavailableError,
    account_data_write_key: async () => null,
    account_data_write_key_strict: async () => {
      throw new AccountKeyUnavailableError("account key is not loaded");
    },
  };
});

const {
  CALENDAR_BLOB_FORMAT_V3,
  CalendarKeyMissingError,
  calendar_pq_salt,
  calendar_v3_keyring,
  decrypt_calendar_payload_v3,
  derive_calendar_v3_key_from_raw,
  encode_binding_v3,
  v3_blob_key_id,
} = await import("@/services/calendar/calendar_crypto_v3");
const {
  CALENDAR_BLOB_FORMAT_V2,
  calendar_write_key,
  decrypt_calendar_payload,
  encode_binding,
  encrypt_calendar_payload,
  encrypt_calendar_payload_v2,
} = await import("@/services/calendar/calendar_crypto");
const { encrypt_calendar_payload_v1 } =
  await import("@/tests/calendar_v1_fixture");

const VECTOR = {
  salt: "9897d3455bee4396d3fecb85ddd6b391195812a1435eac92e5920e9c18a2333c",
  id: "250d01e4c63b39c74065c577bc092315",
  blob: "AyUNAeTGOznHQGXFd7wJIxX1IHLAz45hqkMY7NJ7YeCa79VEgC4IdhHZEJ4lG6QrVNvj",
  nonce: "oKGio6Slpqeoqaqr",
};

const binding = { calendar_id: "cal-1", event_id: "evt-1" };

function vector_base_raw(): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => index);
}

function pq_secret(offset = 0): Uint8Array {
  return Uint8Array.from(
    { length: 2400 },
    (_, index) => (index + offset) % 251,
  );
}

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function base_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveBits"]);
}

function aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function make_vault(current: Uint8Array | null, previous: Uint8Array[] = []) {
  return {
    identity_key: "v3-identity-key",
    ...(current ? { ratchet_pq_identity_key: to_base64(current) } : {}),
    ratchet_previous_keys: previous.map((secret) => ({
      ratchet_pq_identity_key: to_base64(secret),
    })),
  } as unknown as EncryptedVault;
}

beforeEach(async () => {
  const base = await base_key(vector_base_raw());

  key_state.write = base;
  key_state.bases = [base];
  key_state.aes = [await aes_key(vector_base_raw())];
});

describe("calendar v3 key derivation", () => {
  it("matches the pinned cross-platform vector", async () => {
    const salt = await calendar_pq_salt(pq_secret());
    const key = await derive_calendar_v3_key_from_raw(
      vector_base_raw(),
      pq_secret(),
    );
    const keyring = {
      has_pq: true,
      write: key,
      read: new Map([[key.id, key]]),
    };
    const result = await decrypt_calendar_payload_v3(
      { ciphertext: VECTOR.blob, nonce: VECTOR.nonce },
      keyring,
      binding,
    );

    expect(to_hex(salt)).toBe(VECTOR.salt);
    expect(key.id).toBe(VECTOR.id);
    expect(v3_blob_key_id(VECTOR.blob)).toBe(VECTOR.id);
    expect(new TextDecoder().decode(result.plaintext)).toBe(
      '{"title":"Vector"}',
    );
  });

  it("rejects a post-quantum secret of the wrong length", async () => {
    await expect(calendar_pq_salt(new Uint8Array(32))).rejects.toThrow();
  });
});

describe("calendar v3 payload encryption", () => {
  it("writes v3 for an account with a post-quantum identity", async () => {
    const vault = make_vault(pq_secret());
    const write_key = await calendar_write_key(vault);
    const record = await encrypt_calendar_payload({ a: 1 }, vault, binding);
    const restored = await decrypt_calendar_payload<{ a: number }>(
      record,
      vault,
      binding,
    );

    expect(write_key?.format).toBe(CALENDAR_BLOB_FORMAT_V3);
    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V3);
    expect(v3_blob_key_id(record.ciphertext)).toBe(VECTOR.id);
    expect(restored).toMatchObject({
      payload: { a: 1 },
      format: CALENDAR_BLOB_FORMAT_V3,
      bound: true,
      current: true,
    });
  });

  it("rejects a v3 blob moved to another event or calendar", async () => {
    const vault = make_vault(pq_secret());
    const record = await encrypt_calendar_payload({ a: 1 }, vault, binding);

    await expect(
      decrypt_calendar_payload(record, vault, {
        calendar_id: "cal-1",
        event_id: "evt-2",
      }),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload(record, vault, {
        calendar_id: "cal-2",
        event_id: "evt-1",
      }),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload(record, vault, { calendar_id: "cal-1" }),
    ).rejects.toBeDefined();
  });

  it("refuses to bind without a calendar id", async () => {
    const vault = make_vault(pq_secret());

    await expect(
      encrypt_calendar_payload({ a: 1 }, vault, { calendar_id: "" }),
    ).rejects.toThrow();
  });

  it("refuses ids that contain a line break", async () => {
    const v3_vault = make_vault(pq_secret());
    const v2_vault = make_vault(null);
    const smuggled = { calendar_id: "cal-1\ncalendar_id=cal-2", event_id: "" };
    const split_event = { calendar_id: "cal-1", event_id: "evt-1\nx" };

    expect(() => encode_binding_v3(smuggled)).toThrow();
    expect(() => encode_binding_v3(split_event)).toThrow();
    expect(() => encode_binding(smuggled)).toThrow();
    expect(() => encode_binding(split_event)).toThrow();
    await expect(
      encrypt_calendar_payload({ a: 1 }, v3_vault, smuggled),
    ).rejects.toThrow();
    await expect(
      encrypt_calendar_payload({ a: 1 }, v2_vault, split_event),
    ).rejects.toThrow();
  });

  it("refuses to write when the account key is not loaded", async () => {
    key_state.write = null;
    key_state.bases = [];

    const vault = make_vault(pq_secret(7));

    expect(await calendar_write_key(vault)).toBeNull();
    await expect(
      encrypt_calendar_payload({ a: 1 }, vault, binding),
    ).rejects.toThrow("account key is not loaded");
  });

  it("reads blobs written under a previous post-quantum identity", async () => {
    const old_vault = make_vault(pq_secret(1));
    const record = await encrypt_calendar_payload({ a: 2 }, old_vault, binding);
    const rotated = make_vault(pq_secret(2), [pq_secret(1)]);
    const restored = await decrypt_calendar_payload<{ a: number }>(
      record,
      rotated,
      binding,
    );

    expect(restored.payload).toEqual({ a: 2 });
    expect(restored.current).toBe(false);
  });

  it("reports a missing key for an unknown key id", async () => {
    const other = make_vault(pq_secret(3));
    const record = await encrypt_calendar_payload({ a: 3 }, other, binding);

    await expect(
      decrypt_calendar_payload_v3(
        record,
        await calendar_v3_keyring(make_vault(pq_secret(4))),
        binding,
      ),
    ).rejects.toBeInstanceOf(CalendarKeyMissingError);
  });

  it("picks up a post-quantum identity changed in place", async () => {
    const vault = make_vault(pq_secret(5));
    const first = await calendar_write_key(vault);

    (vault as { ratchet_pq_identity_key?: string }).ratchet_pq_identity_key =
      to_base64(pq_secret(6));

    const second = await calendar_write_key(vault);

    expect(first?.format).toBe(CALENDAR_BLOB_FORMAT_V3);
    expect(second?.format).toBe(CALENDAR_BLOB_FORMAT_V3);
    expect(
      first?.format === CALENDAR_BLOB_FORMAT_V3 &&
        second?.format === CALENDAR_BLOB_FORMAT_V3 &&
        first.key.id !== second.key.id,
    ).toBe(true);
  });

  it("reads bound v2 blobs for an account with a post-quantum identity", async () => {
    const vault = make_vault(pq_secret());
    const v2 = await encrypt_calendar_payload_v2(
      { a: 4 },
      key_state.aes[0],
      binding,
    );
    const restored = await decrypt_calendar_payload<{ a: number }>(
      v2,
      vault,
      binding,
    );

    expect(restored.payload).toEqual({ a: 4 });
    expect(restored.bound).toBe(true);
  });

  it("rejects v1 and unbound v2 blobs for an account with a post-quantum identity", async () => {
    const vault = make_vault(pq_secret());
    const v1 = await encrypt_calendar_payload_v1({ a: 5 }, vault);
    const unbound = await encrypt_calendar_payload_v2(
      { a: 6 },
      key_state.aes[0],
      { calendar_id: "cal-1" },
    );
    const calendar_unbound = await encrypt_calendar_payload_v2(
      { a: 7 },
      key_state.aes[0],
      { calendar_id: "" },
    );

    await expect(
      decrypt_calendar_payload(v1, vault, binding),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload(unbound, vault, binding),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload(calendar_unbound, vault, {
        calendar_id: "cal-1",
      }),
    ).rejects.toBeDefined();
  });

  it("rejects a v3-framed v1 blob for an account with a post-quantum identity", async () => {
    const vault = make_vault(pq_secret());
    let v1 = await encrypt_calendar_payload_v1({ a: 8 }, vault);

    while (atob(v1.ciphertext).charCodeAt(0) !== 3) {
      v1 = await encrypt_calendar_payload_v1({ a: 8 }, vault);
    }

    await expect(
      decrypt_calendar_payload(v1, vault, binding),
    ).rejects.toBeDefined();
  });

  it("rejects v1 and unbound v2 blobs for an account without a post-quantum identity", async () => {
    const vault = make_vault(null);
    const v1 = await encrypt_calendar_payload_v1({ a: 9 }, vault);
    const unbound = await encrypt_calendar_payload_v2(
      { a: 10 },
      key_state.aes[0],
      { calendar_id: "cal-1" },
    );

    await expect(
      decrypt_calendar_payload(v1, vault, binding),
    ).rejects.toBeDefined();
    await expect(
      decrypt_calendar_payload(unbound, vault, binding),
    ).rejects.toBeDefined();
  });

  it("writes v2 for an account without a post-quantum identity when the account key is loaded", async () => {
    const vault = make_vault(null);
    const write_key = await calendar_write_key(vault);
    const record = await encrypt_calendar_payload({ a: 11 }, vault, binding);

    expect(write_key?.format).toBe(CALENDAR_BLOB_FORMAT_V2);
    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V2);
  });

  it("never writes v1 when no account key is loaded", async () => {
    key_state.write = null;

    const vault = make_vault(null);

    await expect(
      encrypt_calendar_payload({ a: 12 }, vault, binding),
    ).rejects.toThrow("account key is not loaded");
  });

  it("does not read v2 blobs with keys from another context", async () => {
    const vault = make_vault(pq_secret());
    const foreign = await aes_key(new Uint8Array(32).fill(9));
    const record = await encrypt_calendar_payload_v2(
      { a: 6 },
      foreign,
      binding,
    );

    await expect(
      decrypt_calendar_payload(record, vault, binding),
    ).rejects.toBeDefined();
  });

  it("writes v2 for an account without a post-quantum identity", async () => {
    const vault = make_vault(null);
    const key = await aes_key(vector_base_raw());
    const record = await encrypt_calendar_payload({ a: 7 }, vault, binding, {
      format: CALENDAR_BLOB_FORMAT_V2,
      key,
    });

    expect(record.format).toBe(CALENDAR_BLOB_FORMAT_V2);
  });
});
