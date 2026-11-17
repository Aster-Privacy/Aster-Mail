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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterStepInstallLimit } from "./register_step_install_limit";
import {
  install_limit_upgrade_path,
  is_install_limit_response,
  read_upgrade_plan,
} from "./hooks/use_registration";

import { en } from "@/lib/i18n/translations/en";

let container: HTMLDivElement;
let root: Root;

function build_reg(overrides: Partial<UseRegistrationReturn> = {}) {
  return {
    t: (key: string) => key,
    handle_install_limit_sign_in: vi.fn(),
    handle_install_limit_upgrade: vi.fn(),
    ...overrides,
  } as unknown as UseRegistrationReturn;
}

function find_button(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (el) => el.textContent === label,
  );

  if (!button) throw new Error(`missing button ${label}`);

  return button;
}

beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("install limit screen", () => {
  it("shows the title, the explanation, and both actions", () => {
    const reg = build_reg();

    act(() => {
      root.render(<RegisterStepInstallLimit reg={reg} />);
    });

    expect(container.textContent).toContain("auth.install_limit_title");
    expect(container.textContent).toContain("auth.install_limit_body");

    act(() => find_button("auth.install_limit_sign_in").click());
    expect(reg.handle_install_limit_sign_in).toHaveBeenCalledTimes(1);

    act(() => find_button("auth.install_limit_upgrade").click());
    expect(reg.handle_install_limit_upgrade).toHaveBeenCalledTimes(1);
  });

  it("has english copy for every string it uses", () => {
    expect(en.auth.install_limit_title).toBeTruthy();
    expect(en.auth.install_limit_body).toBeTruthy();
    expect(en.auth.install_limit_sign_in).toBeTruthy();
    expect(en.auth.install_limit_upgrade).toBeTruthy();
    expect(en.auth.verifying_your_device).toBeTruthy();
  });
});

describe("install limit response mapping", () => {
  it("recognizes the limit by client or server code", () => {
    expect(
      is_install_limit_response({ server_code: "INSTALL_ACCOUNT_LIMIT" }),
    ).toBe(true);
    expect(is_install_limit_response({ code: "INSTALL_ACCOUNT_LIMIT" })).toBe(
      true,
    );
    expect(is_install_limit_response({ code: "ABUSE_ACCOUNT_LIMIT" })).toBe(
      false,
    );
    expect(is_install_limit_response({ code: "FORBIDDEN" })).toBe(false);
  });

  it("reads only a plain plan name from the details", () => {
    expect(read_upgrade_plan({ upgrade_plan: "nova" })).toBe("nova");
    expect(read_upgrade_plan({ upgrade_plan: "../billing" })).toBeNull();
    expect(read_upgrade_plan({ upgrade_plan: 3 })).toBeNull();
    expect(read_upgrade_plan(undefined)).toBeNull();
  });

  it("sends upgrade through sign-in to billing", () => {
    expect(install_limit_upgrade_path("nova")).toBe(
      `/sign-in?next=${encodeURIComponent("/settings/billing?plan=nova")}`,
    );
    expect(install_limit_upgrade_path(null)).toBe(
      `/sign-in?next=${encodeURIComponent("/settings/billing")}`,
    );
  });
});
