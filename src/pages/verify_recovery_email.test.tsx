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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

const link_status_mock = vi.fn();
const auth_state = { is_authenticated: false, is_loading: false };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => auth_state,
}));

vi.mock("@/services/api/recovery_email", () => ({
  get_recovery_email_link_status: (...args: unknown[]) =>
    link_status_mock(...args),
}));

const { default: VerifyRecoveryEmailPage } =
  await import("./verify_recovery_email");

let container: HTMLDivElement;
let root: Root;

async function render_at(url: string) {
  window.history.replaceState(null, "", url);
  await act(async () => {
    root.render(
      <BrowserRouter>
        <VerifyRecoveryEmailPage />
      </BrowserRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("VerifyRecoveryEmailPage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    link_status_mock.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("ignores a forged verified flag in the query string", async () => {
    await render_at("/verify-recovery-email?verified=true");

    expect(link_status_mock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("auth.verification_failed");
    expect(container.textContent).not.toContain(
      "auth.verification_success_title",
    );
    expect(sessionStorage.getItem("recovery_email_verification_result")).toBe(
      "error",
    );
  });

  it("shows success only when the server confirms the token", async () => {
    link_status_mock.mockResolvedValue("verified");
    await render_at("/verify-recovery-email#good_token-123");

    expect(link_status_mock).toHaveBeenCalledWith("good_token-123");
    expect(container.textContent).toContain("auth.verification_success_title");
    expect(window.location.hash).toBe("");
  });

  it("shows failure when the server rejects a tampered token", async () => {
    link_status_mock.mockResolvedValue("not_verified");
    await render_at("/verify-recovery-email?verified=true#tampered_token");

    expect(link_status_mock).toHaveBeenCalledWith("tampered_token");
    expect(container.textContent).toContain("auth.verification_failed");
    expect(container.textContent).not.toContain(
      "auth.verification_success_title",
    );
  });

  it("offers a retry instead of a result when the server is unreachable", async () => {
    link_status_mock.mockResolvedValueOnce("unreachable");
    await render_at("/verify-recovery-email#good_token");

    expect(container.textContent).toContain("common.retry");
    expect(sessionStorage.getItem("recovery_email_verification_result")).toBe(
      null,
    );
  });
});
