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

import { BackupCodeInput } from "./backup_code_input";
import { verify_backup_code_login } from "@/services/api/totp";

vi.mock("@/services/api/totp", () => ({
  verify_backup_code_login: vi.fn(),
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
}));

const mocked_verify = vi.mocked(verify_backup_code_login);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const native_value_setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

describe("BackupCodeInput", () => {
  let container: HTMLDivElement;
  let root: Root;

  const props = () => ({
    pending_login_token: "pending-token",
    on_success: vi.fn(),
    on_use_authenticator: vi.fn(),
    on_cancel: vi.fn(),
  });

  const text_input = () =>
    container.querySelector("input") as HTMLInputElement;

  const submit_button = () =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("common.continue"),
    ) as HTMLButtonElement;

  const type_code = async (value: string) => {
    const input = text_input();

    await act(async () => {
      native_value_setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const render = async (overrides = {}) => {
    const p = { ...props(), ...overrides };

    await act(async () => {
      root.render(<BackupCodeInput {...p} />);
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

  it("keeps submit disabled until 12 alphanumeric characters are present", async () => {
    await render();

    await type_code("ABCD-EFGH");
    expect(submit_button().disabled).toBe(true);

    await type_code("ABCD-EFGH-JKMN");
    expect(submit_button().disabled).toBe(false);
  });

  it("normalizes and dash-formats the code before sending", async () => {
    mocked_verify.mockResolvedValue({ data: undefined, error: "x" });
    await render();

    await type_code("abcdefghjkmn");
    await act(async () => {
      submit_button().click();
    });

    expect(mocked_verify).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ABCD-EFGH-JKMN" }),
    );
  });

  it("calls on_success when the code is accepted", async () => {
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

    await type_code("ABCD-EFGH-JKMN");
    await act(async () => {
      submit_button().click();
    });

    expect(p.on_success).toHaveBeenCalledTimes(1);
  });

  it("keeps the code and shows the error on failure", async () => {
    mocked_verify.mockResolvedValue({ data: undefined, error: "Invalid backup code" });
    await render();

    await type_code("ABCD-EFGH-JKMN");
    await act(async () => {
      submit_button().click();
    });

    expect(text_input().value).toBe("ABCD-EFGH-JKMN");
    expect(container.textContent).toContain("Invalid backup code");
  });

  it("ignores a second submit while one is already in flight", async () => {
    mocked_verify.mockReturnValue(new Promise(() => {}));
    await render();

    await type_code("ABCD-EFGH-JKMN");

    await act(async () => {
      const input = text_input();
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
