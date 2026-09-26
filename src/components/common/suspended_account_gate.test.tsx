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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const get_mock = vi.fn();
const logout_mock = vi.fn();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({
    is_authenticated: true,
    logout: logout_mock,
    user: { id: "u1", email: "sam@astermail.org", username: "sam" },
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { profile_color: "blue" } }),
}));

vi.mock("@/lib/primary_identity", () => ({
  use_primary_identity: (email: string) => ({ email }),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/components/layout/workspace_switcher", () => ({
  WorkspaceSwitcher: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="switcher">{trigger}</div>
  ),
}));

vi.mock("@/components/settings/export_modal", () => ({
  ExportModal: ({ is_open }: { is_open: boolean }) =>
    is_open ? <div data-testid="export_modal" /> : null,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get_mock(...args),
  },
}));

const { SuspendedAccountGate, ACCOUNT_SUSPENDED_EVENT, build_appeal_url } =
  await import("./suspended_account_gate");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<SuspendedAccountGate />);
  });

  return container;
}

function button_with(text: string): HTMLButtonElement {
  const match = Array.from(container?.querySelectorAll("button") ?? []).find(
    (element) => element.textContent === text,
  );

  expect(match).toBeTruthy();

  return match as HTMLButtonElement;
}

beforeEach(() => {
  get_mock.mockReset();
  logout_mock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("suspended account gate", () => {
  it("stays hidden for an account in good standing", async () => {
    get_mock.mockResolvedValue({ data: { status: "active" } });

    const element = await render();

    expect(element.textContent).toBe("");
  });

  it("shows both dates when the status endpoint reports a suspension", async () => {
    get_mock.mockResolvedValue({
      data: {
        status: "suspended",
        suspended_at: "2026-09-20T10:00:00Z",
        suspension_reason: "spam",
        deletion_eligible_at: "2026-10-20T10:00:00Z",
      },
    });

    const element = await render();

    expect(get_mock).toHaveBeenCalledWith("/core/v1/account/status", {
      skip_cache: true,
    });
    expect(element.textContent).toContain(
      "common.suspended_since_with_deletion:",
    );
    expect(element.textContent).toContain("common.suspended_alert_terms");
    expect(element.textContent).toContain("common.suspended_appeal_hint");
    expect(element.textContent).toContain("common.suspended_download_hint");
    expect(element.querySelector("[data-testid=switcher]")).toBeTruthy();
    button_with("common.suspended_download");
    button_with("common.pending_deletion_sign_out");

    const appeal = element.querySelector("a.aster_btn_depth");
    expect(appeal?.getAttribute("href")).toBe(
      "https://astermail.org/appeal?address=sam%40astermail.org",
    );
  });

  it("falls back to the plain title when no dates are known", async () => {
    get_mock.mockResolvedValue({ data: { status: "active" } });

    const element = await render();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ACCOUNT_SUSPENDED_EVENT));
    });

    expect(element.textContent).toContain("common.suspended_title");
  });

  it("opens the client-side export from the download button", async () => {
    get_mock.mockResolvedValue({
      data: { status: "suspended", suspended_at: "2026-09-20T10:00:00Z" },
    });

    const element = await render();

    await act(async () => {
      button_with("common.suspended_download").click();
    });

    expect(element.querySelector("[data-testid=export_modal]")).toBeTruthy();
  });

  it("signs out and hides itself", async () => {
    get_mock.mockResolvedValue({ data: { status: "suspended" } });
    logout_mock.mockResolvedValue(undefined);

    const element = await render();

    await act(async () => {
      button_with("common.pending_deletion_sign_out").click();
    });

    expect(logout_mock).toHaveBeenCalledTimes(1);
    expect(element.textContent).toBe("");
  });

  it("builds the appeal url without a query when the address is empty", () => {
    expect(build_appeal_url("")).toBe("https://astermail.org/appeal");
  });
});
