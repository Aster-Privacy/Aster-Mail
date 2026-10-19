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
import type { TagDefinition } from "@/services/api/tags";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/api/tags", () => ({
  list_tags: vi.fn(),
  create_tag: vi.fn(),
  update_tag: vi.fn(),
  delete_tag: vi.fn(),
  get_tag_counts: vi.fn(),
  add_tag_to_item: vi.fn(),
  remove_tag_from_item: vi.fn(),
}));

import { decrypt_tag, encrypt_tag_field } from "@/hooks/use_tags";
import { clear_vault_from_memory } from "@/services/crypto/memory_key_store";
import { start_session } from "@/services/crypto/crypto_key_cache";

const IDENTITY_A = "-----BEGIN PGP PRIVATE KEY BLOCK-----\nalpha\n";
const IDENTITY_B = "-----BEGIN PGP PRIVATE KEY BLOCK-----\nbravo\n";
const TAG_COUNT = 30;

async function build_tag(
  index: number,
  identity_key: string,
): Promise<TagDefinition> {
  const name = await encrypt_tag_field(`Tag ${index}`, identity_key);
  const color = await encrypt_tag_field("#abcdef", identity_key);
  const icon = await encrypt_tag_field("flag", identity_key);

  return {
    id: `t${index}`,
    tag_token: `token-${index}`,
    encrypted_name: name.encrypted,
    name_nonce: name.nonce,
    encrypted_color: color.encrypted,
    color_nonce: color.nonce,
    encrypted_icon: icon.encrypted,
    icon_nonce: icon.nonce,
    sort_order: index,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as TagDefinition;
}

function key_derivations(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((call) =>
    new TextDecoder()
      .decode(call[1] as Uint8Array)
      .endsWith("astermail-tags-v1"),
  ).length;
}

function aes_imports(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(
    (call) => (call[2] as { name?: string })?.name === "AES-GCM",
  ).length;
}

let tags_a: TagDefinition[] = [];

beforeEach(async () => {
  clear_vault_from_memory();
  tags_a = await Promise.all(
    Array.from({ length: TAG_COUNT }, (_, i) => build_tag(i, IDENTITY_A)),
  );
  clear_vault_from_memory();
  start_session();
});

afterEach(() => {
  vi.restoreAllMocks();
  clear_vault_from_memory();
});

describe("tag field key cache", () => {
  it("derives the key once for every field of every tag", async () => {
    const digest = vi.spyOn(crypto.subtle, "digest");
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const decrypted = await Promise.all(
      tags_a.map((tag) => decrypt_tag(tag, IDENTITY_A)),
    );

    expect(decrypted.map((tag) => tag?.name)).toEqual(
      Array.from({ length: TAG_COUNT }, (_, i) => `Tag ${i}`),
    );
    expect(decrypted.every((tag) => tag?.color === "#abcdef")).toBe(true);
    expect(decrypted.every((tag) => tag?.icon === "flag")).toBe(true);
    expect(key_derivations(digest)).toBe(1);
    expect(aes_imports(import_key)).toBe(1);

    await encrypt_tag_field("New", IDENTITY_A);
    expect(key_derivations(digest)).toBe(1);
    expect(aes_imports(import_key)).toBe(1);
  });

  it("derives the key again after the vault is cleared", async () => {
    const digest = vi.spyOn(crypto.subtle, "digest");
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    await decrypt_tag(tags_a[0], IDENTITY_A);
    clear_vault_from_memory();
    start_session();
    const decrypted = await decrypt_tag(tags_a[1], IDENTITY_A);

    expect(decrypted?.name).toBe("Tag 1");
    expect(aes_imports(import_key)).toBe(2);
    expect(
      digest.mock.calls.filter((call) =>
        new TextDecoder()
          .decode(call[1] as Uint8Array)
          .startsWith("tag_field_key\x00"),
      ),
    ).toHaveLength(2);
  });

  it("keeps a separate key for each identity key", async () => {
    const tag_b = await build_tag(0, IDENTITY_B);

    clear_vault_from_memory();
    start_session();
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const [from_a, from_b] = await Promise.all([
      decrypt_tag(tags_a[0], IDENTITY_A),
      decrypt_tag(tag_b, IDENTITY_B),
    ]);

    expect(from_a?.name).toBe("Tag 0");
    expect(from_b?.name).toBe("Tag 0");
    expect(aes_imports(import_key)).toBe(2);
    expect(await decrypt_tag(tag_b, IDENTITY_A)).toBeNull();
  });

  it("does not cache a key derived after sign-out", async () => {
    clear_vault_from_memory();
    const import_key = vi.spyOn(crypto.subtle, "importKey");

    const first = await decrypt_tag(tags_a[0], IDENTITY_A);
    const second = await decrypt_tag(tags_a[1], IDENTITY_A);

    expect(first?.name).toBe("Tag 0");
    expect(second?.name).toBe("Tag 1");
    expect(aes_imports(import_key)).toBe(6);
  });

  it("never builds a cache id from the identity key", async () => {
    const map_set = vi.spyOn(Map.prototype, "set");

    await decrypt_tag(tags_a[0], IDENTITY_A);

    const ids = map_set.mock.calls
      .map((call) => call[0])
      .filter((id): id is string => typeof id === "string")
      .filter((id) => id !== IDENTITY_A);

    expect(ids.some((id) => id.startsWith("tag_field_key:"))).toBe(true);
    expect(ids.some((id) => id.includes("PRIVATE KEY"))).toBe(false);
    expect(ids.some((id) => id.includes(IDENTITY_A))).toBe(false);
  });
});
