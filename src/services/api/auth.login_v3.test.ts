//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
const set_authenticated = vi.fn();
const set_csrf = vi.fn();
const set_dev_token = vi.fn();
const sign_in_v3 = vi.fn();

vi.mock("./client", () => ({
  api_client: { post, set_authenticated, set_csrf, set_dev_token },
}));

vi.mock("./csrf", () => ({ clear_csrf_cache: vi.fn() }));

vi.mock("@/services/crypto/login_v3", async (original) => ({
  ...(await original<typeof import("@/services/crypto/login_v3")>()),
  sign_in_v3,
}));

const { login_user } = await import("./auth");
const { set_pending_login_v3, clear_pending_login_v3 } = await import(
  "@/services/crypto/login_v3"
);

const request = {
  user_hash: "hash",
  password_hash: "password",
  remember_me: false,
  captcha_token: "captcha",
};

const session = {
  user_id: "user",
  username: "user",
  email: "user@astermail.org",
  csrf_token: "csrf",
  encrypted_vault: "vault",
  vault_nonce: "nonce",
};

describe("login_user with the newer sign-in", () => {
  beforeEach(() => {
    post.mockReset();
    sign_in_v3.mockReset();
    set_authenticated.mockReset();
    set_csrf.mockReset();
    set_dev_token.mockReset();
    clear_pending_login_v3();
  });

  it("uses the current sign-in when nothing is pending", async () => {
    post.mockResolvedValue({ data: session });

    await login_user(request as never);

    expect(sign_in_v3).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith("/core/v1/auth/login", request);
  });

  it("uses the newer sign-in when the account is enrolled", async () => {
    set_pending_login_v3("hash", "proof");
    sign_in_v3.mockResolvedValue({ data: session });

    const response = await login_user(request as never);

    expect(sign_in_v3).toHaveBeenCalledWith(request, "proof");
    expect(post).not.toHaveBeenCalled();
    expect(response.data).toMatchObject({ user_id: "user" });
    expect(set_csrf).toHaveBeenCalledWith("csrf");
    expect(set_authenticated).toHaveBeenCalledWith(true);
  });

  it("falls back to the current sign-in with the same request", async () => {
    set_pending_login_v3("hash", "proof");
    sign_in_v3.mockResolvedValue(null);
    post.mockResolvedValue({ data: session });

    const response = await login_user(request as never);

    expect(post).toHaveBeenCalledWith("/core/v1/auth/login", request);
    expect(response.data).toMatchObject({ user_id: "user" });
    expect(set_authenticated).toHaveBeenCalledWith(true);
  });

  it("returns a rejection without retrying on the current sign-in", async () => {
    set_pending_login_v3("hash", "proof");
    sign_in_v3.mockResolvedValue({
      error: "Invalid credentials",
      status: 401,
      server_code: "INVALID_CREDENTIALS",
    });

    const response = await login_user(request as never);

    expect(post).not.toHaveBeenCalled();
    expect(response.server_code).toBe("INVALID_CREDENTIALS");
    expect(set_authenticated).not.toHaveBeenCalled();
  });

  it("keeps the session signed out while a second factor is pending", async () => {
    set_pending_login_v3("hash", "proof");
    sign_in_v3.mockResolvedValue({
      data: { totp_required: true, pending_login_token: "pending" },
    });

    await login_user(request as never);

    expect(set_authenticated).not.toHaveBeenCalled();
  });

  it("does not reuse a pending sign-in for another account", async () => {
    set_pending_login_v3("other", "proof");
    post.mockResolvedValue({ data: session });

    await login_user(request as never);
    await login_user({ ...request, user_hash: "other" } as never);

    expect(sign_in_v3).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(2);
  });
});
