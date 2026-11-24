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

const fetch_requirements = vi.fn();
const desktop = { value: false };

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { id: "u1" } }),
}));
vi.mock("@/native/invoke_bridge", () => ({ is_desktop: () => desktop.value }));
vi.mock("@/services/api/passkeys", () => ({
  is_passkey_supported: () => true,
}));
vi.mock("@/utils/open_link", () => ({ open_external: vi.fn() }));
vi.mock("@/services/api/webauthn", () => ({
  list_hardware_keys: vi.fn(async () => ({ data: { keys: [] } })),
  perform_step_up_webauthn_assertion: vi.fn(),
}));
vi.mock("@/services/guard/sign_action", () => ({
  build_step_up_proof: vi.fn(),
  passkey_step_up_proof: vi.fn(),
}));
vi.mock("@/services/api/step_up", () => ({
  fetch_step_up_requirements: (...a: unknown[]) => fetch_requirements(...a),
  derive_step_up_credentials: vi.fn(),
}));

import { StepUpModal } from "@/components/settings/step_up_modal";
import {
  forget_totp_required,
  remember_totp_required,
} from "@/services/api/step_up_cache";

let root: Root;
let host: HTMLDivElement;

function render(allow_passkey = true) {
  act(() => {
    root.render(
      <StepUpModal
        allow_passkey={allow_passkey}
        confirm_label="ok"
        description="d"
        is_open={true}
        title="t"
        on_close={() => {}}
        on_proof={async () => {}}
      />,
    );
  });
}

beforeEach(() => {
  forget_totp_required();
  desktop.value = false;
  fetch_requirements.mockReset();
  fetch_requirements.mockImplementation(() => new Promise(() => {}));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("StepUpModal", () => {
  it("shows the authenticator code field on the first frame when 2FA is known", () => {
    remember_totp_required(true);
    render();
    expect(document.getElementById("step-up-code")).not.toBeNull();
  });

  it("does not show the code field on the first frame when 2FA is known off", () => {
    remember_totp_required(false);
    render();
    expect(document.getElementById("step-up-code")).toBeNull();
  });

  it("hides the passkey option in the desktop app", () => {
    remember_totp_required(false);
    desktop.value = true;
    render();
    expect(document.body.textContent).not.toContain("guard.step_up_use_passkey");
  });

  it("offers the passkey option in the browser", () => {
    remember_totp_required(false);
    render();
    expect(document.body.textContent).toContain("guard.step_up_use_passkey");
  });
});
