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

import { GUARD_ACTION, rescue_rotate_subject } from "@/lib/crypto/guard_action";

const h = vi.hoisted(() => ({
  proof: { type: "password", password_hash: "ph", totp_code: null } as Record<
    string,
    unknown
  > | null,
  sign_args: [] as unknown[][],
  rotate_body: null as Record<string, unknown> | null,
  mode: "applied" as "applied" | "held" | "error",
  changed: 0,
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

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/utils/copy_text", () => ({ copy_text: vi.fn(async () => true) }));

vi.mock("@/components/guard/use_guard_step_up", () => ({
  use_guard_step_up: () => ({
    request_proof: vi.fn(async () => h.proof),
    run: vi.fn(async (attempt: (proof: unknown) => Promise<unknown>) =>
      h.proof ? attempt(h.proof) : null,
    ),
    step_up_modal: null,
  }),
}));

vi.mock("@/services/guard/sign_action", () => ({
  sign_guard_action: vi.fn(async (...args: unknown[]) => {
    h.sign_args.push(args);

    return { nonce: "n", signature: "s", proof: args[4] ?? null };
  }),
}));

vi.mock("@/services/api/guard", () => ({
  rotate_guard_rescue_code: vi.fn(async (body: Record<string, unknown>) => {
    h.rotate_body = body;
    if (h.mode === "held") {
      return {
        data: undefined,
        status: 202,
        held: {
          id: "held-1",
          kind: "rescue_code_rotation",
          apply_after: "2026-11-18T10:00:00Z",
          skippable: true,
        },
      };
    }
    if (h.mode === "error") {
      return { data: undefined, error: "refused", status: 400 };
    }

    return { data: { status: "applied", id: "c1" } };
  }),
}));

import { GuardRescueRotateDialog } from "@/components/guard/guard_rescue_rotate_dialog";

const USER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const device = {} as GuardDevice;

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function by_test_id(id: string): HTMLElement {
  return container.querySelector(`[data-testid="${id}"]`) as HTMLElement;
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

function shown_code(): string {
  return Array.from(by_test_id("guard_rescue_code").querySelectorAll("span"))
    .map((s) => s.textContent)
    .join("");
}

function group_input(): HTMLInputElement {
  return container.querySelector("#guard_rescue_group_0") as HTMLInputElement;
}

function render(is_open = true) {
  act(() => {
    root.render(
      <GuardRescueRotateDialog
        device={device}
        is_open={is_open}
        user_id={USER_ID}
        on_changed={() => {
          h.changed++;
        }}
        on_close={() => undefined}
      />,
    );
  });
}

function confirm_code(): string {
  const code = shown_code();

  click(by_test_id("guard_rescue_saved"));
  type_into(group_input(), code.slice(-5));

  return code;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.proof = { type: "password", password_hash: "ph", totp_code: null };
  h.sign_args = [];
  h.rotate_body = null;
  h.mode = "applied";
  h.changed = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("rescue_rotate_subject", () => {
  it("binds the action code and the normalized code", () => {
    const a = rescue_rotate_subject("ABCDE23456FGHJK789MNPQRTV");
    const b = rescue_rotate_subject("ABCDE23456FGHJK789MNPQRTW");

    expect(a).toHaveLength(32);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(GUARD_ACTION.rotate_rescue).toBe(12);
  });
});

describe("GuardRescueRotateDialog", () => {
  it("keeps confirm disabled until the code is saved and the last group typed", () => {
    render();
    const confirm = by_test_id(
      "guard_rescue_rotate_confirm",
    ) as HTMLButtonElement;
    const code = shown_code();

    expect(code).toHaveLength(25);
    expect(confirm.disabled).toBe(true);
    click(by_test_id("guard_rescue_saved"));
    expect(confirm.disabled).toBe(true);
    type_into(group_input(), "ZZZZZ");
    expect(confirm.disabled).toBe(true);
    type_into(group_input(), code.slice(-5));
    expect(confirm.disabled).toBe(false);
  });

  it("signs rotate_rescue over the code subject and sends the normalized code", async () => {
    render();
    const code = confirm_code();

    click(by_test_id("guard_rescue_rotate_confirm"));
    await flush();

    expect(h.sign_args).toHaveLength(1);
    const [, user_id, action_code, subject, proof] = h.sign_args[0];

    expect(user_id).toBe(USER_ID);
    expect(action_code).toBe(GUARD_ACTION.rotate_rescue);
    expect(Array.from(subject as Uint8Array)).toEqual(
      Array.from(rescue_rotate_subject(code)),
    );
    expect(proof).toEqual(h.proof);
    expect(h.rotate_body?.rescue_code).toBe(code);
    expect(by_test_id("guard_rescue_rotate_done").textContent).toBe(
      "guard.rescue_rotate_applied",
    );
    expect(by_test_id("guard_rescue_code")).toBeNull();
    expect(h.changed).toBe(1);
  });

  it("shows when a held rotation takes effect", async () => {
    h.mode = "held";
    render();
    confirm_code();
    click(by_test_id("guard_rescue_rotate_confirm"));
    await flush();

    expect(by_test_id("guard_rescue_rotate_done").textContent).toMatch(
      /^guard\.rescue_rotate_held:/,
    );
    expect(h.changed).toBe(1);
  });

  it("keeps the code on screen and shows an error when the server refuses", async () => {
    h.mode = "error";
    render();
    const code = confirm_code();

    click(by_test_id("guard_rescue_rotate_confirm"));
    await flush();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "guard.rescue_rotate_error",
    );
    expect(shown_code()).toBe(code);
    expect(h.changed).toBe(0);
  });

  it("sends nothing when step-up is canceled", async () => {
    h.proof = null;
    render();
    confirm_code();
    click(by_test_id("guard_rescue_rotate_confirm"));
    await flush();

    expect(h.sign_args).toHaveLength(0);
    expect(h.rotate_body).toBeNull();
    expect(by_test_id("guard_rescue_rotate_done")).toBeNull();
  });

  it("shows a fresh code each time it opens", () => {
    render();
    const first = shown_code();

    render(false);
    render(true);
    expect(shown_code()).toHaveLength(25);
    expect(shown_code()).not.toBe(first);
  });
});
