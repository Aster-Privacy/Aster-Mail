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

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");
const {
  store_vault_in_memory,
  clear_vault_from_memory,
  has_vault_in_memory_for,
} = await import("@/services/crypto/memory_key_store");
const { subtle_crypto_mock } = await import("@/tests/setup");

const PARENT = "parent-account-id";
const CHILD = "child-account-id";

function json_response(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

function me(user_id: string): Response {
  return json_response({
    user_id,
    username: "account",
    email: "account@aster.cx",
    display_name: null,
    profile_color: null,
    profile_picture: null,
  });
}

function build_vault(identity: string) {
  return {
    identity_key: identity,
    previous_keys: [],
    signed_prekey: "signed_prekey_public",
    signed_prekey_private: "signed_prekey_private",
    recovery_codes: ["one", "two"],
  };
}

describe("crossed account session incident", () => {
  let mismatches: number;
  const capture = () => {
    mismatches += 1;
  };

  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
    subtle_crypto_mock.importKey.mockResolvedValue({} as CryptoKey);
    subtle_crypto_mock.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    subtle_crypto_mock.digest.mockResolvedValue(new Uint8Array(32).buffer);
    mismatches = 0;
    window.addEventListener("astermail:identity-mismatch", capture);
    clear_vault_from_memory();
    api_client.set_authenticated(false);
    api_client.set_expected_user_id(null);
  });

  afterEach(() => {
    window.removeEventListener("astermail:identity-mismatch", capture);
    clear_vault_from_memory();
    api_client.set_authenticated(false);
    api_client.set_expected_user_id(null);
  });

  it("refuses to render the parent while the cookie belongs to the child", async () => {
    await store_vault_in_memory(build_vault("parent"), "parent_pass", PARENT);
    api_client.set_expected_user_id(PARENT);
    api_client.set_authenticated(true);

    vi.mocked(routed_fetch).mockResolvedValue(me(CHILD));

    const valid = await api_client.check_auth_status();

    expect(valid).toBe(false);
    expect(api_client.is_authenticated()).toBe(false);
    expect(mismatches).toBe(1);
  });

  it("never exposes the parent keys to the child session", async () => {
    await store_vault_in_memory(build_vault("parent"), "parent_pass", PARENT);

    expect(has_vault_in_memory_for(PARENT)).toBe(true);
    expect(has_vault_in_memory_for(CHILD)).toBe(false);
  });

  it("drops the crossed identity from the cached profile", async () => {
    api_client.set_expected_user_id(PARENT);
    vi.mocked(routed_fetch).mockResolvedValue(me(PARENT));
    await api_client.check_auth_status();

    expect(api_client.get_cached_user_info()?.user_id).toBe(PARENT);

    vi.mocked(routed_fetch).mockResolvedValue(me(CHILD));
    await api_client.check_auth_status();

    expect(api_client.get_cached_user_info()).toBeNull();
  });

  it("releases the binding when a fresh sign in is attempted", async () => {
    api_client.set_expected_user_id(PARENT);
    vi.mocked(routed_fetch).mockResolvedValue(json_response({ salt: "abc" }));

    await api_client.post("/core/v1/auth/login", {});

    expect(api_client.get_expected_user_id()).toBeNull();
  });

  it("keeps the binding across ordinary requests", async () => {
    api_client.set_expected_user_id(PARENT);
    vi.mocked(routed_fetch).mockResolvedValue(json_response({ items: [] }));

    await api_client.get("/mail/v1/messages?case=binding", {
      skip_cache: true,
    });

    expect(api_client.get_expected_user_id()).toBe(PARENT);
  });
});
