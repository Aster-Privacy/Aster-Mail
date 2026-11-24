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
import { act, forwardRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RegenerateBackupCodesModal } from "./regenerate_backup_codes_modal";

import { regenerate_backup_codes } from "@/services/api/totp";
import { derive_step_up_credentials } from "@/services/api/step_up";

vi.mock("@/services/api/totp", () => ({
  regenerate_backup_codes: vi.fn(),
  classify_totp_error: vi.fn(() => "other"),
}));

vi.mock("@/services/api/step_up", () => ({
  derive_step_up_credentials: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ is_open, children }: { is_open: boolean; children?: unknown }) =>
    is_open ? <div>{children as never}</div> : null,
  ModalHeader: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalTitle: ({ children }: { children?: unknown }) => (
    <h2>{children as never}</h2>
  ),
  ModalDescription: ({ children }: { children?: unknown }) => (
    <p>{children as never}</p>
  ),
  ModalBody: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
  ModalFooter: ({ children }: { children?: unknown }) => (
    <div>{children as never}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
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

vi.mock("@/components/ui/input", () => ({
  Input: forwardRef<
    HTMLInputElement,
    {
      id?: string;
      value?: string;
      onChange?: (event: { target: { value: string } }) => void;
    }
  >(function mock_input({ id, value, onChange }, ref) {
    return (
      <input
        ref={ref}
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange?.(event)}
      />
    );
  }),
}));

const mocked_regenerate = vi.mocked(regenerate_backup_codes);
const mocked_derive = vi.mocked(derive_step_up_credentials);

let container: HTMLDivElement;
let root: Root;

function set_input(selector: string, value: string) {
  const input = container.querySelector(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit_button(): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "settings.regenerate_backup_codes",
  );

  if (!match) throw new Error("submit button not found");

  return match;
}

describe("RegenerateBackupCodesModal", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocked_regenerate.mockReset().mockResolvedValue({
      data: { backup_codes: ["aaaa-bbbb"] },
    } as never);
    mocked_derive
      .mockReset()
      .mockResolvedValue({ password_hash: "PWHASH" } as never);
    act(() => {
      root.render(
        <RegenerateBackupCodesModal
          is_open
          on_close={vi.fn()}
          on_success={vi.fn()}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for the account password next to the authenticator code", () => {
    expect(container.querySelector("#regen-password")).not.toBeNull();
    expect(container.querySelector("#regen-totp-code")).not.toBeNull();
  });

  it("keeps the request disabled until the password is entered", () => {
    set_input("#regen-totp-code", "123456");

    expect(submit_button().disabled).toBe(true);
  });

  it("sends the password proof with the code", async () => {
    set_input("#regen-password", "correct horse");
    set_input("#regen-totp-code", "123456");

    await act(async () => {
      submit_button().click();
    });

    expect(mocked_derive).toHaveBeenCalledWith("correct horse");
    expect(mocked_regenerate).toHaveBeenCalledWith({
      code: "123456",
      password_hash: "PWHASH",
    });
  });
});
