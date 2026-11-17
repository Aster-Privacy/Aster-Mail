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

import { PANIC_SUBJECT } from "@/lib/crypto/guard_action";

const USER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const FORWARD_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const RECOVERY_ID = "16fd2706-8baf-433b-82eb-8c7fada847da";
const RESCUE_ID = "886313e1-3b8a-4372-9b90-0c9aee199e5d";
const ODD_ID = "e3b0c442-98fc-4c14-9afb-f4c8996fb924";
const SWITCHES_ID = "c56a4180-65aa-42ec-a945-5fd21dec0538";

const h = vi.hoisted(() => ({
  changes: [] as {
    id: string;
    kind: string;
    apply_after: string;
    created_at: string;
  }[],
  cancelled: [] as string[],
  skipped: [] as { id: string; proof: unknown }[],
  proof: { type: "password", password_hash: "ph", totp_code: null } as unknown,
  proof_requests: 0,
  panic_calls: [] as { subject: Uint8Array; proof: unknown }[],
  panic_responses: [] as Record<string, unknown>[],
  settings_targets: [] as unknown[],
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
  }),
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

vi.mock("@/components/ui/modal", () => {
  const Pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: ({
      is_open,
      children,
    }: {
      is_open: boolean;
      children?: ReactNode;
    }) => (is_open ? <div>{children}</div> : null),
    ModalBody: Pass,
    ModalDescription: Pass,
    ModalFooter: Pass,
    ModalHeader: Pass,
    ModalTitle: Pass,
  };
});

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/lib/settings_links", () => ({
  SETTINGS_ANCHORS: { password: "sec-password", guard: "sec-guard" },
  open_settings_target: (target: unknown) => h.settings_targets.push(target),
}));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: async () => {
      h.proof_requests++;

      return h.proof;
    },
    step_up_modal: null,
  }),
}));

vi.mock("@/services/api/guard", () => ({
  list_guard_changes: async () => ({ data: { changes: h.changes } }),
  guard_panic: async (action: { proof: unknown }) => {
    h.panic_calls.push({ subject: PANIC_SUBJECT, proof: action.proof });

    return h.panic_responses.shift() ?? { error: "failed" };
  },
}));

vi.mock("@/services/guard/sign_action", () => ({
  sign_guard_action: async (
    _device: unknown,
    _user: string,
    _code: number,
    _subject: Uint8Array,
    proof: unknown = null,
  ) => ({ nonce: "n", signature: "s", proof }),
}));

vi.mock("@/services/guard/guard_changes", () => ({
  cancel_held_change: async (
    _d: unknown,
    _u: string,
    id: string,
    proof: unknown,
  ) => {
    if (!proof) throw new Error("missing proof");
    h.cancelled.push(id);

    return { data: { status: "cancelled" } };
  },
  skip_held_change: async (
    _d: unknown,
    _u: string,
    id: string,
    proof: unknown,
  ) => {
    h.skipped.push({ id, proof });

    return { data: { status: "applied" } };
  },
}));

import {
  GuardHeldChanges,
  hold_progress,
} from "@/components/guard/guard_held_changes";
import {
  GUARD_PANIC_OPEN_EVENT,
  GuardPanicDialog,
} from "@/components/guard/guard_panic_dialog";

const DEVICE = { id: "device" } as unknown as GuardDevice;
const LATER = new Date(Date.now() + 72 * 3600_000).toISOString();
const CREATED = new Date().toISOString();

let container: HTMLDivElement;
let root: Root;

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function click(test_id: string) {
  const el = container.querySelector(`[data-testid="${test_id}"]`);

  if (!el) throw new Error(`missing ${test_id}`);
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function has(test_id: string): boolean {
  return container.querySelector(`[data-testid="${test_id}"]`) !== null;
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.changes = [
    {
      id: FORWARD_ID,
      kind: "forwarding_change",
      apply_after: LATER,
      created_at: CREATED,
    },
    {
      id: RECOVERY_ID,
      kind: "account_recovery",
      apply_after: LATER,
      created_at: CREATED,
    },
    { id: RESCUE_ID, kind: "rescue", apply_after: LATER, created_at: CREATED },
    { id: ODD_ID, kind: "unknown", apply_after: LATER, created_at: CREATED },
    {
      id: SWITCHES_ID,
      kind: "guard_switches_off",
      apply_after: LATER,
      created_at: CREATED,
    },
  ];
  h.cancelled = [];
  h.skipped = [];
  h.proof_requests = 0;
  h.proof = { type: "password", password_hash: "ph", totp_code: null };
  h.panic_calls = [];
  h.panic_responses = [];
  h.settings_targets = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("GuardHeldChanges", () => {
  it("lists held changes with their kind and leaves switches to the panel", async () => {
    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );

    expect(container.textContent).toContain(
      "guard.held_kind_forwarding_change",
    );
    expect(container.textContent).toContain("guard.held_kind_account_recovery");
    expect(has(`guard_held_${SWITCHES_ID}`)).toBe(false);
  });

  it("hides Apply now for account recovery, rescue and unknown kinds", async () => {
    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );

    expect(has(`guard_held_skip_${FORWARD_ID}`)).toBe(true);
    expect(has(`guard_held_skip_${RECOVERY_ID}`)).toBe(false);
    expect(has(`guard_held_skip_${RESCUE_ID}`)).toBe(false);
    expect(has(`guard_held_skip_${ODD_ID}`)).toBe(false);
    expect(has(`guard_held_cancel_${RESCUE_ID}`)).toBe(true);
  });

  it("asks for a step-up before canceling a held change", async () => {
    const on_refresh = vi.fn();

    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={on_refresh}
      />,
    );
    await click(`guard_held_cancel_${FORWARD_ID}`);

    expect(h.cancelled).toEqual([FORWARD_ID]);
    expect(h.proof_requests).toBe(1);
    expect(on_refresh).toHaveBeenCalled();
  });

  it("cancels nothing when the step-up is dismissed", async () => {
    h.proof = null;
    await render(
      <GuardHeldChanges device={DEVICE} user_id={USER_ID} on_refresh={vi.fn()} />,
    );
    await click(`guard_held_cancel_${FORWARD_ID}`);

    expect(h.proof_requests).toBe(1);
    expect(h.cancelled).toEqual([]);
  });

  it("asks for a step-up before applying a change early", async () => {
    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );
    await click(`guard_held_skip_${FORWARD_ID}`);

    expect(h.proof_requests).toBe(1);
    expect(h.skipped).toEqual([{ id: FORWARD_ID, proof: h.proof }]);
  });

  it("does not apply early when the step-up is dismissed", async () => {
    h.proof = null;
    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );
    await click(`guard_held_skip_${FORWARD_ID}`);

    expect(h.skipped).toEqual([]);
  });

  it("shows no actions without an approver device", async () => {
    await render(
      <GuardHeldChanges
        device={null}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );

    expect(has(`guard_held_cancel_${FORWARD_ID}`)).toBe(false);
    expect(has(`guard_held_not_me_${FORWARD_ID}`)).toBe(true);
  });

  it("opens This wasn't me from a held row", async () => {
    const opened = vi.fn();

    window.addEventListener(GUARD_PANIC_OPEN_EVENT, opened);
    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );
    await click(`guard_held_not_me_${FORWARD_ID}`);
    window.removeEventListener(GUARD_PANIC_OPEN_EVENT, opened);

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when no change is held", async () => {
    h.changes = [];
    await render(
      <GuardHeldChanges
        device={DEVICE}
        user_id={USER_ID}
        on_refresh={() => {}}
      />,
    );

    expect(has("guard_held_changes")).toBe(false);
    expect(has("guard_held_empty")).toBe(true);
    expect(container.textContent).toContain("guard.held_empty_body");
  });

  it("measures how much of the hold has passed", () => {
    const change = {
      id: "c",
      kind: "forwarding_change" as const,
      created_at: "2026-11-15T00:00:00Z",
      apply_after: "2026-11-15T10:00:00Z",
    };

    expect(
      hold_progress(change, Date.parse("2026-11-15T05:00:00Z")),
    ).toBeCloseTo(0.5);
    expect(hold_progress(change, Date.parse("2026-11-16T00:00:00Z"))).toBe(1);
    expect(hold_progress({ ...change, created_at: "bad" }, 0)).toBe(0);
  });
});

describe("GuardPanicDialog", () => {
  const RESULT = {
    signed_out_sessions: 3,
    removed_devices: 1,
    cancelled_changes: 2,
    can_reset_password_now: true,
  };

  it("signs Panic and shows the three counts", async () => {
    h.panic_responses = [{ data: RESULT }];
    await render(
      <GuardPanicDialog
        device={DEVICE}
        is_open
        user_id={USER_ID}
        on_close={() => {}}
      />,
    );
    await click("guard_panic_confirm");

    expect(h.proof_requests).toBe(1);
    expect(h.panic_calls).toHaveLength(1);
    expect(h.panic_calls[0].proof).toEqual(h.proof);
    expect(
      container.querySelector('[data-testid="guard_panic_sessions"]')
        ?.textContent,
    ).toContain("3");
    expect(
      container.querySelector('[data-testid="guard_panic_devices"]')
        ?.textContent,
    ).toContain("1");
    expect(
      container.querySelector('[data-testid="guard_panic_changes"]')
        ?.textContent,
    ).toContain("2");
  });

  it("sends nothing when the step-up is canceled", async () => {
    h.proof = null;
    h.panic_responses = [{ data: RESULT }];
    await render(
      <GuardPanicDialog
        device={DEVICE}
        is_open
        user_id={USER_ID}
        on_close={() => {}}
      />,
    );
    await click("guard_panic_confirm");

    expect(h.proof_requests).toBe(1);
    expect(h.panic_calls).toHaveLength(0);
  });

  it("offers Change password only when the server allows it now", async () => {
    const on_close = vi.fn();

    h.panic_responses = [{ data: RESULT }];
    await render(
      <GuardPanicDialog
        device={DEVICE}
        is_open
        user_id={USER_ID}
        on_close={on_close}
      />,
    );
    await click("guard_panic_confirm");
    await click("guard_panic_change_password");

    expect(on_close).toHaveBeenCalled();
    expect(h.settings_targets).toEqual([
      { section: "security", anchor: "sec-password" },
    ]);
  });

  it("hides Change password for a newer device", async () => {
    h.panic_responses = [
      { data: { ...RESULT, can_reset_password_now: false } },
    ];
    await render(
      <GuardPanicDialog
        device={DEVICE}
        is_open
        user_id={USER_ID}
        on_close={() => {}}
      />,
    );
    await click("guard_panic_confirm");

    expect(has("guard_panic_change_password")).toBe(false);
    expect(container.textContent).toContain("guard.panic_password_later");
  });
});
