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
import type { GuardRequestSummary } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";
import type { GuardRequestView } from "@/services/guard/guard_approval";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { x25519 } from "@noble/curves/ed25519";

import { base64url_encode } from "@/lib/crypto/device_envelope";
import {
  approve_subject,
  build_action_message,
  GUARD_ACTION,
} from "@/lib/crypto/guard_action";
import { context_aad } from "@/lib/crypto/guard_seal";
import { device_code_digest } from "@/services/guard/device_code_approval";

const h = vi.hoisted(() => ({
  passphrase: "vault pass" as string | null,
  vault_listeners: [] as (() => void)[],
  proof: { type: "password", password_hash: "ph", totp_code: null } as {
    type: "password";
    password_hash: string;
    totp_code: null;
  } | null,
  nonce_counter: 0,
  switch_to_account: vi.fn(async (_id: string) => undefined),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/ui/modal", () => {
  const pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: pass,
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
    className,
    disabled,
    onClick,
    variant,
  }: {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button
      className={[variant ? `aster_btn_${variant}` : "", className ?? ""]
        .join(" ")
        .trim()}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/components/guard/guard_held_toast", () => ({
  GuardHeldToast: () => null,
  GuardPanicHost: () => null,
}));

vi.mock("@/components/guard/guard_rescue_banner", () => ({
  GuardRescueBanner: () => null,
  GuardSetupAfterRescue: () => null,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => {
    const { status: _status, ...rest } = props;

    return <input {...rest} />;
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: vi.fn(async () => h.proof),
    step_up_modal: null,
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    user: { id: "22222222-3333-4444-8555-666666666666" },
    accounts: [
      {
        id: "22222222-3333-4444-8555-666666666666",
        user: {
          id: "22222222-3333-4444-8555-666666666666",
          email: "first@astermail.org",
        },
      },
      { id: "u2", user: { id: "u2", email: "second@astermail.org" } },
    ],
    switch_to_account: h.switch_to_account,
  }),
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: ({
    is_open,
    title,
    message,
    confirm_text,
    cancel_text,
    on_confirm,
    on_cancel,
  }: {
    is_open: boolean;
    title: string;
    message: string;
    confirm_text?: string;
    cancel_text?: string | null;
    on_confirm: () => void;
    on_cancel: () => void;
  }) =>
    is_open ? (
      <div data-testid="guard_switch_prompt">
        <p>{title}</p>
        <p>{message}</p>
        <button type="button" onClick={on_confirm}>
          {confirm_text}
        </button>
        <button type="button" onClick={on_cancel}>
          {cancel_text}
        </button>
      </div>
    ) : null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => h.passphrase,
  on_vault_stored: (cb: () => void) => {
    h.vault_listeners.push(cb);

    return () => {
      h.vault_listeners = h.vault_listeners.filter((x) => x !== cb);
    };
  },
}));

vi.mock("@/services/api/guard", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/guard")>()),
  guard_challenge: vi.fn(async () => {
    h.nonce_counter += 1;

    return {
      data: {
        nonce: base64url_encode(new Uint8Array(32).fill(h.nonce_counter)),
        expires_at: "2026-11-15T10:05:00Z",
      },
    };
  }),
  guard_step_up_passkey_options: vi.fn(),
  approve_guard_request: vi.fn(async () => ({ data: { status: "approved" } })),
  deny_guard_request: vi.fn(async () => ({ data: { status: "denied" } })),
  list_guard_requests: vi.fn(async () => ({ data: { requests: [] } })),
}));

vi.mock("@/services/guard/guard_device", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/guard/guard_device")
  >()),
  get_guard_device: vi.fn(async () => null),
}));

import * as api from "@/services/api/guard";
import * as toast from "@/components/toast/simple_toast";
import * as device_module from "@/services/guard/guard_device";
import {
  GuardApprovalHost,
  GuardApprovalSheet,
} from "@/components/guard/guard_approval_sheet";
import { GUARD_REQUESTS_REFRESH_EVENT } from "@/components/guard/use_guard_requests";
import { load_guard_requests } from "@/services/guard/guard_approval";
import {
  emit_guard_event,
  reset_guard_events_for_tests,
} from "@/services/guard/guard_events";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "22222222-3333-4444-8555-666666666666";

function new_device_keys() {
  const mlkem = ml_kem768.keygen();
  const x_sk = x25519.utils.randomPrivateKey();
  const keys = {
    ed25519_pk: base64url_encode(new Uint8Array(32).fill(7)),
    mlkem_pk: base64url_encode(mlkem.publicKey),
    x25519_pk: base64url_encode(x25519.getPublicKey(x_sk)),
    action_pk: base64url_encode(new Uint8Array(33).fill(2)),
  };

  return {
    ...keys,
    device_type: "web" as const,
    name: "Firefox on Windows",
    keys_digest: base64url_encode(
      device_code_digest({ ...keys, keys_digest: undefined }),
    ),
  };
}

function summary(
  patch: Partial<GuardRequestSummary> = {},
): GuardRequestSummary {
  return {
    id: REQUEST_ID,
    kind: "sign_in",
    created_at: "2026-11-15T10:00:00Z",
    expires_at: "2099-11-15T10:05:00Z",
    context: base64url_encode(new Uint8Array([1, 2, 3])),
    new_device: new_device_keys(),
    envelope_versions: [2],
    ...patch,
  };
}

function view(patch: Partial<GuardRequestSummary> = {}): GuardRequestView {
  return {
    summary: summary(patch),
    context: {
      device_type: "web",
      browser: "Firefox",
      os: "Windows",
      city: "Berlin",
      country: "Germany",
      device_name: null,
      requested_at: "2026-11-15T10:00:00Z",
    },
  };
}

function fake_device(): GuardDevice & {
  sign: ReturnType<typeof vi.fn>;
  open_seal: ReturnType<typeof vi.fn>;
} {
  return {
    public_keys: vi.fn(),
    device_id: vi.fn(async () => "22222222-3333-4444-8555-666666666666"),
    set_device_id: vi.fn(),
    sign: vi.fn(async () => new Uint8Array(64).fill(9)),
    open_seal: vi.fn(async () =>
      new TextEncoder().encode(
        JSON.stringify({
          device_type: "web",
          browser: "Firefox",
          os: "Windows",
          city: "Berlin",
          country: "Germany",
          requested_at: "2026-11-15T10:00:00Z",
        }),
      ),
    ),
    open_envelope: vi.fn(),
    store_code_secret: vi.fn(),
    code_secret: vi.fn(async () => null),
    forget: vi.fn(),
  } as unknown as GuardDevice & {
    sign: ReturnType<typeof vi.fn>;
    open_seal: ReturnType<typeof vi.fn>;
  };
}

let container: HTMLDivElement;
let root: Root;
let device: ReturnType<typeof fake_device>;
let on_done: ReturnType<typeof vi.fn<(request_id: string) => void>>;

function render(v: GuardRequestView, finish_delay_ms = 0) {
  act(() => {
    root.render(
      <GuardApprovalSheet
        device={device}
        finish_delay_ms={finish_delay_ms}
        user_id={USER_ID}
        view={v}
        on_done={on_done}
      />,
    );
  });
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  );

  if (!found) throw new Error(`no button ${text}`);

  return found;
}

function number_input(): HTMLInputElement {
  return container.querySelector("#guard_approve_digit_0") as HTMLInputElement;
}

function typed(): string {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>("[id^=guard_approve_digit_]"),
  )
    .map((box) => box.value)
    .join("");
}

function type_number(value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(number_input(), value);
    number_input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(text: string) {
  await act(async () => {
    button(text).click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.passphrase = "vault pass";
  h.vault_listeners = [];
  h.proof = { type: "password", password_hash: "ph", totp_code: null };
  h.nonce_counter = 0;
  reset_guard_events_for_tests({ open_channel: () => null });
  device = fake_device();
  on_done = vi.fn<(request_id: string) => void>();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("GuardApprovalSheet", () => {
  it("keeps Approve disabled until two digits are typed", () => {
    render(view());
    expect(button("guard.approve_confirm").disabled).toBe(true);
    type_number("4");
    expect(button("guard.approve_confirm").disabled).toBe(true);
    type_number("4a2");
    expect(typed()).toBe("42");
    expect(button("guard.approve_confirm").disabled).toBe(false);
  });

  it("disables Approve once the request has expired", async () => {
    render(view({ expires_at: "2020-01-01T00:00:00Z" }));
    type_number("42");
    expect(button("guard.approve_confirm").disabled).toBe(true);
    await act(async () => {
      number_input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(api.approve_guard_request).not.toHaveBeenCalled();
  });

  it("approves with an envelope and a signature over the typed number", async () => {
    const v = view();

    render(v);
    type_number("42");
    await click("guard.approve_confirm");

    const digest = device_code_digest(v.summary.new_device);
    const call = vi.mocked(api.approve_guard_request).mock.calls[0];

    expect(call[0]).toBe(REQUEST_ID);
    expect(call[1].number).toBe(42);
    expect(call[1].approval_envelope.length).toBeGreaterThan(100);
    expect(call[1].action.proof).toEqual(h.proof);
    expect(device.sign).toHaveBeenCalledWith(
      build_action_message(
        GUARD_ACTION.approve,
        USER_ID,
        new Uint8Array(32).fill(1),
        approve_subject(REQUEST_ID, digest, 42),
      ),
    );
    expect(on_done).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("ends the request when the server rejects the number", async () => {
    vi.mocked(api.approve_guard_request).mockResolvedValueOnce({
      error: "wrong",
      server_code: "GUARD_WRONG_NUMBER",
      status: 403,
    } as never);
    render(view());
    type_number("42");
    await click("guard.approve_confirm");

    expect(container.textContent).toContain("guard.approve_number_rejected");
    expect(button("guard.approve_confirm").disabled).toBe(true);
    expect(number_input().disabled).toBe(true);
    expect(on_done).not.toHaveBeenCalled();

    await act(async () => {
      number_input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(api.approve_guard_request).toHaveBeenCalledTimes(1);
  });

  it("closes with the request ended message when the request is gone", async () => {
    vi.mocked(api.approve_guard_request).mockResolvedValueOnce({
      error: "gone",
      server_code: "GUARD_REQUEST_GONE",
      status: 410,
    } as never);
    render(view());
    type_number("42");
    await click("guard.approve_confirm");

    expect(toast.show_toast).toHaveBeenCalledWith(
      "guard.approve_request_ended",
      "info",
    );
    expect(on_done).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("sends nothing when the step-up is canceled", async () => {
    h.proof = null;
    render(view());
    type_number("42");
    await click("guard.approve_confirm");

    expect(api.guard_challenge).not.toHaveBeenCalled();
    expect(api.approve_guard_request).not.toHaveBeenCalled();
    expect(on_done).not.toHaveBeenCalled();
  });

  it("asks to unlock first and sends nothing until the vault is unlocked", async () => {
    h.passphrase = null;
    render(view());
    type_number("42");
    await click("guard.approve_confirm");

    expect(container.textContent).toContain("guard.approve_unlock_first");
    expect(api.guard_challenge).not.toHaveBeenCalled();
    expect(api.approve_guard_request).not.toHaveBeenCalled();

    h.passphrase = "vault pass";
    act(() => h.vault_listeners.forEach((cb) => cb()));
    expect(container.textContent).not.toContain("guard.approve_unlock_first");

    await click("guard.approve_confirm");
    expect(api.approve_guard_request).toHaveBeenCalledTimes(1);
  });

  it("refuses when the new device keys do not match the digest", async () => {
    const v = view();

    v.summary.new_device.keys_digest = base64url_encode(new Uint8Array(32));
    render(v);
    type_number("42");
    await click("guard.approve_confirm");

    expect(container.textContent).toContain("guard.approve_keys_changed");
    expect(api.approve_guard_request).not.toHaveBeenCalled();
  });

  it("uses the same flow and copy for a join request", async () => {
    render(view({ kind: "join" }));
    expect(container.textContent).toContain("guard.approve_title");
    type_number("42");
    await click("guard.approve_confirm");
    expect(api.approve_guard_request).toHaveBeenCalledTimes(1);
  });

  it("denies with a signature over the request id", async () => {
    render(view());
    await click("guard.approve_deny");

    expect(api.deny_guard_request).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({ proof: h.proof }),
    );
    expect(on_done).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("denies nothing when the step-up is dismissed", async () => {
    h.proof = null;
    render(view());
    await click("guard.approve_deny");

    expect(api.deny_guard_request).not.toHaveBeenCalled();
    expect(on_done).not.toHaveBeenCalled();
  });

  it("renders the decrypted context as text only", () => {
    const v = view();

    v.context = {
      ...v.context!,
      browser: '<img src="x" onerror="alert(1)">',
      city: "<b>Berlin</b>",
    };
    render(v);

    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain('<img src="x" onerror="alert(1)">');
    expect(container.textContent).toContain("<b>Berlin</b>");
  });

  it("draws the country flag as an inline vector before the place", async () => {
    const v = view();

    v.context = { ...v.context!, country_code: "de" };
    render(v);
    await vi.waitFor(
      async () => {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
        expect(
          container.querySelector('[data-testid="guard_flag"]'),
        ).not.toBeNull();
      },
      { timeout: 10000, interval: 20 },
    );
    const flag = container.querySelector('[data-testid="guard_flag"]');

    const src = flag?.getAttribute("src") ?? "";
    const prefix = "data:image/svg+xml;charset=utf-8,";
    const svg = new DOMParser()
      .parseFromString(decodeURIComponent(src.slice(prefix.length)), "image/svg+xml")
      .querySelector("svg");

    expect(flag?.tagName).toBe("IMG");
    expect(src.startsWith(prefix)).toBe(true);
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("18");
    expect(svg?.getAttribute("height")).toBe("12");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("none");
    expect(svg?.querySelector("script, foreignObject")).toBeNull();
    expect(flag?.nextElementSibling?.textContent).toBe("Berlin, Germany");
    expect(container.textContent).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    expect(container.textContent).not.toContain("DE");
  });

  it("puts the browser logo inline and one neutral glyph per row", () => {
    render(view());
    const rows = container.querySelectorAll(
      '[data-testid="guard_request_context"] > div',
    );

    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      const glyph = row.querySelector(":scope > [aria-hidden]");

      expect(glyph?.querySelectorAll("svg").length).toBe(1);
      expect(glyph?.className).toContain("text-txt-secondary");
    });
    const value = rows[0].querySelector("dd");

    expect(value?.querySelector("svg")).not.toBeNull();
    expect(value?.textContent).toContain("guard.approve_device");
  });

  it("uses the destructive button for Deny", () => {
    render(view());

    expect(button("guard.approve_deny").className).toContain(
      "aster_btn_depth_destructive",
    );
  });

  it("shows two labeled digit boxes and an expiry chip", () => {
    render(view());
    const boxes = container.querySelectorAll("[id^=guard_approve_digit_]");

    expect(boxes.length).toBe(2);
    expect(boxes[1].getAttribute("aria-label")).toBe(
      "guard.approve_number_label 2",
    );
    expect(
      container.querySelector('[data-testid="guard_approve_expiry"]'),
    ).not.toBeNull();
  });

  it("shows a confirmation before closing after an approval", async () => {
    render(view(), 60_000);
    type_number("42");
    await click("guard.approve_confirm");

    expect(
      container.querySelector('[data-testid="guard_approve_result_approved"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("guard.approve_approved_body");
    expect(on_done).not.toHaveBeenCalled();
    await click("common.done");
    expect(on_done).toHaveBeenCalledWith(REQUEST_ID);
  });

  it("shows a confirmation after a denial", async () => {
    render(view(), 60_000);
    await click("guard.approve_deny");

    expect(
      container.querySelector('[data-testid="guard_approve_result_denied"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("guard.approve_denied_body");
    expect(container.textContent).toContain("guard.panic_change_password");
    expect(on_done).not.toHaveBeenCalled();
  });

  it("names the device from the request when the context cannot be read", () => {
    render({ summary: summary(), context: null });
    expect(container.textContent).toContain("Firefox on Windows");
    expect(container.textContent).not.toContain("guard.approve_unknown_device");
  });

  it("shows an unknown device when nothing names it", () => {
    const s = summary();

    render({
      summary: { ...s, new_device: { ...s.new_device, name: null } },
      context: null,
    });
    expect(container.textContent).toContain("guard.approve_unknown_device");
  });

  it("hides the location row when the request has no location", () => {
    const v = view();

    render({
      ...v,
      context: {
        ...v.context!,
        browser: "Unknown",
        os: "Unknown",
        city: "",
        country: "Unknown",
      },
    });
    const rows = container.querySelectorAll(
      '[data-testid="guard_request_context"] > div',
    );

    expect(rows.length).toBe(2);
    expect(container.textContent).not.toContain("guard.approve_location_label");
    expect(container.textContent).not.toContain("guard.approve_unknown_location");
    expect(container.textContent).not.toContain("Unknown");
    expect(container.textContent).toContain("Firefox on Windows");
  });

  it("shows the sent device name only next to the browser and system", () => {
    const v = view();

    render({
      ...v,
      context: { ...v.context!, device_name: "Chrome on Windows" },
    });
    const row = container.querySelector(
      '[data-testid="guard_request_device"]',
    );

    expect(row?.textContent).toContain("guard.approve_device:Firefox,Windows");
    expect(row?.textContent).toContain(
      "guard.approve_device_named:Chrome on Windows",
    );
  });

  it("drops placeholder names and falls back to browser and system", () => {
    const v = view();

    render({
      ...v,
      context: { ...v.context!, device_name: "Unknown Device" },
    });
    expect(container.textContent).not.toContain("Unknown Device");
    expect(container.textContent).toContain(
      "guard.approve_device:Firefox,Windows",
    );
  });

  it("explains a Guard error instead of a generic failure", async () => {
    vi.mocked(api.approve_guard_request).mockResolvedValueOnce({
      error: "x",
      server_code: "GUARD_DEVICE_REQUIRED",
      status: 403,
    } as never);
    render(view());
    type_number("42");
    await click("guard.approve_confirm");

    expect(container.textContent).toContain("guard.error_device_required");
    expect(container.textContent).not.toContain("guard.approve_error");
  });

  it("explains an outdated app on deny", async () => {
    vi.mocked(api.deny_guard_request).mockResolvedValueOnce({
      error: "x",
      server_code: "CLIENT_UPGRADE_REQUIRED",
      status: 426,
    } as never);
    render(view());
    await click("guard.approve_deny");

    expect(container.textContent).toContain("guard.error_upgrade");
  });
});

describe("load_guard_requests", () => {
  it("opens each context with the request and device binding", async () => {
    const s = summary();

    vi.mocked(api.list_guard_requests).mockResolvedValueOnce({
      data: { requests: [s] },
    } as never);
    const views = await load_guard_requests(device);

    expect(device.open_seal).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      context_aad(REQUEST_ID, "22222222-3333-4444-8555-666666666666"),
    );
    expect(views[0].context?.city).toBe("Berlin");
  });

  it("falls back to no context when the seal does not open", async () => {
    device.open_seal.mockRejectedValueOnce(new Error("bad seal"));
    vi.mocked(api.list_guard_requests).mockResolvedValueOnce({
      data: { requests: [summary()] },
    } as never);
    const views = await load_guard_requests(device);

    expect(views[0].context).toBeNull();
  });
});

describe("GuardApprovalHost", () => {
  it("asks for nothing when this browser has no guard device", async () => {
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(device_module.get_guard_device).toHaveBeenCalledWith(USER_ID);
    expect(api.list_guard_requests).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("opens the sheet for the first pending request", async () => {
    vi.mocked(device_module.get_guard_device).mockResolvedValueOnce(device);
    vi.mocked(api.list_guard_requests).mockResolvedValueOnce({
      data: { requests: [summary()] },
    } as never);
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(
      container.querySelector('[data-testid="guard_approval_sheet"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Berlin, Germany");
  });

  it("keeps a settled sheet open after the request leaves the list", async () => {
    vi.mocked(device_module.get_guard_device)
      .mockResolvedValueOnce(device)
      .mockResolvedValueOnce(device);
    vi.mocked(api.list_guard_requests)
      .mockResolvedValueOnce({ data: { requests: [summary()] } } as never)
      .mockResolvedValueOnce({ data: { requests: [] } } as never);
    vi.mocked(api.approve_guard_request).mockResolvedValueOnce({
      error: "wrong",
      server_code: "GUARD_WRONG_NUMBER",
      status: 403,
    } as never);
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    type_number("42");
    await click("guard.approve_confirm");
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GUARD_REQUESTS_REFRESH_EVENT));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(api.list_guard_requests).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector('[data-testid="guard_approval_sheet"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("guard.approve_number_rejected");
  });

  it("asks before switching to another signed-in account", async () => {
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      emit_guard_event({
        event: "sign_in_request",
        id: REQUEST_ID,
        account_id: "u2",
      });
    });

    expect(h.switch_to_account).not.toHaveBeenCalled();
    const prompt = container.querySelector(
      '[data-testid="guard_switch_prompt"]',
    );

    expect(prompt).not.toBeNull();
    expect(prompt?.textContent).toContain(
      "guard.switch_account_message:second@astermail.org",
    );
    await act(async () => {
      button("guard.switch_account_confirm").click();
    });
    expect(h.switch_to_account).toHaveBeenCalledWith("u2");
  });

  it("drops the switch prompt when the request ends elsewhere", async () => {
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      emit_guard_event({
        event: "sign_in_request",
        id: REQUEST_ID,
        account_id: "u2",
      });
    });
    expect(
      container.querySelector('[data-testid="guard_switch_prompt"]'),
    ).not.toBeNull();
    await act(async () => {
      emit_guard_event({
        event: "sign_in_approved",
        id: REQUEST_ID,
        account_id: "u2",
      });
    });

    expect(
      container.querySelector('[data-testid="guard_switch_prompt"]'),
    ).toBeNull();
  });

  it("never opens an expired request", async () => {
    vi.mocked(device_module.get_guard_device).mockResolvedValueOnce(device);
    vi.mocked(api.list_guard_requests).mockResolvedValueOnce({
      data: { requests: [summary({ expires_at: "2020-01-01T00:00:00Z" })] },
    } as never);
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(
      container.querySelector('[data-testid="guard_approval_sheet"]'),
    ).toBeNull();
  });

  it("keeps a closed request closed when the list reloads", async () => {
    vi.mocked(device_module.get_guard_device)
      .mockResolvedValueOnce(device)
      .mockResolvedValueOnce(device);
    vi.mocked(api.list_guard_requests)
      .mockResolvedValueOnce({ data: { requests: [summary()] } } as never)
      .mockResolvedValueOnce({ data: { requests: [summary()] } } as never);
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await click("guard.approve_deny");
    await click("common.done");
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GUARD_REQUESTS_REFRESH_EVENT));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(
      container.querySelector('[data-testid="guard_approval_sheet"]'),
    ).toBeNull();
    expect(api.list_guard_requests).toHaveBeenCalledTimes(2);
  });

  it("does not switch when the prompt is dismissed", async () => {
    await act(async () => {
      root.render(<GuardApprovalHost />);
    });
    await act(async () => {
      emit_guard_event({
        event: "sign_in_request",
        id: REQUEST_ID,
        account_id: "u2",
      });
    });
    await act(async () => {
      button("common.not_now").click();
    });

    expect(h.switch_to_account).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="guard_switch_prompt"]'),
    ).toBeNull();
  });
});
