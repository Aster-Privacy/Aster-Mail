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
import type { GuardStepUp } from "@/components/guard/use_guard_step_up";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { id: "u1" } }),
}));
vi.mock("@/native/invoke_bridge", () => ({ is_desktop: () => false }));
vi.mock("@/services/api/passkeys", () => ({
  is_passkey_supported: () => false,
}));
vi.mock("@/utils/open_link", () => ({ open_external: vi.fn() }));
vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  perform_step_up_webauthn_assertion: vi.fn(),
}));
vi.mock("@/services/guard/sign_action", () => ({
  build_step_up_proof: vi.fn(() => ({ kind: "password" })),
  passkey_step_up_proof: vi.fn(),
}));
vi.mock("@/services/api/step_up", () => ({
  fetch_step_up_requirements: vi.fn(() => new Promise(() => {})),
  derive_step_up_credentials: vi.fn(async () => ({})),
}));

import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import {
  forget_totp_required,
  remember_totp_required,
} from "@/services/api/step_up_cache";

let root: Root;
let host: HTMLDivElement;
let step_up: GuardStepUp;

function Harness() {
  step_up = use_guard_step_up();

  return <>{step_up.step_up_modal}</>;
}

function field(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function type_into(id: string, value: string) {
  const input = field(id);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function confirm() {
  const button = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === "guard.step_up_confirm",
  );

  await act(async () => {
    button?.click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function error_text(): string | null {
  return (
    document.querySelector('[data-testid="step_up_error"]')?.textContent ?? null
  );
}

beforeEach(() => {
  forget_totp_required();
  remember_totp_required(true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("use_guard_step_up run", () => {
  it("keeps the dialog open with the fields filled when the code is wrong", async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({
        server_code: "INVALID_TWO_FACTOR_CODE",
        status: 400,
        details: { failed_factor: "totp", attempts_remaining: 3 },
      })
      .mockResolvedValueOnce({ data: { ok: true } });
    let settled: unknown = "pending";

    act(() => {
      void step_up.run(attempt).then((value) => {
        settled = value;
      });
    });
    type_into("step-up-password", "current password");
    type_into("step-up-code", "123456");
    await confirm();

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(settled).toBe("pending");
    expect(error_text()).toBe(
      "guard.step_up_code_wrong guard.step_up_attempts_left:3",
    );
    expect(field("step-up-password").value).toBe("current password");
    expect(field("step-up-code").value).toBe("123456");

    type_into("step-up-code", "654321");
    await confirm();

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(settled).toEqual({ data: { ok: true } });
    expect(field("step-up-password")).toBeNull();
  });

  it("explains a wrong password during a held password change", async () => {
    const attempt = vi.fn().mockResolvedValue({
      server_code: "INVALID_CREDENTIALS",
      status: 401,
      details: { failed_factor: "password", password_change_held: true },
    });

    act(() => {
      void step_up.run(attempt, { description: "held description" });
    });
    expect(document.body.textContent).toContain("held description");
    type_into("step-up-password", "new password");
    type_into("step-up-code", "123456");
    await confirm();

    expect(error_text()).toBe("guard.step_up_password_wrong_held");
    expect(field("step-up-password").value).toBe("new password");
  });

  it("returns other failures to the caller and closes", async () => {
    const failure = { server_code: "GUARD_REQUEST_GONE", status: 410 };
    let settled: unknown = "pending";

    act(() => {
      void step_up
        .run(async () => failure)
        .then((value) => {
          settled = value;
        });
    });
    type_into("step-up-password", "pw");
    type_into("step-up-code", "123456");
    await confirm();

    expect(settled).toBe(failure);
    expect(field("step-up-password")).toBeNull();
  });

  it("resolves null when the dialog is dismissed", async () => {
    let settled: unknown = "pending";

    act(() => {
      void step_up.run(vi.fn()).then((value) => {
        settled = value;
      });
    });
    const cancel = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "common.cancel",
    );

    await act(async () => {
      cancel?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(settled).toBeNull();
  });
});
