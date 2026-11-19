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
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  server: {} as Record<string, unknown>,
  local: {} as Record<string, unknown>,
  writes: 0,
}));

vi.mock("./memory_key_store", async (import_original) => ({
  ...(await import_original<typeof import("./memory_key_store")>()),
  has_vault_in_memory: () => true,
  get_vault_from_memory: () => h.local,
}));

vi.mock("./storage_write_key", () => ({
  load_storage_write_key_bytes: async () => new Uint8Array(32).fill(3),
}));

vi.mock("./legacy_keks", () => ({
  decrypt_with_legacy_derived_keys: async () => null,
}));

vi.mock("./ratchet_sync", () => ({
  derive_ratchet_encryption_key: async () => ({}) as CryptoKey,
  derive_ratchet_encryption_key_from_base: async () => ({}) as CryptoKey,
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock: async <T>(run: () => Promise<T>) => run(),
}));

vi.mock("./vault_cas_write", async () => {
  const actual =
    await vi.importActual<typeof import("./vault_cas_write")>(
      "./vault_cas_write",
    );

  return {
    ...actual,
    write_vault_merged: async ({
      next,
      base,
    }: {
      next: Record<string, unknown>;
      base: Record<string, unknown>;
    }) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      h.writes += 1;
      h.server = actual.merge_vault_for_write(
        h.server as never,
        base as never,
        next as never,
      ) as unknown as Record<string, unknown>;

      return { status: "written", vault: h.server };
    },
  };
});

type CreateKey = () => Promise<CryptoKey | null>;

async function create_key(): Promise<CreateKey> {
  vi.resetModules();
  const record = (await import("./prekey_seal")) as unknown as Record<
    string,
    unknown
  >;

  return (record.create_prekey_seal_key ??
    record.ensure_prekey_seal_key) as CreateKey;
}

describe("prekey seal key created on two devices at once", () => {
  it("leaves both devices with the one key the vault kept", { timeout: 30000 }, async () => {
    h.server = { vault_format: 2 };
    h.local = { vault_format: 2 };

    const [device_a, device_b] = [await create_key(), await create_key()];
    const [first, second] = await Promise.all([device_a(), device_b()]);

    expect(h.writes).toBe(2);
    expect(typeof h.server.prekey_seal_key).toBe("string");
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    const iv = new Uint8Array(12).fill(1);
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      first!,
      new Uint8Array([1, 2, 3]),
    );
    const opened = await crypto.subtle
      .decrypt({ name: "AES-GCM", iv }, second!, sealed)
      .then(
        (plain) => new Uint8Array(plain),
        () => null,
      );

    expect(opened).toEqual(new Uint8Array([1, 2, 3]));
  });
});
