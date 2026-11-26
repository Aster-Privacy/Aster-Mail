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
import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  build_signed_mime_payload,
  is_tagged_primary_sender,
} from "./send_queue_signed_mime";

const PASSPHRASE = "tagged-primary-test";

const state = vi.hoisted(() => ({
  identity_key: undefined as string | undefined,
  alias_pgp_enabled: true as boolean | undefined,
  settings_error: false,
  settings_calls: 0,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: async () => ({
    user: { email: "owner@astermail.org" },
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async () => {
      state.settings_calls += 1;

      if (state.settings_error) return { data: undefined, error: "offline" };

      return { data: { alias_pgp_enabled: state.alias_pgp_enabled } };
    },
  },
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: state.identity_key }),
  get_passphrase_from_memory: () => PASSPHRASE,
}));

vi.mock("./crypto/external_pgp_key", () => ({
  resolve_external_signing_key: async () => null,
}));

vi.mock("./crypto/published_signing_key", () => ({
  select_published_signing_key: async () => state.identity_key ?? null,
}));

function send(from: string) {
  return build_signed_mime_payload({
    subject: "Hello",
    body: "<p>Hello</p>",
    from,
    to: ["friend@example.org"],
    cc: [],
  });
}

beforeAll(async () => {
  const internal = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  state.identity_key = internal.privateKey;
}, 60_000);

beforeEach(() => {
  state.alias_pgp_enabled = true;
  state.settings_error = false;
  state.settings_calls = 0;
});

describe("plus addresses of the primary address", () => {
  it("treats a plus address as tagged and the primary address as untagged", () => {
    expect(
      is_tagged_primary_sender(
        "owner+news@astermail.org",
        "owner@astermail.org",
      ),
    ).toBe(true);
    expect(
      is_tagged_primary_sender(
        "Owner <owner@astermail.org>",
        "owner@astermail.org",
      ),
    ).toBe(false);
    expect(
      is_tagged_primary_sender("other@astermail.org", "owner@astermail.org"),
    ).toBe(false);
  });

  it("signs a plus address when PGP with aliases is on", async () => {
    expect(await send("owner+news@astermail.org")).toBeDefined();
  });

  it("leaves a plus address unsigned when PGP with aliases is off", async () => {
    state.alias_pgp_enabled = false;

    expect(await send("owner+news@astermail.org")).toBeUndefined();
  });

  it("leaves a plus address unsigned when the setting cannot be read", async () => {
    state.settings_error = true;

    expect(await send("owner+news@astermail.org")).toBeUndefined();
  });

  it("signs the primary address without reading the setting", async () => {
    state.alias_pgp_enabled = false;

    expect(await send("owner@astermail.org")).toBeDefined();
    expect(state.settings_calls).toBe(0);
  });
});
