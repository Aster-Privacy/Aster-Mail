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

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  puts: [] as string[],
  status: 403,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ error: "x", status: 404 })),
    put: vi.fn(async (_path: string, body: { address: string }) => {
      h.puts.push(body.address);

      return h.status === 200
        ? { data: { success: true, active: true }, status: 200 }
        : { error: "x", status: h.status };
    }),
  },
}));

vi.mock("@/services/crypto/address_identity_entry", () => ({
  address_entry_forms: (address: string) => [address, `canonical:${address}`],
  matches_local_address_keys: () => false,
  sign_address_entry: (_vault: unknown, form: string) => ({
    address: form,
    kem_identity_key: "k",
    signed_prekey: "p",
    signed_prekey_signature: "s",
  }),
  verify_address_entry: () => ({ valid: false, endorsers: [] }),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  lookup_identity_pin_record: vi.fn(async () => null),
  lookup_owner_key_pin: vi.fn(async () => null),
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_prekey_bundle: vi.fn(async () => null),
  fetch_ratchet_identity: vi.fn(async () => null),
}));

type DirectoryModule = typeof import("./address_identity_directory");

const VAULT = {
  ratchet_identity_key: "secret",
  ratchet_identity_public: "public",
  ratchet_signed_prekey_public: "prekey",
} as unknown as EncryptedVault;

async function load(): Promise<DirectoryModule> {
  vi.resetModules();

  return import("./address_identity_directory");
}

beforeEach(() => {
  h.puts.length = 0;
  h.status = 403;
  localStorage.clear();
});

describe("refused address entries", () => {
  it("stops after the first form is refused", async () => {
    const mod = await load();

    await mod.publish_address_entries(VAULT, ["alias@example.com"]);

    expect(h.puts).toEqual(["alias@example.com"]);
  });

  it("does not send a refused address again after a reload", async () => {
    const first = await load();

    await first.publish_address_entries(VAULT, ["alias@example.com"]);

    const second = await load();

    await second.publish_address_entries(VAULT, ["alias@example.com"]);

    expect(h.puts).toEqual(["alias@example.com"]);
    expect(JSON.stringify({ ...localStorage })).not.toContain("alias");
  });

  it("sends again once the hold has passed", async () => {
    const first = await load();

    await first.publish_address_entries(VAULT, ["alias@example.com"]);

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 7 * 3600_000);
    const second = await load();

    await second.publish_address_entries(VAULT, ["alias@example.com"]);
    clock.mockRestore();

    expect(h.puts).toEqual(["alias@example.com", "alias@example.com"]);
  });

  it("still sends every form for an accepted address and keeps no hold", async () => {
    h.status = 200;

    const mod = await load();

    await mod.publish_address_entries(VAULT, ["alias@example.com"]);

    expect(h.puts).toEqual([
      "alias@example.com",
      "canonical:alias@example.com",
    ]);
    expect(localStorage.length).toBe(0);
  });

  it("keeps trying on the send path while a hold exists", async () => {
    const first = await load();

    await first.publish_address_entries(VAULT, ["alias@example.com"]);

    const second = await load();

    expect(await second.ensure_address_entry(VAULT, "alias@example.com")).toBe(
      false,
    );
    expect(h.puts).toEqual(["alias@example.com", "alias@example.com"]);
  });
});
