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

const post = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
  },
}));

const { complete_recovery, reset_password_with_token } = await import(
  "./recovery"
);

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { success: true } });
});

function body(): Record<string, unknown> {
  return post.mock.calls[0][1] as Record<string, unknown>;
}

describe("recovery writes send the vault work factor", () => {
  it("includes the factor when completing recovery", async () => {
    await complete_recovery(
      "token",
      "hash",
      "salt",
      "vault",
      "nonce",
      [],
      "backup",
      "backup-nonce",
      "key-salt",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      600000,
    );

    expect(body().vault_kdf_iterations).toBe(600000);
  });

  it("includes the factor when resetting with a token", async () => {
    await reset_password_with_token(
      "token",
      "hash",
      "salt",
      "vault",
      "nonce",
      [],
      "backup",
      "backup-nonce",
      "key-salt",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      600000,
    );

    expect(body().vault_kdf_iterations).toBe(600000);
  });

  it("leaves the factor out when the caller names none", async () => {
    await complete_recovery(
      "token",
      "hash",
      "salt",
      "vault",
      "nonce",
      [],
      "backup",
      "backup-nonce",
      "key-salt",
    );

    expect(body().vault_kdf_iterations).toBeUndefined();
  });
});
