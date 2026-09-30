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

const hoisted = vi.hoisted(() => ({
  patch_calls: [] as Array<{ id: string; is_read?: boolean }>,
  resolvers: [] as Array<(ok: boolean) => void>,
}));

vi.mock("./mail_metadata_core", () => ({
  blob_only_update_fields: () => [],
  create_default_metadata: () => ({ is_read: false }),
  decrypt_mail_metadata: async () => ({ is_read: false }),
  encrypt_mail_metadata: async () => ({
    encrypted_metadata: "enc",
    metadata_nonce: "nonce",
  }),
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: async () => ({ data: null }),
  patch_mail_item_metadata: (id: string, body: { is_read?: boolean }) => {
    hoisted.patch_calls.push({ id, is_read: body.is_read });

    return new Promise((resolve) => {
      hoisted.resolvers.push((ok) =>
        resolve(ok ? { data: { ok: true } } : { error: "failed" }),
      );
    });
  },
}));

import { update_item_metadata } from "./mail_metadata_writer";

import { begin_read_change, get_flag_intent } from "@/services/read_intent";

const BASE = { encrypted_metadata: "enc", metadata_nonce: "nonce" };

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("update_item_metadata read ordering", () => {
  beforeEach(() => {
    hoisted.patch_calls.length = 0;
    hoisted.resolvers.length = 0;
  });

  it("sends read, unread, read in order without deduping the last write", async () => {
    const first = update_item_metadata("w_a", BASE, { is_read: true });

    await flush();
    hoisted.resolvers[0](true);
    await first;
    const second = update_item_metadata("w_a", BASE, { is_read: false });

    await flush();
    hoisted.resolvers[1](true);
    await second;
    const third = update_item_metadata("w_a", BASE, { is_read: true });

    await flush();
    hoisted.resolvers[2](true);
    await third;

    expect(hoisted.patch_calls.map((c) => c.is_read)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("does not start a newer write until the older one settles", async () => {
    const first = update_item_metadata("w_b", BASE, { is_read: true });
    const second = update_item_metadata("w_b", BASE, { is_read: false });

    await flush();
    expect(hoisted.patch_calls).toHaveLength(1);
    hoisted.resolvers[0](true);
    await first;
    await flush();
    expect(hoisted.patch_calls.map((c) => c.is_read)).toEqual([true, false]);
    hoisted.resolvers[1](true);
    await second;
  });

  it("keeps the newer intent when a superseded write fails", async () => {
    begin_read_change(["w_c"]);
    const first = update_item_metadata("w_c", BASE, { is_read: true });

    await flush();
    begin_read_change(["w_c"]);
    const second = update_item_metadata("w_c", BASE, { is_read: false });

    hoisted.resolvers[0](false);
    await first;
    expect(get_flag_intent("w_c", "is_read")).toBe(false);
    await flush();
    hoisted.resolvers[1](true);
    await second;
    expect(get_flag_intent("w_c", "is_read")).toBe(false);
  });

  it("repeats a forced write even when it matches the last one", async () => {
    const first = update_item_metadata("w_d", BASE, { is_read: false });

    await flush();
    hoisted.resolvers[0](true);
    await first;
    const forced = update_item_metadata(
      "w_d",
      BASE,
      { is_read: false },
      { force: true },
    );

    await flush();
    hoisted.resolvers[1](true);
    await forced;
    expect(hoisted.patch_calls).toHaveLength(2);
  });
});
