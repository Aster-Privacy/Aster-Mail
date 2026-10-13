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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  vault: { identity_key: "identity-key-a", previous_keys: [] as string[] },
  identity_attempts: 0,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "correct horse battery staple",
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  wait_for_keys_ready: vi.fn(async () => true),
  on_vault_cleared: () => () => {},
  on_keys_ready: () => () => {},
}));

vi.mock("@/services/crypto/vault_refresh", () => ({
  fetch_refreshed_vault: vi.fn(async () => null),
  adopt_refreshed_vault: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/envelope", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/services/crypto/envelope")>();

  return {
    ...original,
    first_base64_byte: () => 0,
    decrypt_envelope_with_identity_key: vi.fn(
      async (
        ...args: Parameters<typeof original.decrypt_envelope_with_identity_key>
      ) => {
        h.identity_attempts += 1;

        return original.decrypt_envelope_with_identity_key(...args);
      },
    ),
  };
});

vi.mock("@/services/crypto/legacy_ios_envelope", () => ({
  decrypt_legacy_ios_envelope: vi.fn(async () => null),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(async () => null),
}));

import {
  clear_envelope_cache,
  decrypt_envelope,
} from "@/hooks/email_list_helpers/decrypt";
import { encrypt_envelope_with_identity_key } from "@/services/crypto/envelope";

const CACHE_BUDGET_CHARS = 16_000_000;

function seal(body_html: string) {
  return encrypt_envelope_with_identity_key(
    {
      subject: "Weekly digest",
      body_text: "",
      body_html,
      from: { name: "A", email: "a@example.test" },
    },
    "identity-key-a",
  );
}

describe("decrypted envelope cache size", () => {
  beforeEach(() => {
    h.identity_attempts = 0;
    clear_envelope_cache();
  });

  it("evicts the oldest large messages once the size budget is reached", async () => {
    const sealed = await seal("<p>".padEnd(1_000_000, "x"));
    const copies = Math.ceil(CACHE_BUDGET_CHARS / sealed.encrypted.length) + 1;

    for (let i = 0; i < copies; i++) {
      const result = await decrypt_envelope(
        sealed.encrypted,
        sealed.nonce,
        `m${i}`,
      );

      expect(result?.subject).toBe("Weekly digest");
    }

    expect(h.identity_attempts).toBe(copies);

    await decrypt_envelope(sealed.encrypted, sealed.nonce, `m${copies - 1}`);
    expect(h.identity_attempts).toBe(copies);

    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m0");
    expect(h.identity_attempts).toBe(copies + 1);
  });

  it("keeps a single message larger than the budget", async () => {
    const sealed = await seal("<p>".padEnd(CACHE_BUDGET_CHARS, "x"));

    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");
    await decrypt_envelope(sealed.encrypted, sealed.nonce, "m1");

    expect(h.identity_attempts).toBe(1);
  });

  it("keeps many small messages cached", async () => {
    const sealed = await seal("<p>Hello</p>");

    for (let i = 0; i < 200; i++) {
      await decrypt_envelope(sealed.encrypted, sealed.nonce, `m${i}`);
    }
    for (let i = 0; i < 200; i++) {
      await decrypt_envelope(sealed.encrypted, sealed.nonce, `m${i}`);
    }

    expect(h.identity_attempts).toBe(200);
  });

  it("counts freed space after a clear", async () => {
    const sealed = await seal("<p>".padEnd(1_000_000, "x"));
    const copies = Math.ceil(CACHE_BUDGET_CHARS / sealed.encrypted.length) - 1;

    for (let i = 0; i < copies; i++) {
      await decrypt_envelope(sealed.encrypted, sealed.nonce, `a${i}`);
    }
    clear_envelope_cache();
    for (let i = 0; i < copies; i++) {
      await decrypt_envelope(sealed.encrypted, sealed.nonce, `b${i}`);
    }
    await decrypt_envelope(sealed.encrypted, sealed.nonce, "b0");

    expect(h.identity_attempts).toBe(copies * 2);
  });
});
