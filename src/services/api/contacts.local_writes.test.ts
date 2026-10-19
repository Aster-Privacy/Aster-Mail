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
import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./client", () => ({ api_client: api }));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => null,
  get_or_create_derived_encryption_crypto_key: async () => null,
  on_vault_cleared: () => () => undefined,
}));

import {
  bulk_delete_contacts,
  create_contact,
  delete_contact,
  update_contact,
} from "./contacts";
import { merge_contacts } from "./contact_duplicates";
import { import_csv } from "./contact_sync";

import { on_local_contact_write } from "@/services/contact_local_writes";

const writes = vi.fn();

on_local_contact_write(writes);

const contact_writes: Array<[string, () => Promise<unknown>]> = [
  ["create", () => create_contact({} as never)],
  ["update", () => update_contact("c1", {} as never)],
  ["delete", () => delete_contact("c1")],
  ["bulk delete", () => bulk_delete_contacts({ ids: ["c1"] } as never)],
  ["import", () => import_csv([])],
];

beforeEach(() => {
  writes.mockClear();
  api.post.mockReset();
  api.put.mockReset();
  api.delete.mockReset();
});

describe("local contact writes", () => {
  it.each(contact_writes)("announces a successful %s", async (_name, write) => {
    api.post.mockResolvedValue({ data: {} });
    api.put.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({ data: {} });

    await write();

    expect(writes).toHaveBeenCalledTimes(1);
  });

  it.each(contact_writes)(
    "stays quiet when a %s fails",
    async (_name, write) => {
      api.post.mockResolvedValue({ error: "offline" });
      api.put.mockResolvedValue({ error: "offline" });
      api.delete.mockResolvedValue({ error: "offline" });

      await write();

      expect(writes).not.toHaveBeenCalled();
    },
  );

  it("announces a successful merge", async () => {
    const contacts = await import("./contacts");

    vi.spyOn(contacts, "encrypt_contact_data").mockResolvedValue({
      encrypted_data: "e",
      data_nonce: "n",
      integrity_hash: "h",
    });
    api.post.mockResolvedValue({ data: { success: true } });

    await merge_contacts("c1", "c2", {} as never);

    expect(writes).toHaveBeenCalledTimes(1);
  });
});
