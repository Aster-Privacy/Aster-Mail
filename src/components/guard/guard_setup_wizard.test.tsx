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
  keys_digest,
} from "@/lib/crypto/guard_action";
import {
  GUARD_ALL_SCOPES,
  GUARD_SCOPE,
  GUARD_SWITCH,
} from "@/services/api/guard";

const h = vi.hoisted(() => ({
  setup_body: null as Record<string, unknown> | null,
  setup_result: "ok" as "ok" | "already_on" | "wrong" | "replayed" | "upgrade",
  records: new Map<string, unknown>(),
  proof: { type: "password", password_hash: "ph", totp_code: null },
  verify_key: null as CryptoKey | null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@aster/ui", () => ({
  Checkbox: ({
    checked,
    id,
    onCheckedChange,
    "data-testid": test_id,
  }: {
    checked: boolean;
    id?: string;
    onCheckedChange: (on: boolean) => void;
    "data-testid"?: string;
  }) => (
    <input
      checked={checked}
      data-testid={test_id}
      id={id}
      type="checkbox"
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
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
}));

vi.mock("@/components/ui/modal", () => {
  const pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: ({
      children,
      is_open,
    }: {
      children?: ReactNode;
      is_open: boolean;
    }) => (is_open ? <div>{children}</div> : null),
    ModalBody: pass,
    ModalHeader: pass,
    ModalTitle: pass,
    ModalDescription: pass,
    ModalFooter: pass,
  };
});

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

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/utils/copy_text", () => ({ copy_text: vi.fn(async () => true) }));
vi.mock("@/components/guard/guard_code_card", () => ({
  GuardCodeCard: () => <div data-testid="guard_code_card" />,
}));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: vi.fn(async () => h.proof),
    step_up_modal: null,
  }),
}));

vi.mock("@/services/api/guard", async (original) => {
  const actual = await original<typeof import("@/services/api/guard")>();

  return {
    ...actual,
    guard_setup_nonce: vi.fn(async () => ({
      data: {
        nonce: base64url_encode(new Uint8Array(32).fill(7)),
        expires_at: "2026-11-15T10:05:00Z",
      },
    })),
    guard_setup: vi.fn(async (body: Record<string, unknown>) => {
      h.setup_body = body;
      if (h.setup_result === "already_on") {
        return { error: "on", server_code: "GUARD_ALREADY_ON", status: 409 };
      }
      if (h.setup_result === "wrong") {
        return { error: "bad", server_code: "INVALID_CREDENTIALS", status: 401 };
      }
      if (h.setup_result === "upgrade") {
        return {
          error: "old",
          server_code: "CLIENT_UPGRADE_REQUIRED",
          status: 426,
        };
      }
      if (h.setup_result === "replayed") {
        return { error: "used", server_code: "TOTP_CODE_REPLAYED", status: 400 };
      }

      return {
        data: {
          device_id: "d1",
          code_secret_sealed: base64url_encode(new Uint8Array(8)),
          status: {},
        },
      };
    }),
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

    h.verify_key = pair.publicKey;
    const record = {
      key,
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
      sign: (message) => actual.sign_with_action_key(pair.privateKey, message),
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
    }),
    forget_guard_device: vi.fn(async (key: string) => {
      h.records.delete(key);
    }),
  };
});

import { GuardSetupWizard } from "@/components/guard/guard_setup_wizard";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
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

function button_with(text: string): HTMLButtonElement {
  const el = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );

  if (!el) throw new Error(`missing button ${text}`);

  return el;
}

function click(el: HTMLElement) {
  act(() => {
    el.click();
  });
}

function type_into(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function rescue_text(): string {
  return Array.from(by_test_id("guard_rescue_code").querySelectorAll("span"))
    .map((s) => s.textContent)
    .join("");
}

const on_changed = vi.fn();

function render_wizard(is_open = true) {
  act(() => {
    root.render(
      <GuardSetupWizard
        is_open={is_open}
        user_id="0f8fad5b-d9cb-469f-a165-70867728950e"
        on_changed={on_changed}
        on_close={() => undefined}
      />,
    );
  });
  const start = container.querySelector('[data-testid="guard_setup_start"]');

  if (start) click(start as HTMLElement);
}

async function go_to_confirm() {
  click(button_with("common.continue"));
  const code = rescue_text();

  click(by_test_id("guard_rescue_saved"));
  type_into(
    container.querySelector("#guard_rescue_group_0") as HTMLInputElement,
    code.slice(-5),
  );
  click(by_test_id("guard_rescue_continue"));
  await flush();

  return code;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.setup_body = null;
  h.setup_result = "ok";
  h.records.clear();
  on_changed.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("guard setup wizard", () => {
  it("opens on the intro and moves to the choices on start", () => {
    act(() => {
      root.render(
        <GuardSetupWizard
          is_open
          user_id="0f8fad5b-d9cb-469f-a165-70867728950e"
          on_changed={on_changed}
          on_close={() => undefined}
        />,
      );
    });
    expect(by_test_id("guard_setup_intro")).toBeTruthy();
    expect(container.querySelector('[data-testid="guard_hero"]')).toBeNull();
    expect(container.textContent).toContain("guard.intro_rescue_body");
    expect(by_test_id("guard_setup_who_for").textContent).toBe(
      "guard.setup_who_for",
    );
    expect(container.textContent).toContain("guard.intro_hold_timing_body");
    expect(container.querySelector('[data-testid="guard_setup_steps"]')).toBeNull();
    click(by_test_id("guard_setup_start"));
    expect(container.querySelector('[data-testid="guard_setup_intro"]')).toBeNull();
    expect(by_test_id("guard_setup_steps")).toBeTruthy();
  });

  it("warns that this browser becomes the only approved device", async () => {
    render_wizard();
    await go_to_confirm();
    const warning = by_test_id("guard_setup_only_device");

    expect(warning.textContent).toContain("guard.setup_only_device_warning");
    expect(warning.textContent).toContain("guard.setup_carry_device_tip");
  });

  it("explains a server failure and offers a retry", async () => {
    h.setup_result = "upgrade";
    render_wizard();
    await go_to_confirm();
    click(by_test_id("guard_setup_confirm"));
    await flush();

    expect(container.textContent).toContain("guard.error_upgrade");
    expect(by_test_id("guard_setup_confirm").textContent).toBe(
      "guard.setup_retry",
    );
    expect(h.records.size).toBe(0);
  });

  it("dims dependent toggles while the parent is off", () => {
    render_wizard();
    expect(by_label("guard.setup_hold_changes").checked).toBe(true);
    expect(container.textContent).not.toContain("guard.setup_scope_forwarding");
    expect(by_label("guard.setup_approve_mail_apps").disabled).toBe(false);

    click(by_label("guard.setup_approve_mail_apps"));
    expect(by_label("guard.setup_approve_mail_apps").checked).toBe(true);
    click(by_label("guard.setup_new_device_approval"));
    expect(by_label("guard.setup_approve_mail_apps").disabled).toBe(true);
    expect(by_label("guard.setup_approve_mail_apps").checked).toBe(false);
    click(by_label("guard.setup_new_device_approval"));
    expect(by_label("guard.setup_approve_mail_apps").checked).toBe(false);
  });

  it("keeps Continue disabled until the box is checked and the group matches", () => {
    render_wizard();
    click(button_with("common.continue"));
    const code = rescue_text();
    const next = by_test_id("guard_rescue_continue") as HTMLButtonElement;

    expect(code).toHaveLength(25);
    expect(next.disabled).toBe(true);
    click(by_test_id("guard_rescue_saved"));
    expect(next.disabled).toBe(true);
    const input = container.querySelector(
      "#guard_rescue_group_0",
    ) as HTMLInputElement;

    type_into(input, "ZZZZZ");
    expect(next.disabled).toBe(true);
    type_into(input, code.slice(-5).toLowerCase());
    expect(next.disabled).toBe(false);
  });

  it("submits the rescue code, bitmasks, nonce and a verifying Enroll signature", async () => {
    render_wizard();
    const code = await go_to_confirm();

    click(by_test_id("guard_setup_confirm"));
    await flush();

    const body = h.setup_body!;

    expect(body.rescue_code).toBe(code);
    expect(body.switches).toBe(
      GUARD_SWITCH.new_device_approval | GUARD_SWITCH.hold_changes,
    );
    expect(body.hold_scopes).toBe(GUARD_ALL_SCOPES);
    expect(body.hold_scopes).toBe(
      GUARD_SCOPE.forwarding_rules |
        GUARD_SCOPE.recovery_password |
        GUARD_SCOPE.security_export,
    );
    expect(body.proof).toEqual(h.proof);
    const device = body.device as Record<string, string>;

    expect(device.device_type).toBe("web");
    const message = build_action_message(
      GUARD_ACTION.enroll,
      "0f8fad5b-d9cb-469f-a165-70867728950e",
      base64url_decode(body.nonce as string),
      keys_digest(
        base64url_decode(device.ed25519_pk),
        base64url_decode(device.mlkem_pk),
        base64url_decode(device.x25519_pk),
        base64url_decode(device.action_pk),
      ),
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      h.verify_key!,
      base64url_decode(body.possession_signature as string),
      message,
    );

    expect(ok).toBe(true);
    expect(by_test_id("guard_code_card")).toBeTruthy();
    expect(on_changed).toHaveBeenCalled();
    expect(
      await (
        h.records.get("0f8fad5b-d9cb-469f-a165-70867728950e") as GuardDevice
      ).device_id(),
    ).toBe("d1");
  });

  it("shows the already-on message and refreshes status", async () => {
    h.setup_result = "already_on";
    render_wizard();
    await go_to_confirm();
    click(by_test_id("guard_setup_confirm"));
    await flush();

    expect(container.textContent).toContain("guard.setup_already_on");
    expect(on_changed).toHaveBeenCalled();
    expect(h.records.size).toBe(0);
  });

  it("says the password or code was wrong and lets the user retry", async () => {
    h.setup_result = "wrong";
    render_wizard();
    await go_to_confirm();
    click(by_test_id("guard_setup_confirm"));
    await flush();

    expect(container.textContent).toContain("guard.setup_wrong_credentials");
    expect(container.textContent).not.toContain("guard.setup_error");
    expect(by_test_id("guard_setup_confirm")).toBeTruthy();
    expect(h.records.size).toBe(0);
  });

  it("says the code was already used", async () => {
    h.setup_result = "replayed";
    render_wizard();
    await go_to_confirm();
    click(by_test_id("guard_setup_confirm"));
    await flush();

    expect(container.textContent).toContain("guard.setup_code_used");
  });

  it("lists each chosen protection as a settings row", async () => {
    render_wizard();
    await go_to_confirm();
    const summary = by_test_id("guard_setup_summary");

    expect(summary.textContent).toContain("guard.setup_new_device_approval");
    expect(summary.textContent).toContain("guard.setup_hold_changes");
    expect(summary.textContent).not.toContain("guard.setup_recovery_wait");
    expect(summary.textContent).toContain("guard.section_on");
  });

  it("never writes the rescue code to any storage", async () => {
    const seen: string[] = [];
    const record = (...args: unknown[]) => {
      seen.push(JSON.stringify(args));
    };
    const local = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(record);
    const put =
      typeof IDBObjectStore !== "undefined"
        ? vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(((
            ...args: unknown[]
          ) => {
            record(...args);

            return {} as IDBRequest;
          }) as never)
        : null;

    render_wizard();
    const code = await go_to_confirm();

    click(by_test_id("guard_setup_confirm"));
    await flush();
    render_wizard(false);
    await flush();

    expect(code).toHaveLength(25);
    for (const entry of seen) {
      expect(entry).not.toContain(code);
      expect(entry).not.toContain(code.slice(0, 10));
    }
    local.mockRestore();
    put?.mockRestore();
  });
});
