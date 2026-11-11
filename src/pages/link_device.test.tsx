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

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  confirm: vi.fn(),
  seal: vi.fn(),
}));

function encode(length: number, value: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(length).fill(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

vi.mock("react-router-dom", () => ({ useNavigate: () => () => undefined }));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    is_authenticated: true,
    is_loading: false,
    has_keys: true,
    accounts: [],
    user: { email: "ada@astermail.org", display_name: "Ada" },
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ plan_code: "free", max_accounts: 1 }),
}));

vi.mock("@/lib/primary_identity", () => ({
  use_primary_identity: (email: string) => ({ email }),
}));

vi.mock("@/services/api/devices", () => ({
  verify_device_code: h.verify,
  confirm_device_code: h.confirm,
}));

vi.mock("@/lib/crypto/device_envelope", async (original) => ({
  ...(await original<typeof import("@/lib/crypto/device_envelope")>()),
  seal_vault_key_for_device: h.seal,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { can_persist_session: () => true },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => "passphrase",
}));

vi.mock("@/contexts/auth/session_passphrase", () => ({
  has_stored_session_passphrase: () => true,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/settings/billing/plan_upgrade_selection", () => ({
  PlanUpgradeSelection: () => null,
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));

vi.mock("@/components/common/account_pill", () => ({
  AccountPill: () => null,
}));

vi.mock("@/components/common/plan_badge", () => ({ PlanBadge: () => null }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: LinkDevice } = await import("./link_device");

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
}

const FINGERPRINT = "9B16 AF79 0A6A E2F2 55D3";
const OTHER_FINGERPRINT = "0000 1111 2222 3333 4444";
const COMMITMENT_KEY = "aster_link_device_commitment";

function valid_keys() {
  return {
    ed25519_pk: encode(32, 1),
    mlkem_pk: encode(1184, 2),
    x25519_pk: encode(32, 3),
    machine_name: "desk",
  };
}

async function type_into(input: Element | null, value: string): Promise<void> {
  if (!(input instanceof HTMLInputElement)) throw new Error("input missing");

  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function render_page(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<LinkDevice />);
  });
}

async function enter_code(): Promise<void> {
  await type_into(container.querySelector("input"), "ABCD2345");
  await act(async () => {
    button("auth.link_device_verify_button")?.click();
  });
}

async function enter_fingerprint(value: string): Promise<void> {
  await type_into(
    container.querySelector('[data-testid="device_fingerprint_input"]'),
    value,
  );
}

async function approve(): Promise<void> {
  await act(async () => {
    button("auth.link_device_confirm_button")?.click();
  });
}

function store_commitment(fingerprint: string): void {
  window.sessionStorage.setItem(
    COMMITMENT_KEY,
    JSON.stringify({ fingerprint, stored_at: Date.now() }),
  );
}

describe("link device approval", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    h.verify.mockReset();
    h.confirm.mockReset();
    h.seal.mockReset();
    h.verify.mockResolvedValue({ data: valid_keys() });
    h.seal.mockResolvedValue(new Uint8Array([1, 2, 3]));
    h.confirm.mockResolvedValue({
      data: { device_id: "d", machine_name: "m" },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("states the grant and never shows the code of the returned keys", async () => {
    await render_page();
    await enter_code();

    expect(
      container.querySelector('[data-testid="link_device_grant"]')
        ?.textContent,
    ).toBe("auth.link_device_grant_notice");
    expect(container.textContent).toContain(
      "auth.link_device_own_device_warning",
    );
    expect(container.textContent).toContain("auth.link_device_update_desktop");
    expect(container.textContent).not.toContain(FINGERPRINT);
    expect(
      container.querySelector('[data-testid="device_fingerprint"]'),
    ).toBeNull();
  });

  it("refuses to seal until the verification code is typed", async () => {
    await render_page();
    await enter_code();

    expect(button("auth.link_device_confirm_button")?.disabled).toBe(true);
    await approve();
    await enter_fingerprint("9B16 AF79");
    expect(button("auth.link_device_confirm_button")?.disabled).toBe(true);
    await approve();

    expect(h.seal).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("refuses to seal when the typed code does not match the returned keys", async () => {
    await render_page();
    await enter_code();
    await enter_fingerprint(OTHER_FINGERPRINT);
    await approve();

    expect(container.textContent).toContain(
      "auth.link_device_fingerprint_mismatch",
    );
    expect(h.seal).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("seals and confirms when the typed code matches the returned keys", async () => {
    await render_page();
    await enter_code();
    await enter_fingerprint("9b16af790a6ae2f255d3");
    await approve();

    expect(h.seal).toHaveBeenCalledTimes(1);
    expect(h.confirm).toHaveBeenCalledWith("ABCD2345", expect.any(String));
    expect(container.textContent).toContain("auth.link_device_success");
  });

  it("refuses keys that differ from the code the desktop app sent", async () => {
    store_commitment(OTHER_FINGERPRINT);
    await render_page();
    await enter_code();

    expect(container.textContent).toContain(
      "auth.link_device_fingerprint_mismatch",
    );
    expect(button("auth.link_device_confirm_button")).toBeUndefined();
    expect(window.sessionStorage.getItem(COMMITMENT_KEY)).toBeNull();

    await enter_code();

    expect(
      container.querySelector('[data-testid="device_fingerprint_input"]'),
    ).not.toBeNull();
    expect(button("auth.link_device_confirm_button")?.disabled).toBe(true);
    expect(h.seal).not.toHaveBeenCalled();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("accepts keys that match the code the desktop app sent", async () => {
    store_commitment(FINGERPRINT);
    await render_page();
    await enter_code();

    expect(
      container.querySelector('[data-testid="device_fingerprint"]')
        ?.textContent,
    ).toContain(FINGERPRINT);
    expect(
      container.querySelector('[data-testid="device_fingerprint_input"]'),
    ).toBeNull();
    expect(h.seal).not.toHaveBeenCalled();

    await approve();

    expect(h.seal).toHaveBeenCalledTimes(1);
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(COMMITMENT_KEY)).toBeNull();
  });

  it("does not offer approval when the keys cannot be fingerprinted", async () => {
    h.verify.mockResolvedValue({
      data: { ...valid_keys(), mlkem_pk: encode(64, 2) },
    });
    await render_page();
    await enter_code();

    expect(button("auth.link_device_confirm_button")).toBeUndefined();
    expect(container.textContent).toContain("auth.link_device_failed");
    expect(h.confirm).not.toHaveBeenCalled();
  });
});
