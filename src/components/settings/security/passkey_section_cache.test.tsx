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
import type { ApiResponse } from "@/services/api/client";

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeySection } from "./passkey_section";

import {
  SettingsCacheProvider,
  use_settings_cache,
} from "@/contexts/settings_cache_context";
import {
  list_hardware_keys,
  rename_hardware_key,
  type HardwareKeyInfo,
  type HardwareKeysListResponse,
} from "@/services/api/webauthn";

vi.mock("@/native/invoke_bridge", () => ({ is_desktop: () => false }));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));
vi.mock("@/contexts/auth_context", () => ({ use_auth: () => ({}) }));
vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: vi.fn(),
}));
vi.mock("@/services/api/webauthn", () => ({
  initiate_hardware_key_registration: vi.fn(),
  list_hardware_keys: vi.fn(),
  remove_hardware_key: vi.fn(),
  rename_hardware_key: vi.fn(),
}));
vi.mock("@/services/api/passkeys", () => ({
  register_platform_passkey: vi.fn(),
  register_security_key: vi.fn(),
  is_passkey_supported: () => true,
  is_platform_passkey_available: async () => true,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/components/settings/step_up_modal", () => ({
  StepUpModal: () => null,
}));
vi.mock("@/components/email/inbox/inbox_confirmation_dialog", () => ({
  ConfirmModal: () => null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cached_key: HardwareKeyInfo = {
  id: "key-1",
  name_encrypted: "Work laptop",
  type: "public-key",
  is_passkey: true,
  registered_at: "2026-10-07T00:00:00Z",
  last_used: null,
};

type CacheHandle = ReturnType<typeof use_settings_cache>;

let container: HTMLDivElement;
let root: Root;
let cache_handle: CacheHandle | null;
let show_section: (value: boolean) => void;

function CacheCapture({ show }: { show: boolean }) {
  cache_handle = use_settings_cache();

  return show ? <PasskeySection /> : null;
}

function Harness() {
  const [show, set_show] = useState(false);

  show_section = set_show;

  return <CacheCapture show={show} />;
}

async function mount_provider() {
  await act(async () => {
    root.render(
      <SettingsCacheProvider>
        <Harness />
      </SettingsCacheProvider>,
    );
  });
}

function seed_cache(keys: HardwareKeyInfo[], fetched_at: number) {
  cache_handle!.set_entry<ApiResponse<HardwareKeysListResponse>>(
    "passkey_list",
    {
      data: { data: { keys } },
      error: null,
      fetched_at,
      is_loading: false,
    },
  );
}

function first_paint() {
  act(() => show_section(true));
}

function find_button(label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

function placeholder() {
  return container.querySelector('[data-testid="passkey_list_placeholder"]');
}

beforeEach(() => {
  vi.resetAllMocks();
  cache_handle = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("PasskeySection cached rendering", () => {
  it("renders a fresh cached list on the first paint without fetching", async () => {
    await mount_provider();
    act(() => seed_cache([cached_key], Date.now()));

    first_paint();

    expect(container.textContent).toContain("Work laptop");
    expect(placeholder()).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(list_hardware_keys).not.toHaveBeenCalled();
  });

  it("renders a stale cached list at once and revalidates in the background", async () => {
    vi.mocked(list_hardware_keys).mockReturnValue(new Promise(() => {}));
    await mount_provider();
    act(() => seed_cache([cached_key], Date.now() - 120_000));

    first_paint();

    expect(container.textContent).toContain("Work laptop");
    expect(placeholder()).toBeNull();
    expect(list_hardware_keys).toHaveBeenCalledTimes(1);
  });

  it("renders the header and add buttons on the first paint before data arrives", async () => {
    vi.mocked(list_hardware_keys).mockReturnValue(new Promise(() => {}));
    await mount_provider();

    first_paint();

    expect(container.textContent).toContain("passkeys.section_title");
    expect(find_button("passkeys.add_passkey")).toBeDefined();
    expect(find_button("passkeys.add_security_key")).toBeDefined();
    expect(placeholder()).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("shows the empty state when the account has no keys", async () => {
    await mount_provider();
    act(() => seed_cache([], Date.now()));

    first_paint();

    expect(container.textContent).toContain("passkeys.no_passkeys");
    expect(placeholder()).toBeNull();
  });

  it("shows the error state and retries the fetch", async () => {
    vi.mocked(list_hardware_keys)
      .mockResolvedValueOnce({ error: "forbidden", code: "FORBIDDEN" })
      .mockResolvedValueOnce({ data: { keys: [cached_key] } });
    await mount_provider();

    await act(async () => show_section(true));

    expect(container.textContent).toContain(
      "settings.failed_load_security_status",
    );

    await act(async () => find_button("settings.try_again")!.click());

    expect(container.textContent).toContain("Work laptop");
    expect(list_hardware_keys).toHaveBeenCalledTimes(2);
  });

  it("writes a rename back to the cache", async () => {
    vi.mocked(rename_hardware_key).mockResolvedValue({
      data: { success: true },
    } as never);
    await mount_provider();
    act(() => seed_cache([cached_key], Date.now()));
    first_paint();

    await act(async () => find_button("passkeys.rename")!.click());
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      setter.call(input, "Home desktop");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => find_button("common.save")!.click());

    expect(container.textContent).toContain("Home desktop");
    expect(
      cache_handle!.get_entry<ApiResponse<HardwareKeysListResponse>>(
        "passkey_list",
      )?.data?.data?.keys[0].name_encrypted,
    ).toBe("Home desktop");
  });
});
