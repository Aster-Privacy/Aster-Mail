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
import type { MailLegacyMigrationProgress } from "@/services/crypto/mail_legacy_migration";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

function make_progress(
  overrides: Partial<MailLegacyMigrationProgress> = {},
): MailLegacyMigrationProgress {
  return {
    phase: "idle",
    processed: 0,
    rewritten: 0,
    skipped: 0,
    unreadable: 0,
    forced: false,
    ...overrides,
  } as MailLegacyMigrationProgress;
}

const h = vi.hoisted(() => ({
  progress: {} as MailLegacyMigrationProgress,
  listeners: new Set<() => void>(),
  retry: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: { count?: number }) =>
      params?.count === undefined ? key : `${key}:${params.count}`,
    language: "en",
  }),
}));

vi.mock("@/services/crypto/mail_legacy_migration", () => ({
  get_mail_legacy_migration_progress: () => h.progress,
  retry_mail_legacy_migration: h.retry,
  dismiss_mail_legacy_migration: h.dismiss,
  subscribe_mail_legacy_migration: (listener: () => void) => {
    h.listeners.add(listener);

    return () => h.listeners.delete(listener);
  },
}));

import { MailKeyUpgradeGate } from "./mail_key_upgrade_gate";

function publish(next: Partial<MailLegacyMigrationProgress>): void {
  act(() => {
    h.progress = make_progress(next);
    h.listeners.forEach((listener) => listener());
  });
}

describe("MailKeyUpgradeGate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    h.progress = make_progress();
    h.listeners.clear();
    h.retry.mockClear();
    h.dismiss.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function gate(): HTMLElement | null {
    return container.querySelector("[data-testid=mail-key-upgrade-gate]");
  }

  function button(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );
  }

  it("stays hidden while the pass runs silently", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "running", processed: 10, rewritten: 1 });

    expect(gate()).toBeNull();
  });

  it("shows progress with a way out while a forced pass runs", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "running", processed: 10, rewritten: 1, forced: true });

    expect(gate()).not.toBeNull();
    expect(container.textContent).toContain("common.mail_key_upgrade_running");

    const not_now = button("common.not_now");

    expect(not_now).toBeDefined();
    act(() => not_now?.click());
    expect(h.dismiss).toHaveBeenCalledTimes(1);
    expect(h.retry).not.toHaveBeenCalled();
  });

  it("offers a retry and a way out after a forced pass fails", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "failed", processed: 10, rewritten: 1, forced: true });

    expect(container.textContent).toContain("common.mail_key_upgrade_failed");
    act(() => button("common.mail_key_upgrade_retry")?.click());
    expect(h.retry).toHaveBeenCalledTimes(1);
    act(() => button("common.not_now")?.click());
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it("says how many messages were skipped when a pass fails", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "failed", processed: 10, skipped: 2, forced: true });

    expect(container.textContent).toContain(
      "common.mail_key_upgrade_skipped:2",
    );
  });

  it("closes on Escape", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "failed", processed: 10, forced: true });

    const dialog = container.querySelector("[role=alertdialog]");

    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it("tells the user about messages no key opens once the pass is done", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "done", processed: 10, unreadable: 3, forced: true });

    expect(container.textContent).toContain(
      "common.mail_key_upgrade_unreadable:3",
    );
    act(() => button("common.close")?.click());
    expect(h.dismiss).toHaveBeenCalledTimes(1);
  });

  it("goes away once the pass is done", () => {
    act(() => root.render(<MailKeyUpgradeGate />));
    publish({ phase: "failed", processed: 10, rewritten: 1, forced: true });
    publish({ phase: "done", processed: 10, rewritten: 1 });

    expect(gate()).toBeNull();
  });
});
