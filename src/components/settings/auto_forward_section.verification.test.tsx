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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ is_feature_locked: () => false }),
}));

const toasts: Array<{ message: string; kind: string }> = [];

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (message: string, kind: string) => {
    toasts.push({ message, kind });
  },
}));

const list_forwarding_rules = vi.fn();
const resend_forwarding_confirmation = vi.fn();
const create_forwarding_rule = vi.fn();
const update_forwarding_rule = vi.fn();
const delete_forwarding_rule = vi.fn();
const bulk_delete_forwarding_rules = vi.fn();
const toggle_forwarding_rule = vi.fn();

vi.mock("@/services/api/auto_forward", () => ({
  list_forwarding_rules: (...args: unknown[]) => list_forwarding_rules(...args),
  resend_forwarding_confirmation: (...args: unknown[]) =>
    resend_forwarding_confirmation(...args),
  create_forwarding_rule: (...args: unknown[]) => create_forwarding_rule(...args),
  update_forwarding_rule: (...args: unknown[]) => update_forwarding_rule(...args),
  delete_forwarding_rule: (...args: unknown[]) => delete_forwarding_rule(...args),
  bulk_delete_forwarding_rules: (...args: unknown[]) =>
    bulk_delete_forwarding_rules(...args),
  toggle_forwarding_rule: (...args: unknown[]) => toggle_forwarding_rule(...args),
}));

const { AutoForwardSection } = await import("./auto_forward_section");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(element: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });

  return container;
}

function make_rule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    name: "Work",
    is_enabled: true,
    priority: 0,
    forward_to: ["someone@example.com"],
    keep_copy: true,
    conditions: [],
    forwarded_count: 0,
    last_forwarded_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    destinations: [
      {
        address: "someone@example.com",
        is_internal: false,
        confirmed: false,
        confirmation_sent_at: "2026-07-01T00:00:00Z",
      },
    ],
    pending_confirmation: true,
    ...overrides,
  };
}

beforeEach(() => {
  toasts.length = 0;
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/settings/sender_filters");
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("AutoForwardSection destination verification", () => {
  it("flags an unconfirmed external destination and offers a resend", async () => {
    list_forwarding_rules.mockResolvedValue({ data: [make_rule()] });
    resend_forwarding_confirmation.mockResolvedValue({
      data: { success: true, address: "someone@example.com" },
    });

    const view = await render(<AutoForwardSection />);

    expect(view.textContent).toContain(
      "settings.forwarding_pending_verification",
    );
    expect(view.textContent).toContain(
      "settings.forwarding_awaiting_verification:someone@example.com",
    );

    const resend = Array.from(view.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("settings.resend_verification_email"),
    );

    expect(resend).toBeTruthy();

    await act(async () => {
      resend!.click();
    });

    expect(resend_forwarding_confirmation).toHaveBeenCalledWith(
      "rule-1",
      "someone@example.com",
    );
    expect(
      toasts.some((toast) =>
        toast.message.includes("settings.forwarding_verification_resent"),
      ),
    ).toBe(true);
    expect(list_forwarding_rules).toHaveBeenCalledTimes(2);
  });

  it("shows no verification prompt when every destination is internal", async () => {
    list_forwarding_rules.mockResolvedValue({
      data: [
        make_rule({
          forward_to: ["friend@astermail.org"],
          pending_confirmation: false,
          destinations: [
            {
              address: "friend@astermail.org",
              is_internal: true,
              confirmed: true,
              confirmation_sent_at: null,
            },
          ],
        }),
      ],
    });

    const view = await render(<AutoForwardSection />);

    expect(view.textContent).not.toContain(
      "settings.forwarding_pending_verification",
    );
    expect(view.textContent).not.toContain(
      "settings.resend_verification_email",
    );
  });

  it("shows no verification prompt when the backend omits destinations", async () => {
    list_forwarding_rules.mockResolvedValue({
      data: [
        make_rule({ destinations: undefined, pending_confirmation: undefined }),
      ],
    });

    const view = await render(<AutoForwardSection />);

    expect(view.textContent).not.toContain(
      "settings.forwarding_pending_verification",
    );
  });

  it("reports the confirm redirect result and strips the query param", async () => {
    list_forwarding_rules.mockResolvedValue({ data: [] });
    window.history.replaceState(
      null,
      "",
      "/settings/sender_filters?forwarding_confirmed=true",
    );

    await render(<AutoForwardSection />);

    expect(
      toasts.some(
        (toast) => toast.message === "settings.forwarding_confirmed_success",
      ),
    ).toBe(true);
    expect(window.location.search).toBe("");
  });

  it("reports a failed confirmation", async () => {
    list_forwarding_rules.mockResolvedValue({ data: [] });
    window.history.replaceState(
      null,
      "",
      "/settings/sender_filters?forwarding_confirmed=false",
    );

    await render(<AutoForwardSection />);

    expect(
      toasts.some(
        (toast) => toast.message === "settings.forwarding_confirmed_failed",
      ),
    ).toBe(true);
  });
});
