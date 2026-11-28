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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  states: new Map<string, "unverified" | "verified" | "changed" | null>(),
  reads: [] as string[],
  listeners: [] as Array<(email: string) => void>,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: (email: string) => email.endsWith("@astermail.org"),
}));

vi.mock("@/services/crypto/safety_number_status", () => ({
  read_safety_number_state: vi.fn(async (email: string) => {
    h.reads.push(email);

    return h.states.has(email) ? h.states.get(email) : "unverified";
  }),
  subscribe_safety_number: (listener: (email: string) => void) => {
    h.listeners.push(listener);

    return () => {
      h.listeners = h.listeners.filter((item) => item !== listener);
    };
  },
}));

vi.mock("./safety_number_dialog", () => ({
  SafetyNumberDialog: ({ is_open }: { is_open: boolean }) =>
    is_open ? <div data-testid="safety_number_dialog" /> : null,
}));

vi.mock("@/components/ui/info_popover", () => ({
  InfoPopover: ({ title }: { title: string }) => (
    <button data-testid="info_popover" type="button">
      {title}
    </button>
  ),
}));

import { SafetyNumberSection } from "./safety_number_section";
import { SafetyNumberNotice } from "./safety_number_notice";

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactNode): Promise<void> {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function query(id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`);
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  h.states.clear();
  h.reads = [];
  h.listeners = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("safety number contact row", () => {
  it("shows not verified for an Aster contact", async () => {
    await render(
      <SafetyNumberSection emails={["bob@astermail.org"]} name="Bob" />,
    );

    const row = query("contact_view_row_safety_number");

    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("common.safety_number_not_verified");
    expect(query("info_popover")).toBeNull();
  });

  it("is hidden for an outside contact and never reads state", async () => {
    await render(
      <SafetyNumberSection emails={["bob@example.com"]} name="Bob" />,
    );

    expect(container.textContent).toBe("");
    expect(h.reads).toEqual([]);
  });

  it("is hidden when the state cannot be read", async () => {
    h.states.set("bob@astermail.org", null);
    await render(
      <SafetyNumberSection emails={["bob@astermail.org"]} name="Bob" />,
    );

    expect(container.textContent).toBe("");
  });

  it("uses the first Aster address of the contact", async () => {
    await render(
      <SafetyNumberSection
        emails={["bob@example.com", " Bob@astermail.org "]}
        name="Bob"
      />,
    );

    expect(h.reads).toEqual(["bob@astermail.org"]);
  });

  it("shows the info icon only when changed", async () => {
    h.states.set("bob@astermail.org", "changed");
    await render(
      <SafetyNumberSection emails={["bob@astermail.org"]} name="Bob" />,
    );

    expect(query("info_popover")).not.toBeNull();
    expect(container.textContent).toContain(
      "common.safety_number_status_changed",
    );
  });

  it("opens the dialog from the row but not from the info icon", async () => {
    h.states.set("bob@astermail.org", "changed");
    await render(
      <SafetyNumberSection emails={["bob@astermail.org"]} name="Bob" />,
    );

    await act(async () => query("info_popover")?.click());
    expect(query("safety_number_dialog")).toBeNull();

    await act(async () => query("contact_view_row_safety_number")?.click());
    expect(query("safety_number_dialog")).not.toBeNull();
  });

  it("refreshes when the contact's verification changes", async () => {
    await render(
      <SafetyNumberSection emails={["bob@astermail.org"]} name="Bob" />,
    );
    h.states.set("bob@astermail.org", "verified");
    await act(async () => {
      h.listeners.forEach((listener) => listener("bob@astermail.org"));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("common.safety_number_verified");
  });
});

describe("safety number header notice", () => {
  it("stays hidden for unverified and verified senders", async () => {
    h.states.set("bob@astermail.org", "unverified");
    await render(<SafetyNumberNotice email="bob@astermail.org" name="Bob" />);
    expect(query("safety_number_notice")).toBeNull();

    h.states.set("bob@astermail.org", "verified");
    await render(<SafetyNumberNotice email="bob@astermail.org" name="Bob" />);
    expect(query("safety_number_notice")).toBeNull();
  });

  it("stays hidden for outside senders and missing senders", async () => {
    h.states.set("bob@example.com", "changed");
    await render(<SafetyNumberNotice email="bob@example.com" name="Bob" />);
    expect(query("safety_number_notice")).toBeNull();

    await render(<SafetyNumberNotice email={null} name="Bob" />);
    expect(query("safety_number_notice")).toBeNull();
  });

  it("stays hidden when the state cannot be read", async () => {
    h.states.set("bob@astermail.org", null);
    await render(<SafetyNumberNotice email="bob@astermail.org" name="Bob" />);

    expect(query("safety_number_notice")).toBeNull();
  });

  it("shows the info icon for a verified sender whose key changed", async () => {
    h.states.set("bob@astermail.org", "changed");
    await render(<SafetyNumberNotice email="bob@astermail.org" name="Bob" />);

    expect(query("safety_number_notice")).not.toBeNull();
  });
});
