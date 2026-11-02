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
const set_authenticated = vi.fn();
const set_csrf = vi.fn();
const set_dev_token = vi.fn();

vi.mock("./client", () => ({
  api_client: { post, set_authenticated, set_csrf, set_dev_token },
}));

vi.mock("./csrf", () => ({ clear_csrf_cache: vi.fn() }));

const { login_user } = await import("./auth");

const request = {
  user_hash: "hash",
  password_hash: "password",
  remember_me: false,
};

describe("login_user", () => {
  beforeEach(() => {
    post.mockReset();
    set_authenticated.mockReset();
    set_csrf.mockReset();
    set_dev_token.mockReset();
  });

  it("keeps the session signed out while a second factor is pending", async () => {
    post.mockResolvedValue({
      data: {
        totp_required: true,
        pending_login_token: "pending",
        available_methods: ["webauthn"],
      },
    });

    const response = await login_user(request as never);

    expect(response.data).toMatchObject({ totp_required: true });
    expect(set_authenticated).not.toHaveBeenCalled();
    expect(set_dev_token).not.toHaveBeenCalled();
  });

  it("marks the session signed in after a completed login", async () => {
    post.mockResolvedValue({
      data: {
        user_id: "user",
        username: "user",
        email: "user@astermail.org",
        csrf_token: "csrf",
        encrypted_vault: "vault",
        vault_nonce: "nonce",
      },
    });

    await login_user(request as never);

    expect(set_csrf).toHaveBeenCalledWith("csrf");
    expect(set_authenticated).toHaveBeenCalledWith(true);
  });

  it("leaves the session alone when the login fails", async () => {
    post.mockResolvedValue({ error: "invalid", status: 401 });

    await login_user(request as never);

    expect(set_authenticated).not.toHaveBeenCalled();
  });
});
