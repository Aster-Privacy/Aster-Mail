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
import * as openpgp from "openpgp";

import {
  ensure_pgp_key_published,
  reset_pgp_publish_attempt,
} from "./ensure_pgp_key_published";
import { api_client } from "@/services/api/client";
import { republish_pgp_key } from "@/services/api/key_rotation";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
} from "@/services/crypto/memory_key_store";

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
  },
}));

vi.mock("@/services/api/key_rotation", () => ({
  republish_pgp_key: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(),
  get_passphrase_from_memory: vi.fn(),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { id: "test-account-id" },
  })),
}));

const PASSPHRASE = "correct horse battery staple";

async function generate_armored_private_key(): Promise<string> {
  const { privateKey } = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "maple1", email: "maple1@aster.cx" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return privateKey;
}

describe("ensure_pgp_key_published", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset_pgp_publish_attempt();
    vi.mocked(get_passphrase_from_memory).mockReturnValue(PASSPHRASE);
  });

  it("republishes the vault PGP key when the server has none", async () => {
    const armored = await generate_armored_private_key();

    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: armored,
    } as never);
    vi.mocked(api_client.get).mockResolvedValue({
      error: "PGP key not found",
      code: "NOT_FOUND",
    });
    vi.mocked(republish_pgp_key).mockResolvedValue({
      data: { fingerprint: "ABC", success: true },
    });

    const result = await ensure_pgp_key_published();

    expect(result).toBe("healed");
    expect(republish_pgp_key).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(republish_pgp_key).mock.calls[0][0] as Record<
      string,
      string
    >;

    expect(payload.public_key_armored).toContain(
      "-----BEGIN PGP PUBLIC KEY BLOCK-----",
    );
    expect(payload.encrypted_private_key.length).toBeGreaterThan(0);
    expect(payload.private_key_nonce.length).toBeGreaterThan(0);
  });

  it("does nothing when the server already has a key", async () => {
    const armored = await generate_armored_private_key();

    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: armored,
    } as never);
    vi.mocked(api_client.get).mockResolvedValue({
      data: { fingerprint: "ABC" },
    });

    const result = await ensure_pgp_key_published();

    expect(result).toBe("already_published");
    expect(republish_pgp_key).not.toHaveBeenCalled();
  });

  it("does not treat a server error as a missing key", async () => {
    const armored = await generate_armored_private_key();

    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: armored,
    } as never);
    vi.mocked(api_client.get).mockResolvedValue({
      error: "Internal server error",
      code: "SERVER_ERROR",
    });

    const result = await ensure_pgp_key_published();

    expect(result).toBe("skipped");
    expect(republish_pgp_key).not.toHaveBeenCalled();
  });

  it("skips vaults whose identity key is not an armored PGP key", async () => {
    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: "bm90LWEtcGdwLWtleQ==",
    } as never);

    const result = await ensure_pgp_key_published();

    expect(result).toBe("no_local_key");
    expect(api_client.get).not.toHaveBeenCalled();
    expect(republish_pgp_key).not.toHaveBeenCalled();
  });

  it("only attempts the heal once per session", async () => {
    const armored = await generate_armored_private_key();

    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: armored,
    } as never);
    vi.mocked(api_client.get).mockResolvedValue({
      error: "PGP key not found",
      code: "NOT_FOUND",
    });
    vi.mocked(republish_pgp_key).mockResolvedValue({
      data: { fingerprint: "ABC", success: true },
    });

    await ensure_pgp_key_published();

    const second = await ensure_pgp_key_published();

    expect(second).toBe("skipped");
    expect(republish_pgp_key).toHaveBeenCalledTimes(1);
  });

  it("retries when forced after a prior attempt", async () => {
    const armored = await generate_armored_private_key();

    vi.mocked(get_vault_from_memory).mockReturnValue({
      identity_key: armored,
    } as never);
    vi.mocked(api_client.get).mockResolvedValue({
      error: "PGP key not found",
      code: "NOT_FOUND",
    });
    vi.mocked(republish_pgp_key).mockResolvedValue({
      data: { fingerprint: "ABC", success: true },
    });

    await ensure_pgp_key_published();

    const forced = await ensure_pgp_key_published({ force: true });

    expect(forced).toBe("healed");
    expect(republish_pgp_key).toHaveBeenCalledTimes(2);
  });
});
