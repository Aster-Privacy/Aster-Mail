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
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get_mock = vi.fn();
const logout_mock = vi.fn();
const auth_state = {
  is_authenticated: true,
  is_loading: false,
  user: { id: "u1", email: "sam@astermail.org", username: "sam" } as {
    id: string;
    email: string;
    username: string;
  } | null,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({ ...auth_state, logout: logout_mock }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { profile_color: "blue" } }),
}));

vi.mock("@/lib/primary_identity", () => ({
  use_primary_identity: (email: string) => ({ email }),
}));

vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({ folders: [] }),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/components/common/full_page_loader", () => ({
  FullPageLoader: () => <div data-testid="loader" />,
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

const { SuspendedPage, SuspensionStatusWatcher, build_appeal_url } =
  await import("./suspended_account_gate");
const { get_suspension_state, reset_suspension_state, set_suspension_state } =
  await import("@/lib/suspension_state");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const SUSPENDED_STATUS = {
  suspended: true,
  suspended_at: "2026-09-20T10:00:00Z",
  deletion_eligible_at: "2026-10-20T10:00:00Z",
  appeal_url: "https://astermail.org/appeal",
};

async function render_at(path: string): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <SuspensionStatusWatcher />
        <Routes>
          <Route element={<SuspendedPage />} path="/suspended" />
          <Route element={<div data-testid="home" />} path="/" />
          <Route element={<div data-testid="sign_in" />} path="/sign-in" />
        </Routes>
      </MemoryRouter>,
    );
  });

  return container;
}

function button_with(text: string): HTMLButtonElement {
  const match = Array.from(container?.querySelectorAll("button") ?? []).find(
    (element) => element.textContent?.startsWith(text),
  );

  expect(match).toBeTruthy();

  return match as HTMLButtonElement;
}

beforeEach(() => {
  get_mock.mockReset();
  logout_mock.mockReset();
  auth_state.is_authenticated = true;
  auth_state.is_loading = false;
  auth_state.user = { id: "u1", email: "sam@astermail.org", username: "sam" };
  reset_suspension_state();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("suspension page", () => {
  it("sends an account in good standing back to the app", async () => {
    get_mock.mockResolvedValue({ data: { suspended: false } });

    const element = await render_at("/suspended");

    expect(get_mock).toHaveBeenCalledWith("/core/v1/account/suspension", {
      skip_cache: true,
    });
    expect(get_suspension_state()).toBe("active");
    expect(element.querySelector("[data-testid=home]")).toBeTruthy();
  });

  it("sends a signed-out visitor to sign in", async () => {
    auth_state.is_authenticated = false;
    auth_state.user = null;

    const element = await render_at("/suspended");

    expect(element.querySelector("[data-testid=sign_in]")).toBeTruthy();
    expect(get_mock).not.toHaveBeenCalled();
  });

  it("shows the notice, dates, and the three actions", async () => {
    get_mock.mockResolvedValue({ data: SUSPENDED_STATUS });

    const element = await render_at("/suspended");

    expect(get_suspension_state()).toBe("suspended");
    expect(element.textContent).toContain(
      "common.suspended_since_with_deletion:",
    );
    expect(element.textContent).toContain("common.suspended_limited_access");
    expect(element.textContent).toContain("common.suspended_alert_terms");
    expect(element.querySelector("[data-testid=switcher]")).toBeTruthy();
    button_with("common.suspended_download");
    button_with("common.pending_deletion_sign_out");
    expect(element.querySelector("img[src='/text_logo.png']")).toBeTruthy();
    expect(
      element
        .querySelector("[data-testid=suspended_start_appeal]")
        ?.getAttribute("href"),
    ).toBe("https://astermail.org/appeal?address=sam%40astermail.org");
  });

  it("opens the client-side export from the download button", async () => {
    get_mock.mockResolvedValue({ data: SUSPENDED_STATUS });

    const element = await render_at("/suspended");

    await act(async () => {
      button_with("common.suspended_download").click();
    });

    expect(element.querySelector("[data-testid=export_modal]")).toBeTruthy();
  });

  it("signs out and clears the suspension state", async () => {
    get_mock.mockResolvedValue({ data: SUSPENDED_STATUS });
    logout_mock.mockResolvedValue(undefined);

    await render_at("/suspended");

    await act(async () => {
      button_with("common.pending_deletion_sign_out").click();
    });

    expect(logout_mock).toHaveBeenCalledTimes(1);
    expect(get_suspension_state()).toBe("unknown");
  });

  it("keeps the page while the state is still being checked", async () => {
    get_mock.mockReturnValue(new Promise(() => undefined));

    const element = await render_at("/suspended");

    expect(element.querySelector("[data-testid=loader]")).toBeTruthy();
  });

  it("renders immediately when sign-in already reported the scope", async () => {
    set_suspension_state("suspended");
    get_mock.mockReturnValue(new Promise(() => undefined));

    const element = await render_at("/suspended");

    expect(
      element.querySelector("[data-testid=suspended_account_gate]"),
    ).toBeTruthy();
  });
});

describe("appeal url", () => {
  it("omits the query when the address is empty", () => {
    expect(build_appeal_url("")).toBe("https://astermail.org/appeal");
  });

  it("falls back to the default for a non-https base", () => {
    expect(build_appeal_url("a@b.c", "http://example.org/x")).toBe(
      "https://astermail.org/appeal?address=a%40b.c",
    );
  });
});
