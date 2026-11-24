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

const fetch_devices = vi.fn();

vi.mock("@/services/api/devices", () => ({
  list_devices: () => fetch_devices(),
}));

vi.mock("@/services/api/auto_forward", () => ({
  list_forwarding_rules: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/blocked_senders", () => ({
  list_blocked_senders: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/allowed_senders", () => ({
  list_allowed_senders: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/signatures", () => ({
  list_signatures: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/templates", () => ({
  list_templates: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/email_import", () => ({
  list_import_jobs: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/external_accounts", () => ({
  list_external_accounts: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/vacation_reply", () => ({
  get_vacation_reply: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/ghost_aliases", () => ({
  list_ghost_aliases: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/sessions", () => ({
  list_sessions: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/totp", () => ({
  get_totp_status: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/auth", () => ({
  get_login_alerts_status: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/recovery_email", () => ({
  get_recovery_email: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/account", () => ({
  get_security_status: () => Promise.resolve({ data: null }),
}));

vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: () => Promise.resolve({ data: null }),
}));

import {
  use_settings_panel_data,
  use_settings_prefetch,
} from "./use_settings_prefetch";

import { SettingsCacheProvider } from "@/contexts/settings_cache_context";

interface PanelView {
  data: unknown;
  error: unknown;
  is_loading: boolean;
}

let container: HTMLDivElement;
let root: Root;
let run_prefetch: ((force: boolean) => Promise<void>) | null = null;
let views: PanelView[] = [];

function Prefetcher() {
  run_prefetch = use_settings_prefetch(false).run_prefetch;

  return null;
}

function Panel() {
  const { data, error, is_loading } =
    use_settings_panel_data("trusted_devices");

  views.push({ data, error, is_loading });

  return null;
}

function latest(): PanelView {
  return views[views.length - 1];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

const ok_response = { data: { devices: [{ id: "d1" }] } };
const network_failure = {
  error: "Network error",
  code: "NETWORK_ERROR",
};

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetch_devices.mockReset();
  views = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  run_prefetch = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("use_settings_panel_data", () => {
  it("does not show a background preload failure in an open panel", async () => {
    const pending = deferred<unknown>();

    fetch_devices.mockReturnValueOnce(pending.promise);
    fetch_devices.mockResolvedValue(ok_response);

    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <Prefetcher />
        </SettingsCacheProvider>,
      );
    });

    let prefetch_done: Promise<void> | undefined;

    await act(async () => {
      prefetch_done = run_prefetch?.(false);
    });
    for (
      let step = 0;
      step < 50 && fetch_devices.mock.calls.length === 0;
      step += 1
    ) {
      await flush();
    }
    expect(fetch_devices).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <Prefetcher />
          <Panel />
        </SettingsCacheProvider>,
      );
    });

    await act(async () => {
      pending.resolve(network_failure);
      await prefetch_done;
    });
    await flush(5_000);

    expect(views.some((view) => view.error)).toBe(false);
    expect(latest().error).toBeNull();
    expect(latest().data).toEqual(ok_response);
  });

  it("retries a transient failure before showing an error", async () => {
    fetch_devices.mockResolvedValueOnce(network_failure);
    fetch_devices.mockResolvedValue(ok_response);

    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <Panel />
        </SettingsCacheProvider>,
      );
    });
    await flush(5_000);

    expect(views.some((view) => view.error)).toBe(false);
    expect(latest().data).toEqual(ok_response);
  });

  it("shows the error after the foreground load keeps failing", async () => {
    fetch_devices.mockResolvedValue(network_failure);

    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <Panel />
        </SettingsCacheProvider>,
      );
    });
    await flush(30_000);

    expect(latest().error).toBeTruthy();
    expect(latest().is_loading).toBe(false);
  });

  it("shows a definitive failure without retrying", async () => {
    fetch_devices.mockResolvedValue({ error: "Forbidden", status: 403 });

    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <Panel />
        </SettingsCacheProvider>,
      );
    });
    await flush(30_000);

    expect(latest().error).toBeTruthy();
    expect(fetch_devices).toHaveBeenCalledTimes(1);
  });

  it("reports loading before the first fetch resolves instead of an empty list", async () => {
    fetch_devices.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      root.render(
        <SettingsCacheProvider>
          <Panel />
        </SettingsCacheProvider>,
      );
    });

    expect(views[0].is_loading).toBe(true);
    expect(views.every((view) => view.is_loading)).toBe(true);
  });
});
