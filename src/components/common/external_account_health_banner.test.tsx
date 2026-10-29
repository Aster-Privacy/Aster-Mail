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

const list_mock = vi.fn();
const preferences_state = { is_loading: false, has_loaded_from_server: true };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { external_account_health_banner_dismissed: "" },
    update_preference: () => {},
    ...preferences_state,
  }),
}));

vi.mock("@aster/ui", () => ({
  StatusBanner: ({
    is_visible,
    message,
  }: {
    is_visible: boolean;
    message: string;
  }) => (is_visible ? <div role="status">{message}</div> : null),
}));

vi.mock("@/services/api/external_accounts", () => ({
  list_external_accounts: () => list_mock(),
}));

const { ExternalAccountHealthBanner } =
  await import("./external_account_health_banner");
const { clear_external_account_health, publish_external_account_health } =
  await import("@/stores/external_account_health_store");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render_banner() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ExternalAccountHealthBanner />);
  });
}

async function rerender_banner() {
  await act(async () => {
    root!.render(<ExternalAccountHealthBanner />);
  });
}

describe("ExternalAccountHealthBanner", () => {
  beforeEach(() => {
    list_mock.mockReset();
    list_mock.mockResolvedValue({ data: [] });
    preferences_state.is_loading = false;
    preferences_state.has_loaded_from_server = true;
    clear_external_account_health();
    localStorage.clear();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("loads the account list once when nothing has published it yet", async () => {
    await render_banner();
    await rerender_banner();

    expect(list_mock).toHaveBeenCalledTimes(1);
  });

  it("waits for preferences before loading the list", async () => {
    preferences_state.has_loaded_from_server = false;
    await render_banner();

    expect(list_mock).not.toHaveBeenCalled();

    preferences_state.has_loaded_from_server = true;
    await rerender_banner();

    expect(list_mock).toHaveBeenCalledTimes(1);
  });

  it("does not load the list again when it was already published", async () => {
    publish_external_account_health([]);
    await render_banner();

    expect(list_mock).not.toHaveBeenCalled();
  });

  it("loads the list again after the account changes", async () => {
    await render_banner();
    expect(list_mock).toHaveBeenCalledTimes(1);

    await act(async () => {
      clear_external_account_health();
    });

    expect(list_mock).toHaveBeenCalledTimes(2);
  });

  it("shows the banner from the loaded list", async () => {
    list_mock.mockImplementation(async () => {
      publish_external_account_health([
        {
          id: "a",
          email: "a@example.com",
          protocol: "oauth_imap",
          is_enabled: true,
          needs_reauth: true,
          last_sync_at: null,
          last_sync_status: "error",
          created_at: new Date(Date.now() - 86_400_000).toISOString(),
        },
      ]);

      return { data: [] };
    });
    await render_banner();

    expect(container!.querySelector('[role="status"]')?.textContent).toBe(
      "common.external_account_health_banner_reauth",
    );
  });
});
