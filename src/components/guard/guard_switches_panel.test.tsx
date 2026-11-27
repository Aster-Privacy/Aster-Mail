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
import type { ReactNode } from "react";
import type { GuardStatus } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  base64url_decode,
  base64url_encode,
} from "@/lib/crypto/device_envelope";
import {
  build_action_message,
  GUARD_ACTION,
  id_subject,
  keys_digest,
  number_hash,
  switches_subject,
} from "@/lib/crypto/guard_action";
import {
  GUARD_ALL_SCOPES,
  GUARD_ENVELOPE_VERSIONS,
  GUARD_SWITCH,
} from "@/services/api/guard";

const USER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const THIS_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const PIXEL_ID = "9b2f1c3e-5a4d-4e6f-8a7b-1c2d3e4f5a6b";
const CHANGE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const NONCE = new Uint8Array(32).fill(5);

const h = vi.hoisted(() => ({
  proof: { type: "password", password_hash: "ph", totp_code: null },
  switches_body: null as Record<string, unknown> | null,
  switches_held: false,
  join_body: null as Record<string, unknown> | null,
  join_status: "pending",
  join_completed: false,
  removed: [] as string[],
  sign_calls: 0,
  records: new Map<string, unknown>(),
  keys: new Map<string, CryptoKey>(),
  proof_requests: 0,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@aster/ui", () => ({
  SettingToggleRow: ({
    label,
    checked,
    disabled,
    on_change,
  }: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    on_change: (on: boolean) => void;
  }) => (
    <input
      aria-label={label}
      checked={checked}
      disabled={disabled}
      type="checkbox"
      onChange={(e) => on_change(e.target.checked)}
    />
  ),
  SettingNote: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  IslandSection: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  Island: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  IslandRow: ({
    icon,
    label,
    description,
    trailing,
  }: {
    icon?: ReactNode;
    label?: ReactNode;
    description?: ReactNode;
    trailing?: ReactNode;
  }) => (
    <div>
      {icon}
      {label}
      {description}
      {trailing}
    </div>
  ),
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Spinner: () => <span />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
    ...rest
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    "data-testid"?: string;
  }) => (
    <button
      data-testid={rest["data-testid"]}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    message,
    on_confirm,
  }: {
    is_open: boolean;
    message: string;
    on_confirm: () => void;
  }) =>
    is_open ? (
      <div data-testid="confirm_modal">
        <p>{message}</p>
        <button data-testid="confirm_yes" type="button" onClick={on_confirm}>
          yes
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/guard/guard_rescue_rotate_dialog", () => ({
  GuardRescueRotateDialog: ({ is_open }: { is_open: boolean }) =>
    is_open ? <div data-testid="guard_rescue_rotate_dialog_stub" /> : null,
}));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: vi.fn(async () => {
      h.proof_requests++;

      return h.proof;
    }),
    run: vi.fn(async (attempt: (proof: unknown) => Promise<unknown>) => {
      h.proof_requests++;

      return h.proof ? attempt(h.proof) : null;
    }),
    step_up_modal: null,
  }),
}));

vi.mock("@/services/api/guard", async (original) => {
  const actual = await original<typeof import("@/services/api/guard")>();
  const nonce = async () => ({
    data: {
      nonce: base64url_encode(NONCE),
      expires_at: "2026-11-15T10:05:00Z",
    },
  });

  return {
    ...actual,
    guard_challenge: vi.fn(nonce),
    guard_setup_nonce: vi.fn(nonce),
    put_guard_switches: vi.fn(async (body: Record<string, unknown>) => {
      h.switches_body = body;
      if (h.switches_held) {
        return {
          data: undefined,
          status: 202,
          held: {
            id: CHANGE_ID,
            kind: "guard_switches_off",
            apply_after: "2026-11-16T10:00:00Z",
            skippable: true,
          },
        };
      }

      return { data: {} };
    }),
    guard_join: vi.fn(async (body: Record<string, unknown>) => {
      h.join_body = body;

      return {
        data: {
          request_id: body.request_id,
          expires_at: "2026-11-15T10:10:00Z",
        },
      };
    }),
    get_guard_join_status: vi.fn(async () => ({
      data: { status: h.join_status, expires_at: "2026-11-15T10:10:00Z" },
    })),
    guard_join_complete: vi.fn(async () => {
      h.join_completed = true;

      return {
        data: {
          device_id: "joined-device",
          code_secret_sealed: base64url_encode(new Uint8Array(8)),
          approval_envelope: null,
        },
      };
    }),
    remove_guard_device: vi.fn(async (id: string) => {
      h.removed.push(id);

      return { data: { status: "removed" } };
    }),
    cancel_guard_change: vi.fn(async () => ({ data: { cancelled: true } })),
  };
});

vi.mock("@/services/guard/guard_device", async (original) => {
  const actual =
    await original<typeof import("@/services/guard/guard_device")>();

  const make = async (key: string, name: string): Promise<GuardDevice> => {
    const pair = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    );

    h.keys.set(key, pair.publicKey);
    const record = {
      device_id: null as string | null,
      pub: {
        ed25519_pk: new Uint8Array(32).fill(1),
        mlkem_pk: new Uint8Array(1184).fill(2),
        x25519_pk: new Uint8Array(32).fill(3),
        action_pk: (await import("@/lib/crypto/guard_action")).compress_p256(
          raw,
        ),
        device_type: "web" as const,
        name,
      },
    };
    const device: GuardDevice = {
      public_keys: async () => record.pub,
      device_id: async () => record.device_id,
      set_device_id: async (id) => {
        record.device_id = id;
      },
      sign: (message) => {
        h.sign_calls++;

        return actual.sign_with_action_key(pair.privateKey, message);
      },
      open_seal: async () => new Uint8Array(20).fill(9),
      open_envelope: async () => new Uint8Array(0),
      store_code_secret: async () => undefined,
      code_secret: async () => null,
      forget: async () => undefined,
    };

    h.records.set(key, device);

    return device;
  };

  return {
    ...actual,
    create_guard_device: vi.fn(make),
    get_guard_device: vi.fn(async (key: string) => h.records.get(key) ?? null),
    rekey_guard_device: vi.fn(async (from: string, to: string) => {
      h.records.set(to, h.records.get(from));
      h.records.delete(from);
      const key = h.keys.get(from);

      if (key) h.keys.set(to, key);
    }),
    forget_guard_device: vi.fn(async (key: string) => {
      h.records.delete(key);
    }),
  };
});

import { create_guard_device } from "@/services/guard/guard_device";
import { GuardSwitchesPanel } from "@/components/guard/guard_switches_panel";
import { GuardDevicesList } from "@/components/guard/guard_devices_list";
import { guard_device_platform } from "@/components/guard/guard_visuals";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function wait_until(ready: () => boolean) {
  for (let i = 0; i < 300 && !ready(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function by_label(label: string): HTMLInputElement {
  const el = container.querySelector(`[aria-label="${label}"]`);

  if (!el) throw new Error(`missing ${label}`);

  return el as HTMLInputElement;
}

function by_test_id(id: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${id}"]`);

  if (!el) throw new Error(`missing ${id}`);

  return el as HTMLElement;
}

function make_status(overrides: Partial<GuardStatus> = {}): GuardStatus {
  return {
    switches: GUARD_SWITCH.new_device_approval | GUARD_SWITCH.hold_changes,
    hold_scopes: GUARD_ALL_SCOPES,
    version: 3,
    enrolled_at: "2026-11-10T10:00:00Z",
    recovery_wait_effective: false,
    paused_until: null,
    has_rescue_code: true,
    this_device: { id: THIS_ID, long_trusted: false, approved_at: null },
    devices: [
      {
        id: THIS_ID,
        name: "Firefox on Windows",
        device_type: "web",
        approved_at: "2026-11-10T10:00:00Z",
        long_trusted: false,
      },
      {
        id: PIXEL_ID,
        name: "Pixel 9",
        device_type: "mobile",
        approved_at: "2026-11-11T10:00:00Z",
        long_trusted: true,
      },
    ],
    pending_changes: [],
    ...overrides,
  };
}

async function verify(
  key_name: string,
  code: number,
  subject: Uint8Array,
  signature: string,
): Promise<boolean> {
  const message = build_action_message(code, USER_ID, NONCE, subject);

  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    h.keys.get(key_name)!,
    base64url_decode(signature),
    message,
  );
}

const on_refresh = vi.fn();

function render_panel(status: GuardStatus, device: GuardDevice | null) {
  act(() => {
    root.render(
      <GuardSwitchesPanel
        device={device}
        status={status}
        user_id={USER_ID}
        on_refresh={on_refresh}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.switches_body = null;
  h.switches_held = false;
  h.join_body = null;
  h.join_status = "pending";
  h.join_completed = false;
  h.removed = [];
  h.sign_calls = 0;
  h.proof_requests = 0;
  h.records.clear();
  h.keys.clear();
  on_refresh.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("guard switches panel", () => {
  it("shows a held switch-off and keeps the toggle on", async () => {
    const device = await create_guard_device(USER_ID, "Firefox on Windows");

    h.sign_calls = 0;
    h.switches_held = true;
    render_panel(make_status(), device);
    act(() => by_label("guard.setup_hold_changes").click());
    await wait_until(
      () => !!container.querySelector('[data-testid="guard_switches_held"]'),
    );

    expect(h.proof_requests).toBe(1);
    expect(h.switches_body).toMatchObject({
      switches: GUARD_SWITCH.new_device_approval,
      hold_scopes: 0,
    });
    const action = h.switches_body!.action as {
      signature: string;
      proof: unknown;
    };

    expect(action.proof).toEqual(h.proof);
    expect(
      await verify(
        USER_ID,
        GUARD_ACTION.switches,
        switches_subject(GUARD_SWITCH.new_device_approval, 0),
        action.signature,
      ),
    ).toBe(true);
    expect(by_test_id("guard_switches_held").textContent).toContain(
      "guard.switches_turning_off_at",
    );
    expect(by_label("guard.setup_hold_changes").checked).toBe(true);
    expect(
      container.querySelector('[data-testid="guard_switches_cancel"]'),
    ).not.toBeNull();
  });

  it("signs a switch-on with a step-up proof", async () => {
    const device = await create_guard_device(USER_ID, "Firefox on Windows");

    render_panel(make_status(), device);
    act(() => by_label("guard.setup_recovery_wait").click());
    await wait_until(() => h.switches_body !== null);

    const expected =
      GUARD_SWITCH.new_device_approval |
      GUARD_SWITCH.hold_changes |
      GUARD_SWITCH.recovery_wait;

    expect(h.proof_requests).toBe(1);
    expect(h.switches_body).toMatchObject({
      switches: expected,
      hold_scopes: GUARD_ALL_SCOPES,
    });
    const action = h.switches_body!.action as {
      signature: string;
      proof: unknown;
    };

    expect(action.proof).toEqual(h.proof);
    expect(
      await verify(
        USER_ID,
        GUARD_ACTION.switches,
        switches_subject(expected, GUARD_ALL_SCOPES),
        action.signature,
      ),
    ).toBe(true);
  });

  it("opens the rescue code dialog from the rescue row", async () => {
    const device = await create_guard_device(USER_ID, "Firefox on Windows");

    render_panel(make_status(), device);
    await wait_until(
      () => !!container.querySelector('[data-testid="guard_rescue_row"]'),
    );

    expect(
      container.querySelector(
        '[data-testid="guard_rescue_rotate_dialog_stub"]',
      ),
    ).toBeNull();
    act(() => by_test_id("guard_rescue_rotate_open").click());
    expect(by_test_id("guard_rescue_rotate_dialog_stub")).not.toBeNull();
  });

  it("shows the not-an-approver state without a local device", async () => {
    render_panel(make_status(), null);
    await flush();

    expect(by_test_id("guard_not_an_approver").textContent).toContain(
      "guard.switches_not_an_approver",
    );
    expect(by_label("guard.setup_hold_changes").disabled).toBe(true);
    act(() => by_label("guard.setup_hold_changes").click());
    await flush();
    expect(h.sign_calls).toBe(0);
    expect(h.switches_body).toBeNull();
  });

  it("shows the not-an-approver state when the server does not know this device", async () => {
    const device = await create_guard_device(USER_ID, "Firefox on Windows");

    h.sign_calls = 0;
    render_panel(make_status({ this_device: null }), device);
    await flush();

    expect(
      container.querySelector('[data-testid="guard_not_an_approver"]'),
    ).not.toBeNull();
    act(() => by_label("guard.setup_recovery_wait").click());
    await flush();
    expect(h.sign_calls).toBe(0);
  });

  it("adds this browser with a join signed over the device keys", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render_panel(make_status({ this_device: null }), null);
    act(() => by_test_id("guard_add_this_browser").click());
    await wait_until(
      () =>
        h.join_body !== null &&
        container.querySelector('[data-testid="guard_join_number"]') !== null,
    );

    const body = h.join_body!;
    const device = body.device as Record<string, string>;
    const action = body.action as {
      nonce: string;
      signature: string;
      proof: unknown;
    };
    const digest = keys_digest(
      base64url_decode(device.ed25519_pk),
      base64url_decode(device.mlkem_pk),
      base64url_decode(device.x25519_pk),
      base64url_decode(device.action_pk),
    );

    expect(body.envelope_versions).toEqual(GUARD_ENVELOPE_VERSIONS);
    expect(action.proof).toBeNull();
    expect(
      await verify(
        `guard_join:${USER_ID}`,
        GUARD_ACTION.join,
        digest,
        action.signature,
      ),
    ).toBe(true);
    const shown = Number(by_test_id("guard_join_number").textContent);

    expect(body.number_hash).toBe(
      base64url_encode(number_hash(body.request_id as string, shown)),
    );

    h.join_status = "approved";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await flush();

    expect(h.join_completed).toBe(true);
    const joined = h.records.get(USER_ID) as GuardDevice;

    expect(await joined.device_id()).toBe("joined-device");
    expect(h.records.has(`guard_join:${USER_ID}`)).toBe(false);
    expect(on_refresh).toHaveBeenCalled();
  });

  it("does not finish the join while the request is pending", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render_panel(make_status({ this_device: null }), null);
    act(() => by_test_id("guard_add_this_browser").click());
    await wait_until(
      () =>
        h.join_body !== null &&
        container.querySelector('[data-testid="guard_join_number"]') !== null,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    await flush();

    expect(h.join_completed).toBe(false);
    expect(
      container.querySelector('[data-testid="guard_join_number"]'),
    ).not.toBeNull();
  });
});

describe("guard devices list", () => {
  it("shows the platform mark for each device", async () => {
    act(() => {
      root.render(
        <GuardDevicesList
          device={null}
          status={make_status()}
          user_id={USER_ID}
          on_refresh={on_refresh}
        />,
      );
    });
    await flush();

    const platform = (id: string) =>
      by_test_id(`guard_device_icon_${id}`).getAttribute("data-platform");

    expect(platform(THIS_ID)).toBe("browser");
    expect(platform(PIXEL_ID)).toBe("android");
  });

  it("maps device names to a platform and keeps unknown devices generic", () => {
    expect(guard_device_platform("Aster Mail for Mac", "desktop")).toBe(
      "apple",
    );
    expect(guard_device_platform("iPhone 16", "mobile")).toBe("apple");
    expect(guard_device_platform("Galaxy S24", "mobile")).toBe("android");
    expect(guard_device_platform("Aster Mail on Windows", "desktop")).toBe(
      "windows",
    );
    expect(guard_device_platform("Aster Mail on Ubuntu", "desktop")).toBe(
      "linux",
    );
    expect(guard_device_platform("Safari on iPhone", "web")).toBe("browser");
    expect(guard_device_platform("Workstation", "desktop")).toBeNull();
  });

  it("confirms before removing the current device", async () => {
    const device = await create_guard_device(USER_ID, "Firefox on Windows");

    act(() => {
      root.render(
        <GuardDevicesList
          device={device}
          status={make_status()}
          user_id={USER_ID}
          on_refresh={on_refresh}
        />,
      );
    });
    act(() => by_test_id(`guard_device_remove_${THIS_ID}`).click());
    await flush();

    expect(h.removed).toEqual([]);
    expect(by_test_id("confirm_modal").textContent).toContain(
      "guard.devices_remove_this_device",
    );
    act(() => by_test_id("confirm_yes").click());
    await wait_until(() => h.removed.length > 0);
    expect(h.removed).toEqual([THIS_ID]);
  });

  it("removes another device with a signature over its id", async () => {
    const device = await create_guard_device(USER_ID, "Firefox on Windows");
    const { remove_guard_device } = await import("@/services/api/guard");

    act(() => {
      root.render(
        <GuardDevicesList
          device={device}
          status={make_status()}
          user_id={USER_ID}
          on_refresh={on_refresh}
        />,
      );
    });
    act(() => by_test_id(`guard_device_remove_${PIXEL_ID}`).click());
    await wait_until(() => h.removed.length > 0);

    expect(container.querySelector('[data-testid="confirm_modal"]')).toBeNull();
    expect(h.removed).toEqual([PIXEL_ID]);
    const call = vi.mocked(remove_guard_device).mock.calls.at(-1)!;
    const action = call[1] as { signature: string; proof: unknown };

    expect(h.proof_requests).toBe(1);
    expect(action.proof).toEqual(h.proof);
    expect(
      await verify(
        USER_ID,
        GUARD_ACTION.remove_device,
        id_subject(PIXEL_ID),
        action.signature,
      ),
    ).toBe(true);
  });
});
