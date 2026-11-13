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
const { fingerprint_of_encoded_device_keys } = await import(
  "@/lib/crypto/device_fingerprint"
);

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
}

async function enter_code(): Promise<void> {
  const input = container.querySelector("input");

  if (!input) throw new Error("code input missing");

  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    setter?.call(input, "ABCD2345");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    button("auth.link_device_verify_button")?.click();
  });
}

const SHOWN_FINGERPRINT = "9B16 AF79 0A6A E2F2 55D3";

function device_keys() {
  return {
    ed25519_pk: encode(32, 1),
    mlkem_pk: encode(1184, 2),
    x25519_pk: encode(32, 3),
    machine_name: "desk",
  };
}

function fingerprint_input(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '[data-testid="device_fingerprint_input"]',
  );

  if (!input) throw new Error("fingerprint input missing");

  return input;
}

async function type_fingerprint(value: string): Promise<void> {
  const input = fingerprint_input();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press_enter(): Promise<void> {
  await act(async () => {
    fingerprint_input().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

async function click_confirm(): Promise<void> {
  await act(async () => {
    button("auth.link_device_confirm_button")!.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("link device approval", () => {
  beforeEach(async () => {
    h.verify.mockReset();
    h.confirm.mockReset();
    h.confirm.mockResolvedValue({
      data: { device_id: "d", machine_name: "m" },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<LinkDevice />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("never shows the verification code of the returned keys", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });

    await enter_code();

    expect(container.textContent).not.toContain(SHOWN_FINGERPRINT);
    expect(fingerprint_input().value).toBe("");
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("keeps linking disabled until the full code is typed", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });

    await enter_code();

    expect(button("auth.link_device_confirm_button")?.disabled).toBe(true);
    await type_fingerprint("9B16 AF79 0A6A E2F2 55D");
    expect(button("auth.link_device_confirm_button")?.disabled).toBe(true);
    await press_enter();

    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("refuses a code that differs in one character and sends nothing", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });

    await enter_code();
    await type_fingerprint("9B16 AF79 0A6A E2F2 55D4");
    await click_confirm();

    expect(container.textContent).toContain(
      "auth.link_device_fingerprint_mismatch",
    );
    expect(button("auth.link_device_confirm_button")).toBeDefined();
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("refuses the code of another device", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });
    const other = fingerprint_of_encoded_device_keys({
      ...device_keys(),
      x25519_pk: encode(32, 4),
    });

    await enter_code();
    await type_fingerprint(other!);
    await click_confirm();

    expect(container.textContent).toContain(
      "auth.link_device_fingerprint_mismatch",
    );
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("links the device when the typed code matches its keys", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });

    await enter_code();
    await type_fingerprint("9b16af790a6ae2f255d3");

    expect(fingerprint_input().value).toBe(SHOWN_FINGERPRINT);
    await click_confirm();

    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.confirm.mock.calls[0][0]).toBe("ABCD2345");
  });

  it("keeps only code characters and stops at the full length", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });

    await enter_code();
    await type_fingerprint("9b16-af79 0a6a:e2f2 55d3 ffff zz");

    expect(fingerprint_input().value).toBe(SHOWN_FINGERPRINT);
  });

  it("clears the typed code when the flow restarts", async () => {
    h.verify.mockResolvedValue({ data: device_keys() });

    await enter_code();
    await type_fingerprint(SHOWN_FINGERPRINT);
    await act(async () => {
      button("auth.link_device_cancel")!.click();
    });
    await enter_code();

    expect(fingerprint_input().value).toBe("");
  });

  it("does not offer approval when the keys cannot be fingerprinted", async () => {
    h.verify.mockResolvedValue({
      data: {
        ed25519_pk: encode(32, 1),
        mlkem_pk: encode(64, 2),
        x25519_pk: encode(32, 3),
        machine_name: "desk",
      },
    });

    await enter_code();

    expect(button("auth.link_device_confirm_button")).toBeUndefined();
    expect(container.textContent).toContain("auth.link_device_failed");
    expect(h.confirm).not.toHaveBeenCalled();
  });
});
