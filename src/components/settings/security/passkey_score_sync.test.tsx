// SPDX-FileCopyrightText: 2026 Aster Communications Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ApiResponse } from "@/services/api/client";

import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeySection } from "./passkey_section";
import { AccountProtectionScore } from "./account_protection_score";

import {
  SettingsCacheProvider,
  use_settings_cache,
} from "@/contexts/settings_cache_context";
import {
  list_hardware_keys,
  remove_hardware_key,
  type HardwareKeyInfo,
  type HardwareKeysListResponse,
} from "@/services/api/webauthn";
import {
  register_platform_passkey,
  register_security_key,
} from "@/services/api/passkeys";

vi.mock("@/native/invoke_bridge", () => ({ is_desktop: () => false }));
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));
vi.mock("@/contexts/auth_context", () => ({ use_auth: () => ({}) }));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { account_security_banner_dismissed: false },
    update_preference: vi.fn(),
  }),
}));
vi.mock("@/contexts/auth/session_passphrase", () => ({
  get_session_passphrase: vi.fn(),
}));
vi.mock("@/services/api/webauthn", () => ({
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
  ConfirmModal: ({
    show,
    on_confirm,
  }: {
    show: boolean;
    on_confirm: () => void;
  }) => (show ? <button onClick={on_confirm}>confirm-delete</button> : null),
}));

function ScoreFromCache() {
  const cache = use_settings_cache();
  const entry = useSyncExternalStore(cache.subscribe, () =>
    cache.get_entry<ApiResponse<HardwareKeysListResponse>>("passkey_list"),
  );

  return (
    <div data-testid="score">
      <AccountProtectionScore
        security_loaded
        block_remote_images={false}
        block_tracking_pixels={false}
        login_alerts_enabled={false}
        passkey_registered={(entry?.data?.data?.keys.length ?? 0) > 0}
        recovery_codes_saved={false}
        recovery_email_verified={false}
        strip_exif_on_compose={false}
        totp_enabled={false}
      />
    </div>
  );
}

const key: HardwareKeyInfo = {
  id: "key-1",
  name_encrypted: "Test passkey",
  type: "public-key",
  is_passkey: true,
  registered_at: "2026-10-07T00:00:00Z",
  last_used: null,
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <SettingsCacheProvider>
        <ScoreFromCache />
        <PasskeySection />
      </SettingsCacheProvider>,
    );
  });
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );

  expect(button, `Missing button: ${label}`).toBeDefined();
  await act(async () => button!.click());
}

function expect_score(percent: number) {
  expect(
    container.querySelector('[data-testid="score"]')?.textContent,
  ).toContain(`"percent":${percent}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("passkey mutations update the protection score", () => {
  it.each([
    ["passkeys.add_passkey", register_platform_passkey],
    ["passkeys.add_security_key", register_security_key],
  ] as const)(
    "updates the score after %s succeeds",
    async (label, register) => {
      vi.mocked(list_hardware_keys)
        .mockResolvedValueOnce({ data: { keys: [] } })
        .mockResolvedValueOnce({ data: { keys: [key] } });
      vi.mocked(register).mockResolvedValue({
        data: { success: true, key_id: key.id },
      });
      await render();
      expect_score(0);

      await click(label);

      expect_score(13);
      expect(container.textContent).toContain(key.name_encrypted);
    },
  );

  it("updates the score immediately after deleting the last passkey", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [key] } });
    vi.mocked(remove_hardware_key).mockResolvedValue({
      data: { success: true },
    });
    await render();
    expect_score(13);

    await click("common.delete");
    await click("confirm-delete");

    expect_score(0);
    expect(container.textContent).toContain("passkeys.no_passkeys");
    expect(list_hardware_keys).toHaveBeenCalledTimes(1);
  });

  it("preserves the score when deleting the last passkey fails", async () => {
    vi.mocked(list_hardware_keys).mockResolvedValue({ data: { keys: [key] } });
    vi.mocked(remove_hardware_key).mockResolvedValue({ error: "offline" });
    await render();

    await click("common.delete");
    await click("confirm-delete");

    expect_score(13);
    expect(container.textContent).toContain(key.name_encrypted);
  });
});
