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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (k: string) => k }),
}));

vi.mock("@/components/mobile/mobile_bottom_sheet", () => ({
  MobileBottomSheet: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div data-testid="sheet">{children}</div> : null),
}));

let verify_captcha: ((token: string) => void) | null = null;

vi.mock("@/components/auth/turnstile_widget", () => ({
  TurnstileWidget: forwardRef<
    HTMLDivElement,
    { on_verify: (token: string) => void }
  >(({ on_verify }, ref) => {
    verify_captcha = on_verify;

    return <div ref={ref} data-testid="turnstile" />;
  }),
  TURNSTILE_SITE_KEY: "test-site-key",
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button data-testid="create-btn" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/email_tag", () => ({
  TAG_COLOR_PRESETS: [],
  tag_icon_map: {},
  TAG_ICONS: [],
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/components/folders/folder_password_modal", () => ({
  FolderPasswordModal: () => null,
}));

import { CreateAliasSheet } from "@/components/mobile/mobile_drawer_sheets";

function create_ref() {
  return { current: { reset: vi.fn() } };
}

function base_props() {
  return {
    is_open: true,
    on_close: vi.fn(),
    alias_local: "silverscale",
    set_alias_local: vi.fn(),
    alias_error: "",
    set_alias_error: vi.fn(),
    creating: false,
    handle_create: vi.fn(),
    domain: "astermail.org",
    at_limit: false,
    captcha_token: null as string | null,
    set_captcha_token: vi.fn(),
    turnstile_ref: create_ref(),
    turnstile_required: true,
  };
}

describe("CreateAliasSheet captcha gating", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    verify_captcha = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the turnstile widget when required", () => {
    act(() => root.render(<CreateAliasSheet {...base_props()} />));

    expect(container.querySelector('[data-testid="turnstile"]')).not.toBeNull();
  });

  it("disables Create until a captcha token is present", () => {
    act(() => root.render(<CreateAliasSheet {...base_props()} />));

    const btn = container.querySelector(
      '[data-testid="create-btn"]',
    ) as HTMLButtonElement;

    expect(btn.disabled).toBe(true);

    act(() =>
      root.render(
        <CreateAliasSheet {...base_props()} captcha_token="solved-token" />,
      ),
    );

    const btn_after = container.querySelector(
      '[data-testid="create-btn"]',
    ) as HTMLButtonElement;

    expect(btn_after.disabled).toBe(false);
  });

  it("does not invoke handle_create while the captcha is unsolved", () => {
    const props = base_props();

    act(() => root.render(<CreateAliasSheet {...props} />));

    const btn = container.querySelector(
      '[data-testid="create-btn"]',
    ) as HTMLButtonElement;

    act(() => btn.click());

    expect(props.handle_create).not.toHaveBeenCalled();
  });

  it("solving the captcha reports the token upward", () => {
    const props = base_props();

    act(() => root.render(<CreateAliasSheet {...props} />));

    expect(verify_captcha).not.toBeNull();

    act(() => verify_captcha?.("solved-token"));

    expect(props.set_captcha_token).toHaveBeenCalledWith("solved-token");
  });

  it("keeps Create enabled when turnstile is not required", () => {
    act(() =>
      root.render(
        <CreateAliasSheet
          {...base_props()}
          captcha_token={null}
          turnstile_required={false}
        />,
      ),
    );

    const btn = container.querySelector(
      '[data-testid="create-btn"]',
    ) as HTMLButtonElement;

    expect(btn.disabled).toBe(false);
    expect(container.querySelector('[data-testid="turnstile"]')).toBeNull();
  });
});
