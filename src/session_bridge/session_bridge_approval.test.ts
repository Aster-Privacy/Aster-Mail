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
import { describe, it, expect, vi } from "vitest";

import {
  APPROVAL_ARM_DELAY_MS,
  create_approval,
  mount_approval,
  type ApprovalDeps,
} from "./session_bridge_approval";

import {
  check_grant,
  type GrantStorage,
} from "@/lib/session_handoff/session_handoff_grant";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const AUDIENCE = "https://calendar.astermail.org";
const GRANT = "p".repeat(43);
const NOW = 1_800_000_000_000;

function setup(overrides: Partial<ApprovalDeps> = {}) {
  const entries: Record<string, string> = {};
  const storage: GrantStorage = {
    get: (key) => (key in entries ? entries[key] : null),
    set: (key, value) => {
      entries[key] = value;
    },
    remove: (key) => {
      delete entries[key];
    },
    keys: () => Object.keys(entries),
  };
  const clock = { now: NOW };
  const approval = create_approval({
    storage,
    now: () => clock.now,
    grant_id: GRANT,
    audience: AUDIENCE,
    user_id: USER_ID,
    ...overrides,
  });
  const status = () => check_grant(storage, GRANT, AUDIENCE, clock.now);

  return { approval, clock, status, entries };
}

const trusted = { isTrusted: true };

describe("create_approval", () => {
  it("approves only a trusted click after the arm delay", () => {
    const { approval, clock, status } = setup();

    expect(approval.approve(trusted)).toBe(false);
    clock.now += APPROVAL_ARM_DELAY_MS;
    expect(approval.approve({ isTrusted: false })).toBe(false);
    expect(status()).toEqual({ state: "pending" });
    expect(approval.approve(trusted)).toBe(true);
    expect(status()).toEqual({ state: "approved", user_id: USER_ID });
    expect(approval.is_decided()).toBe(true);
  });

  it("restarts the delay when rearmed", () => {
    const { approval, clock } = setup();

    clock.now += APPROVAL_ARM_DELAY_MS;
    approval.rearm();
    expect(approval.approve(trusted)).toBe(false);
    clock.now += APPROVAL_ARM_DELAY_MS;
    expect(approval.approve(trusted)).toBe(true);
  });

  it("cannot approve without a signed-in user", () => {
    const { approval, clock, status } = setup({ user_id: null });

    clock.now += APPROVAL_ARM_DELAY_MS;
    expect(approval.approve(trusted)).toBe(false);
    expect(status()).toEqual({ state: "pending" });
  });

  it("records a denial and decides only once", () => {
    const { approval, clock, status } = setup();

    expect(approval.deny()).toBe(true);
    expect(status()).toEqual({ state: "denied" });
    clock.now += APPROVAL_ARM_DELAY_MS;
    expect(approval.approve(trusted)).toBe(false);
    expect(approval.deny()).toBe(false);
    expect(status()).toEqual({ state: "denied" });
  });
});

describe("mount_approval", () => {
  const strings = {
    title: "Sign in?",
    body: "Body",
    continue_label: "Continue",
    cancel_label: "Cancel",
    done: "Done",
  };

  function buttons() {
    const [cancel, proceed] = Array.from(
      document.querySelectorAll("button"),
    ) as HTMLButtonElement[];

    return { cancel, proceed };
  }

  it("ignores a scripted click on Continue", () => {
    const { approval, clock, status } = setup();
    const on_finish = vi.fn();

    mount_approval(document, window, strings, approval, on_finish);
    clock.now += APPROVAL_ARM_DELAY_MS;
    buttons().proceed.click();

    expect(status()).toEqual({ state: "pending" });
    expect(on_finish).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Sign in?");
  });

  it("denies on Cancel and shows the closing message", () => {
    const { approval, status } = setup();
    const on_finish = vi.fn();

    mount_approval(document, window, strings, approval, on_finish);
    buttons().cancel.click();

    expect(status()).toEqual({ state: "denied" });
    expect(on_finish).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toBe("Done");
  });

  it("rearms when the window regains focus", () => {
    const approval = {
      approve: vi.fn(() => false),
      deny: vi.fn(() => true),
      rearm: vi.fn(),
      is_decided: vi.fn(() => false),
    };

    mount_approval(document, window, strings, approval, vi.fn());
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(approval.rearm).toHaveBeenCalled();
  });
});
