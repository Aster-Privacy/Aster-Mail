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

const SERVER_MAX_PAGE = 500;

const { get_mock, allowed_mock } = vi.hoisted(() => ({
  get_mock: vi.fn(),
  allowed_mock: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: get_mock,
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/api/aliases", async (import_original) => {
  const actual =
    await import_original<typeof import("@/services/api/aliases")>();

  return {
    ...actual,
    decrypt_aliases: vi.fn(async (aliases: { id: string }[]) =>
      aliases.map((a) => ({ id: a.id, local_part: a.id })),
    ),
  };
});

vi.mock("@/services/api/allowed_senders", () => ({
  list_allowed_senders: allowed_mock,
}));

vi.mock("@/services/api/contacts", () => ({
  list_contacts: vi.fn(async () => ({ data: { items: [] } })),
  decrypt_contacts: vi.fn(async () => []),
}));
vi.mock("@/services/api/ghost_aliases", () => ({
  list_ghost_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  decrypt_ghost_aliases: vi.fn(async () => []),
}));
vi.mock("@/services/api/mail_rules", () => ({
  list_rules: vi.fn(async () => ({ data: { rules: [] } })),
}));
vi.mock("@/services/api/signatures", () => ({
  list_signatures: vi.fn(async () => ({ data: { signatures: [] } })),
}));
vi.mock("@/services/api/templates", () => ({
  list_templates: vi.fn(async () => ({ data: { templates: [] } })),
}));
vi.mock("@/services/api/vacation_reply", () => ({
  get_vacation_reply: vi.fn(async () => ({ data: null })),
}));
vi.mock("@/services/api/blocked_senders", () => ({
  list_blocked_senders: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/services/api/auto_forward", () => ({
  list_forwarding_rules: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/services/api/external_accounts", () => ({
  list_external_accounts: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/hooks/use_folders", () => ({
  get_cached_folders: () => [],
}));
vi.mock("@/services/locked_folders", () => ({
  is_folder_token_locked: () => false,
}));

import { build_account_data_files } from "./account_data";

function make_alias(id: string) {
  return {
    id,
    encrypted_local_part: "",
    local_part_nonce: "",
    alias_address_hash: "",
    domain: "astermail.org",
    is_enabled: true,
    is_random: false,
    is_pinned: false,
    created_at: "",
    updated_at: "",
  };
}

function serve_aliases(total: number) {
  const all = Array.from({ length: total }, (_, i) => make_alias(`alias-${i}`));

  get_mock.mockImplementation(async (endpoint: string) => {
    const url = new URL(endpoint, "https://api.test");

    if (url.pathname !== "/addresses/v1/aliases") {
      return { error: "unexpected endpoint" };
    }
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? 50),
      SERVER_MAX_PAGE,
    );
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const aliases = all.slice(offset, offset + limit);

    return {
      data: {
        aliases,
        total,
        has_more: offset + aliases.length < total,
        max_aliases: -1,
      },
    };
  });
}

function serve_allowed_senders(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({
    id: `allowed-${i}`,
    sender_token: `token-${i}`,
    email: `sender${i}@example.com`,
    allowed_at: "",
    is_domain: false,
    created_at: "",
  }));

  allowed_mock.mockImplementation(async (limit = 500, offset = 0) => ({
    data: all.slice(offset, offset + Math.min(limit, SERVER_MAX_PAGE)),
  }));
}

async function read_json_file(name: string): Promise<{ id: string }[]> {
  const files = await build_account_data_files({
    contacts: false,
    settings: true,
  });
  const file = files.find((f) => f.name === name);

  expect(file).toBeDefined();

  return JSON.parse(new TextDecoder().decode(file!.bytes));
}

describe("build_account_data_files paging", () => {
  beforeEach(() => {
    get_mock.mockReset();
    allowed_mock.mockReset();
    serve_aliases(0);
    serve_allowed_senders(0);
  });

  it("exports every alias when the account has more than one page", async () => {
    serve_aliases(1234);

    const aliases = await read_json_file("aliases.json");

    expect(aliases).toHaveLength(1234);
    expect(new Set(aliases.map((a) => a.id)).size).toBe(1234);
    expect(aliases.at(-1)?.id).toBe("alias-1233");
  });

  it("exports every allowed sender when the list spans several pages", async () => {
    serve_allowed_senders(1100);

    const allowed = await read_json_file("allowed_senders.json");

    expect(allowed).toHaveLength(1100);
    expect(new Set(allowed.map((a) => a.id)).size).toBe(1100);
  });

  it("stops paging allowed senders at a defensive cap", async () => {
    allowed_mock.mockImplementation(async (_limit = 500, offset = 0) => ({
      data: [
        {
          id: `allowed-${offset}`,
          sender_token: "t",
          email: "loop@example.com",
          allowed_at: "",
          is_domain: false,
          created_at: "",
        },
      ],
    }));

    await build_account_data_files({ contacts: false, settings: true });

    expect(allowed_mock.mock.calls.length).toBeLessThanOrEqual(100);
  });
});
