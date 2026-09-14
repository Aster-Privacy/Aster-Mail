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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  changed: new Set<string>(),
  acknowledged: [] as string[],
  listeners: [] as Array<() => void>,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.email ? `${key}:${params.email}` : key,
  }),
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: (email: string) => email.endsWith("@astermail.org"),
}));

vi.mock("@/services/crypto/recipient_identity_check", () => ({
  has_recipient_identity_changed: vi.fn(async (email: string) =>
    h.changed.has(email),
  ),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  acknowledge_identity_change: vi.fn(async (email: string) => {
    h.acknowledged.push(email);
  }),
}));

vi.mock("@/services/crypto/ratchet_verification_status", () => ({
  subscribe_peer_identity_events: (listener: () => void) => {
    h.listeners.push(listener);

    return () => {
      h.listeners = h.listeners.filter((entry) => entry !== listener);
    };
  },
}));

import { RecipientIdentityNotice } from "@/components/compose/recipient_identity_notice";
import { has_recipient_identity_changed } from "@/services/crypto/recipient_identity_check";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function render(recipients: string[]) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(<RecipientIdentityNotice recipients={recipients} />);
  });
  mounted.push({ root, container });

  return { container, root };
}

beforeEach(() => {
  h.changed = new Set();
  h.acknowledged = [];
  h.listeners = [];
  vi.mocked(has_recipient_identity_changed).mockClear();
});

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("RecipientIdentityNotice", () => {
  it("warns about a recipient whose key changed", async () => {
    h.changed.add("alice@astermail.org");

    const { container } = await render([
      "Alice@astermail.org",
      "bob@astermail.org",
    ]);

    const notice = container.querySelector('[role="status"]');

    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain(
      "mail.recipient_identity_changed:alice@astermail.org",
    );
    expect(notice?.textContent).not.toContain("bob@astermail.org");
  });

  it("renders nothing when no key changed", async () => {
    const { container } = await render(["bob@astermail.org"]);

    expect(container.innerHTML).toBe("");
  });

  it("does not check external recipients", async () => {
    await render(["someone@example.com"]);

    expect(has_recipient_identity_changed).not.toHaveBeenCalled();
  });

  it("hides the warning and records the acknowledgement on dismiss", async () => {
    h.changed.add("alice@astermail.org");

    const { container } = await render(["alice@astermail.org"]);
    const button = container.querySelector("button");

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(h.acknowledged).toEqual(["alice@astermail.org"]);
  });

  it("rechecks when a new key change is reported", async () => {
    const { container } = await render(["alice@astermail.org"]);

    expect(container.querySelector('[role="status"]')).toBeNull();

    h.changed.add("alice@astermail.org");

    await act(async () => {
      h.listeners.forEach((listener) => listener());
    });

    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
