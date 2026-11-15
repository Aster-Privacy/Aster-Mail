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
    user: { id: "u1" },
    switch_to_account: async () => undefined,
  }),
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
import { load_guard_requests } from "@/services/guard/guard_approval";

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
    expires_at: "2026-11-15T10:05:00Z",
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

  it("keeps the digits on a wrong number and signs a fresh challenge on retry", async () => {
    vi.mocked(api.approve_guard_request).mockResolvedValueOnce({
      error: "wrong",
      server_code: "GUARD_WRONG_NUMBER",
      status: 400,
    } as never);
    render(view());
    type_number("42");
    await click("guard.approve_confirm");

    expect(typed()).toBe("42");
    expect(container.textContent).toContain("guard.approve_wrong_number");
    expect(on_done).not.toHaveBeenCalled();

    type_number("57");
    await click("guard.approve_confirm");

    const nonces = vi
      .mocked(api.approve_guard_request)
      .mock.calls.map((c) => c[1].action.nonce);

    expect(api.guard_challenge).toHaveBeenCalledTimes(2);
    expect(new Set(nonces).size).toBe(2);
    expect(on_done).toHaveBeenCalledWith(REQUEST_ID);
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
      expect.objectContaining({ proof: null }),
    );
    expect(on_done).toHaveBeenCalledWith(REQUEST_ID);
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

  it("draws the country flag as an image before the place", async () => {
    const v = view();

    v.context = { ...v.context!, country_code: "de" };
    render(v);
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    const flag = container.querySelector('[data-testid="guard_flag"]');

    expect(flag?.tagName).toBe("IMG");
    expect(flag?.getAttribute("src")).toBeTruthy();
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
  });

  it("shows an unknown device when the context cannot be read", () => {
    render({ summary: summary(), context: null });
    expect(container.textContent).toContain("guard.approve_unknown_device");
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

    expect(device_module.get_guard_device).toHaveBeenCalledWith("u1");
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
});
