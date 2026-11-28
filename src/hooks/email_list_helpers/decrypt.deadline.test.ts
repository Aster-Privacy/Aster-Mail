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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  pgp_calls: 0,
  pgp_hangs: true,
}));

vi.mock("@/services/crypto/vault_key_recovery", () => ({
  keys_added_by_recovery: () => [],
  recover_pgp_keys_from_history: async () => null,
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

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: vi.fn(async () => undefined),
}));

vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(() => {
    h.pgp_calls += 1;
    if (h.pgp_hangs) return new Promise<string>(() => undefined);

    return Promise.resolve(
      JSON.stringify({
        subject: "Quarterly report",
        from: { email: "sender@example.com", name: "Sender" },
        to: [],
        body_text: "",
      }),
    );
  }),
}));

vi.mock("@/services/crypto/legacy_ios_envelope", () => ({
  decrypt_legacy_ios_mail_envelope: vi.fn(async () => null),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: vi.fn(async () => null),
}));

import {
  ENVELOPE_OPEN_DEADLINE_MS,
  clear_envelope_cache,
  decrypt_envelope,
} from "@/hooks/email_list_helpers/decrypt";
import { array_to_base64 } from "@/services/crypto/envelope";

const ARMORED = array_to_base64(
  new TextEncoder().encode(
    "-----BEGIN PGP MESSAGE-----\n\nwcBMA0\n-----END PGP MESSAGE-----\n",
  ),
);

describe("list envelopes whose decrypt never settles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.vault = { identity_key: "identity-key-a", previous_keys: [] };
    h.pgp_calls = 0;
    h.pgp_hangs = true;
    clear_envelope_cache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up on a hung decrypt at the deadline", async () => {
    let settled = false;
    const opened = decrypt_envelope(ARMORED, "", "hung-1").then((value) => {
      settled = true;

      return value;
    });

    await vi.advanceTimersByTimeAsync(ENVELOPE_OPEN_DEADLINE_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await opened).toBe(null);
  });

  it("does not keep the hung attempt cached for the next load", async () => {
    const first = decrypt_envelope(ARMORED, "", "hung-2");

    await vi.advanceTimersByTimeAsync(ENVELOPE_OPEN_DEADLINE_MS);
    expect(await first).toBe(null);

    const calls_after_first = h.pgp_calls;

    h.pgp_hangs = false;
    const second = decrypt_envelope(ARMORED, "", "hung-2");

    await vi.advanceTimersByTimeAsync(0);
    await second;

    expect(h.pgp_calls).toBeGreaterThan(calls_after_first);
  });
});
