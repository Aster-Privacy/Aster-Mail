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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TwoStepVerificationGroup } from "./two_factor_section";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));
vi.mock("@/components/settings/security/totp_inline_setup", () => ({
  TotpInlineSetup: () => null,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render_group(props: {
  totp_enabled: boolean;
  passkey_registered?: boolean;
  totp_status_failed?: boolean;
}) {
  await act(async () => {
    root.render(
      <TwoStepVerificationGroup
        on_inline_setup_success={() => {}}
        on_regenerate_backup_codes={() => {}}
        on_two_factor_toggle={() => {}}
        show_inline_setup={false}
        totp_backup_codes_remaining={8}
        {...props}
      />,
    );
  });
}

const text = () => container.textContent ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("two-step verification status", () => {
  it("recommends action when no second factor is set up", async () => {
    await render_group({ totp_enabled: false, passkey_registered: false });

    expect(text()).toContain("settings.action_recommended");
    expect(text()).toContain("settings.two_step_verification_description");
  });

  it("reports a security key as an active second factor", async () => {
    await render_group({ totp_enabled: false, passkey_registered: true });

    expect(text()).not.toContain("settings.action_recommended");
    expect(text()).toContain(
      "settings.two_step_verification_security_key_description",
    );
    expect(text()).toContain("settings.setup_2fa");
    expect(text()).not.toContain("settings.backup_codes");
  });

  it("names both methods when an authenticator app and a key are set up", async () => {
    await render_group({ totp_enabled: true, passkey_registered: true });

    expect(text()).not.toContain("settings.action_recommended");
    expect(text()).toContain("settings.two_step_verification_both_description");
    expect(text()).toContain("settings.backup_codes");
  });

  it("keeps the authenticator wording when only the app is set up", async () => {
    await render_group({ totp_enabled: true, passkey_registered: false });

    expect(text()).toContain(
      "settings.two_step_verification_enabled_description",
    );
  });

  it("holds the recommendation while the key list is still loading", async () => {
    await render_group({ totp_enabled: false });

    expect(text()).not.toContain("settings.action_recommended");
  });

  it("shows the warning again after the last key is removed", async () => {
    await render_group({ totp_enabled: false, passkey_registered: true });
    await render_group({ totp_enabled: false, passkey_registered: false });

    expect(text()).toContain("settings.action_recommended");
  });

  it("shows no status while the authenticator status failed to load", async () => {
    await render_group({
      totp_enabled: false,
      passkey_registered: true,
      totp_status_failed: true,
    });

    expect(text()).not.toContain("settings.action_recommended");
    expect(text()).not.toContain(
      "settings.two_step_verification_security_key_description",
    );
  });
});
