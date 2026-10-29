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

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: () => null,
  TURNSTILE_SITE_KEY: "",
}));
vi.mock("@/components/ui/sparkle_overlay", () => ({
  SparkleOverlay: () => null,
}));
vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

import { RegisterStepRecoveryCodes } from "./register_step_recovery";

let container: HTMLDivElement;
let root: Root;

function build_reg(overrides: Partial<UseRegistrationReturn>) {
  return {
    t: (key: string) => key,
    is_invited: false,
    generated_email: "",
    recovery_codes: ["ASTER-AAAA-BBBB-CCCC-DDDD"],
    is_key_visible: false,
    is_downloading_key: false,
    is_pdf_downloaded: false,
    is_text_downloaded: false,
    has_copied_key: false,
    show_skip_confirmation: false,
    set_is_key_visible: vi.fn(),
    set_show_skip_confirmation: vi.fn(),
    handle_copy_codes: vi.fn(),
    handle_copy_single_code: vi.fn(),
    handle_download_key: vi.fn(),
    handle_download_txt: vi.fn(),
    handle_advance_from_recovery_key: vi.fn(),
    ...overrides,
  } as unknown as UseRegistrationReturn;
}

function render_step(reg: UseRegistrationReturn) {
  act(() => {
    root.render(<RegisterStepRecoveryCodes reg={reg} />);
  });
}

function find_button(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (el) => el.textContent === label,
  );

  if (!button) throw new Error(`missing button ${label}`);

  return button as HTMLButtonElement;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("recovery codes step", () => {
  it("continues without a warning after the codes are copied", () => {
    const reg = build_reg({ has_copied_key: true });

    render_step(reg);
    act(() => find_button("common.continue").click());

    expect(reg.handle_advance_from_recovery_key).toHaveBeenCalledTimes(1);
    expect(reg.set_show_skip_confirmation).not.toHaveBeenCalled();
  });

  it("asks for confirmation when the codes were not saved", () => {
    const reg = build_reg({});

    render_step(reg);
    act(() => find_button("auth.continue_without_download").click());

    expect(reg.set_show_skip_confirmation).toHaveBeenCalledWith(true);
    expect(reg.handle_advance_from_recovery_key).not.toHaveBeenCalled();
  });
});
