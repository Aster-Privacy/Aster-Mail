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
import { beforeEach, describe, expect, it, vi } from "vitest";

const post_mock = vi.fn();
const decrypt_mock = vi.fn();

vi.mock("../client", () => ({
  api_client: {
    post: (...args: unknown[]) => post_mock(...args),
    patch: vi.fn(),
  },
}));

vi.mock("./crypto", async (import_original) => {
  const actual = await import_original<typeof import("./crypto")>();

  return {
    ...actual,
    decrypt_alias: (...args: unknown[]) => decrypt_mock(...args),
  };
});

vi.mock("./crud", () => ({ reencrypt_alias_local_part: vi.fn() }));
vi.mock("./list", () => ({ list_all_aliases: vi.fn() }));

import { compute_legacy_routing_hash, compute_routing_hash } from "./crypto";
import type { EmailAlias } from "./types";

function make_alias(
  id: string,
  routing_address_hash: string | undefined,
  extra: Partial<EmailAlias> = {},
): EmailAlias {
  return {
    id,
    encrypted_local_part: id,
    local_part_nonce: "n",
    alias_address_hash: `h-${id}`,
    routing_address_hash,
    domain: "aster.cx",
    is_enabled: true,
    is_random: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

async function load_heal() {
  vi.resetModules();

  return (await import("./backfill")).heal_legacy_routing_hashes;
}

describe("compute_legacy_routing_hash", () => {
  it("returns nothing for a local part without dots", async () => {
    expect(await compute_legacy_routing_hash("jesper", "aster.cx")).toBe(
      undefined,
    );
  });

  it("hashes the dotted form, which differs from the routing hash", async () => {
    const legacy = await compute_legacy_routing_hash(
      " Jesper.Floymo ",
      "Aster.cx",
    );
    const routing = await compute_routing_hash("jesper.floymo", "aster.cx");
    const dotless = await compute_routing_hash("jesperfloymo", "aster.cx");

    expect(legacy).toBeDefined();
    expect(legacy).not.toBe(routing);
    expect(routing).toBe(dotless);
  });
});

describe("heal_legacy_routing_hashes", () => {
  beforeEach(() => {
    post_mock.mockReset();
    decrypt_mock.mockReset();
  });

  it("normalizes only dotted aliases whose stored hash is stale", async () => {
    const heal = await load_heal();
    const dotless = await compute_routing_hash("jesper.floymo", "aster.cx");
    const legacy = await compute_legacy_routing_hash(
      "jesper.floymo",
      "aster.cx",
    );
    const locals: Record<string, string> = {
      stale: "jesper.floymo",
      current: "jesper.floymo",
      plain: "jesper",
      orphan: "jesper.floymo",
      missing: "jesper.floymo",
    };

    decrypt_mock.mockImplementation(async (alias: EmailAlias) => ({
      local_part: locals[alias.id],
      decryption_failed: false,
    }));
    post_mock.mockResolvedValue({
      data: { status: "merged", alias_id: "current" },
    });

    const changed = await heal([
      make_alias("stale", legacy),
      make_alias("current", dotless),
      make_alias("plain", "x"),
      make_alias("orphan", legacy, { orphaned_by_key_rotation: true }),
      make_alias("missing", undefined),
    ]);

    expect(changed).toBe(true);
    expect(post_mock).toHaveBeenCalledTimes(1);
    expect(post_mock).toHaveBeenCalledWith(
      "/addresses/v1/aliases/stale/normalize",
      { local_part: "jesper.floymo" },
    );
  });

  it("runs once per session and reports no change on conflict", async () => {
    const heal = await load_heal();
    const legacy = await compute_legacy_routing_hash("a.b", "aster.cx");

    decrypt_mock.mockResolvedValue({
      local_part: "a.b",
      decryption_failed: false,
    });
    post_mock.mockResolvedValue({
      data: { status: "conflict", alias_id: "x" },
    });

    expect(await heal([make_alias("x", legacy)])).toBe(false);
    expect(await heal([make_alias("x", legacy)])).toBe(false);
    expect(post_mock).toHaveBeenCalledTimes(1);
  });

  it("skips aliases that fail to decrypt or whose request throws", async () => {
    const heal = await load_heal();
    const legacy = await compute_legacy_routing_hash("a.b", "aster.cx");

    decrypt_mock
      .mockResolvedValueOnce({ local_part: "", decryption_failed: true })
      .mockResolvedValueOnce({ local_part: "a.b", decryption_failed: false })
      .mockResolvedValueOnce({ local_part: "a.b", decryption_failed: false });
    post_mock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { status: "normalized", alias_id: "z" } });

    const changed = await heal([
      make_alias("x", legacy),
      make_alias("y", legacy),
      make_alias("z", legacy),
    ]);

    expect(changed).toBe(true);
    expect(post_mock).toHaveBeenCalledTimes(2);
  });
});
