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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TotpVerification } from "./totp_verification";
import { verify_totp_login } from "@/services/api/totp";

vi.mock("@/services/api/totp", () => ({
  verify_totp_login: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children as never}
    </button>
  ),
  Checkbox: (props: Record<string, unknown>) => (
    <input type="checkbox" {...(props as object)} />
  ),
}));

const mocked_verify = vi.mocked(verify_totp_login);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const native_value_setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

describe("TotpVerification", () => {
  let container: HTMLDivElement;
  let root: Root;

  const props = () => ({
    pending_login_token: "pending-token",
    on_success: vi.fn(),
    on_use_backup_code: vi.fn(),
    on_cancel: vi.fn(),
  });

  const code_input = () =>
    container.querySelector(
      'input[inputmode="numeric"]',
    ) as HTMLInputElement;

  const verify_button = () =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("common.continue"),
    ) as HTMLButtonElement;

  const type_code = async (value: string) => {
    const input = code_input();

    await act(async () => {
      native_value_setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const press_enter = async () => {
    await act(async () => {
      code_input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
  };

  const render = async (overrides = {}) => {
    const p = { ...props(), ...overrides };

    await act(async () => {
      root.render(<TotpVerification {...p} />);
    });

    return p;
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_verify.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders a single text input, not a numeric type", async () => {
    await render();
    const input = code_input();

    expect(input).toBeTruthy();
    expect(input.getAttribute("type")).toBe("text");
    expect(container.querySelectorAll('input[inputmode="numeric"]').length).toBe(
      1,
    );
  });

  it("strips non-digits and caps the code at 6 characters", async () => {
    await render();
    await type_code("12ab34cd5678");

    expect(code_input().value).toBe("123456");
  });

  it("keeps the verify button disabled until exactly 6 digits", async () => {
    await render();

    await type_code("12345");
    expect(verify_button().disabled).toBe(true);

    await type_code("123456");
    expect(verify_button().disabled).toBe(false);
  });

  it("does not auto-submit; verify is only called on explicit submit", async () => {
    mocked_verify.mockResolvedValue({ data: undefined, error: "nope" });
    await render();

    await type_code("123456");
    expect(mocked_verify).not.toHaveBeenCalled();

    await act(async () => {
      verify_button().click();
    });
    expect(mocked_verify).toHaveBeenCalledTimes(1);
    expect(mocked_verify).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456", pending_login_token: "pending-token" }),
    );
  });

  it("keeps the entered code and shows an error on failure (no auto-clear)", async () => {
    mocked_verify.mockResolvedValue({
      data: undefined,
      error: "Invalid verification code",
    });
    await render();

    await type_code("000123");
    await act(async () => {
      verify_button().click();
    });

    expect(code_input().value).toBe("000123");
    expect(container.textContent).toContain("Invalid verification code");
  });

  it("calls on_success when verification succeeds", async () => {
    mocked_verify.mockResolvedValue({
      data: {
        user_id: "u1",
        username: "fate",
        email: "fate@aster.cx",
        csrf_token: "c",
        encrypted_vault: "v",
        vault_nonce: "n",
      },
    });
    const p = await render();

    await type_code("654321");
    await act(async () => {
      verify_button().click();
    });

    expect(p.on_success).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter", async () => {
    mocked_verify.mockResolvedValue({ data: undefined, error: "x" });
    await render();

    await type_code("111111");
    await press_enter();

    expect(mocked_verify).toHaveBeenCalledTimes(1);
  });

  it("ignores a second submit while one is already in flight", async () => {
    mocked_verify.mockReturnValue(new Promise(() => {}));
    await render();

    await type_code("222222");

    await act(async () => {
      const input = code_input();
      const enter = () =>
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );

      enter();
      enter();
    });

    expect(mocked_verify).toHaveBeenCalledTimes(1);
  });
});
