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

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke_mock(...args),
}));

vi.mock("@/components/toast/toast_action_router", () => ({
  open_message_in_view_mode: vi.fn(),
}));

vi.mock("@/services/iconic_sounds", () => ({
  play_iconic_sound: vi.fn(),
}));

import {
  clear_desktop_notifications,
  clear_notification_state,
} from "@/services/notification_service";
import { LOCKDOWN_CHANGED_EVENT } from "@/services/lockdown_store";

function mark_desktop(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function clear_calls(): number {
  return invoke_mock.mock.calls.filter(
    ([command]) => command === "clear_mail_notifications",
  ).length;
}

describe("desktop notification clearing", () => {
  beforeEach(() => {
    invoke_mock.mockReset();
    invoke_mock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("does nothing outside the desktop app", async () => {
    await clear_desktop_notifications();
    clear_notification_state();
    window.dispatchEvent(new CustomEvent("astermail:session-timeout"));
    await settle();

    expect(invoke_mock).not.toHaveBeenCalled();
  });

  it("clears notifications when local data is wiped", async () => {
    mark_desktop();
    clear_notification_state();
    await settle();

    expect(clear_calls()).toBe(1);
  });

  it("clears notifications when the session times out", async () => {
    mark_desktop();
    window.dispatchEvent(new CustomEvent("astermail:session-timeout"));
    await settle();

    expect(clear_calls()).toBe(1);
  });

  it("clears notifications only when lockdown turns on", async () => {
    mark_desktop();
    window.dispatchEvent(
      new CustomEvent(LOCKDOWN_CHANGED_EVENT, {
        detail: { account_id: "acct-1", enabled: false },
      }),
    );
    await settle();
    expect(clear_calls()).toBe(0);

    window.dispatchEvent(
      new CustomEvent(LOCKDOWN_CHANGED_EVENT, {
        detail: { account_id: "acct-1", enabled: true },
      }),
    );
    await settle();
    expect(clear_calls()).toBe(1);
  });

  it("ignores a native failure", async () => {
    mark_desktop();
    invoke_mock.mockRejectedValue(new Error("history unavailable"));

    await expect(clear_desktop_notifications()).resolves.toBeUndefined();
  });
});
