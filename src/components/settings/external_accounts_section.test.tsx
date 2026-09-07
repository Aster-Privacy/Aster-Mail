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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const navigate_spy = vi.fn();
const open_add_form_spy = vi.fn();

let location_state: unknown = null;
let hook_state: Record<string, unknown> = {};
let plan_limits: unknown = null;

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate_spy,
  useLocation: () => ({
    pathname: "/settings/sender_filters",
    state: location_state,
  }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Checkbox: () => <input type="checkbox" />,
}));

vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <div /> }));
vi.mock("@/components/settings/settings_skeleton", () => ({
  SettingsSkeleton: () => <div>skeleton</div>,
}));
vi.mock("@/components/ui/alert_dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/settings/external_accounts/account_list", () => ({
  AccountList: () => <div>account_list</div>,
}));
vi.mock("@/components/settings/load_failed_notice", () => ({
  LoadFailedNotice: () => <div>load_failed</div>,
}));
vi.mock("@/components/settings/external_accounts/add_account_form", () => ({
  AddAccountForm: () => <div>add_account_form</div>,
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: plan_limits }),
}));
vi.mock("@/components/settings/hooks/use_external_accounts", () => ({
  use_external_accounts: () => hook_state,
}));

const { ExternalAccountsSection } = await import("./external_accounts_section");

let container: HTMLDivElement;
let root: Root;

function base_state(overrides: Record<string, unknown> = {}) {
  return {
    t: (key: string) => key,
    accounts: [],
    is_loading: false,
    show_add_form: false,
    editing_account: null,
    open_add_form: open_add_form_spy,
    ...overrides,
  };
}

async function render_section() {
  await act(async () => {
    root.render(<ExternalAccountsSection />);
  });
}

describe("ExternalAccountsSection", () => {
  beforeEach(() => {
    navigate_spy.mockClear();
    open_add_form_spy.mockClear();
    location_state = null;
    plan_limits = { limits: { max_multi_accounts: { limit: 5 } } };
    hook_state = base_state();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the add form when the sync tutorial sends the user here", async () => {
    location_state = { open_external_account_form: true };

    await render_section();

    expect(open_add_form_spy).toHaveBeenCalledTimes(1);
    expect(navigate_spy).toHaveBeenCalledWith("/settings/sender_filters", {
      replace: true,
      state: null,
    });
  });

  it("leaves the add form closed on a normal visit", async () => {
    await render_section();

    expect(open_add_form_spy).not.toHaveBeenCalled();
    expect(navigate_spy).not.toHaveBeenCalled();
  });

  it("waits for accounts and plan limits before opening the form", async () => {
    location_state = { open_external_account_form: true };
    hook_state = base_state({ is_loading: true });
    plan_limits = null;

    await render_section();

    expect(open_add_form_spy).not.toHaveBeenCalled();
  });

  it("does not open the form when the account limit is reached", async () => {
    location_state = { open_external_account_form: true };
    plan_limits = { limits: { max_multi_accounts: { limit: 1 } } };
    hook_state = base_state({ accounts: [{ id: "a" }] });

    await render_section();

    expect(open_add_form_spy).not.toHaveBeenCalled();
  });
});
