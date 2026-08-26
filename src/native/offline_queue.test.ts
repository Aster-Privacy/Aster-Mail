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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  account_id: { value: "acct_a" as string | null },
  storage_unreadable: { value: false },
  update_item_metadata: vi.fn(async () => ({ success: true })),
  get_mail_item: vi.fn(async () => ({
    data: {
      encrypted_metadata: "meta",
      metadata_nonce: "nonce",
      metadata_version: 1,
    },
  })),
}));

vi.mock("./capacitor_bridge", () => ({
  is_native_platform: () => false,
  get_network_status: async () => ({ connected: true }),
}));

vi.mock("./haptic_feedback", () => ({
  haptic_notification: vi.fn(async () => {}),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => hoisted.account_id.value,
  accounts_storage_unreadable: () => hoisted.storage_unreadable.value,
}));

vi.mock("@/services/api/auth", () => ({
  is_authenticated: () => true,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: hoisted.get_mail_item,
  move_mail_item: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: hoisted.update_item_metadata,
}));

import {
  get_failed_actions,
  get_queue,
  initialize_offline_queue,
  process_offline_queue,
  retry_failed_actions,
} from "./offline_queue";

import { MAIL_EVENTS } from "@/hooks/mail_events";

const LEGACY_KEY = "aster_offline_queue";
const SCOPED_KEY_A = "aster_offline_queue:acct_a";
const SCOPED_KEY_B = "aster_offline_queue:acct_b";

function star_action(id: string, retry_count = 0) {
  return {
    id,
    type: "star",
    payload: { email_ids: ["mail_1"], starred: true },
    created_at: Date.now(),
    retry_count,
  };
}

describe("offline queue account scoping", () => {
  beforeEach(() => {
    localStorage.clear();
    hoisted.account_id.value = "acct_a";
    hoisted.update_item_metadata.mockClear();
    hoisted.update_item_metadata.mockResolvedValue({ success: true });
  });

  it("migrates the legacy unscoped queue to the current account key", async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([star_action("a1")]));

    const queue = await get_queue();

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("a1");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SCOPED_KEY_A) || "[]")).toHaveLength(
      1,
    );
  });

  it("does not read another account's queue", async () => {
    localStorage.setItem(SCOPED_KEY_B, JSON.stringify([star_action("b1")]));

    const queue = await get_queue();

    expect(queue).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(SCOPED_KEY_B) || "[]")).toHaveLength(
      1,
    );
  });

  it("falls back to the unscoped key when no account is active", async () => {
    hoisted.account_id.value = null;
    localStorage.setItem(LEGACY_KEY, JSON.stringify([star_action("l1")]));

    const queue = await get_queue();

    expect(queue).toHaveLength(1);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});

describe("offline queue replay events", () => {
  let mail_changed_events: number;
  let stats_stale_events: number;
  let failure_events: number;

  const on_mail_changed = () => {
    mail_changed_events++;
  };
  const on_stats_stale = () => {
    stats_stale_events++;
  };
  const on_failure = () => {
    failure_events++;
  };

  beforeEach(() => {
    localStorage.clear();
    hoisted.account_id.value = "acct_a";
    hoisted.update_item_metadata.mockClear();
    hoisted.update_item_metadata.mockResolvedValue({ success: true });
    mail_changed_events = 0;
    stats_stale_events = 0;
    failure_events = 0;
    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, on_mail_changed);
    window.addEventListener(MAIL_EVENTS.MAIL_STATS_STALE, on_stats_stale);
    window.addEventListener("offline-queue-failure", on_failure);
  });

  afterEach(() => {
    window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, on_mail_changed);
    window.removeEventListener(MAIL_EVENTS.MAIL_STATS_STALE, on_stats_stale);
    window.removeEventListener("offline-queue-failure", on_failure);
  });

  it("emits MAIL_CHANGED and MAIL_STATS_STALE after a successful replay", async () => {
    localStorage.setItem(SCOPED_KEY_A, JSON.stringify([star_action("a1")]));

    await process_offline_queue();

    expect(hoisted.update_item_metadata).toHaveBeenCalledTimes(1);
    expect(mail_changed_events).toBe(1);
    expect(stats_stale_events).toBe(1);
    expect(await get_queue()).toHaveLength(0);
  });

  it("emits MAIL_CHANGED when an action is dropped after max retries", async () => {
    hoisted.update_item_metadata.mockResolvedValue({ success: false });
    localStorage.setItem(SCOPED_KEY_A, JSON.stringify([star_action("a1", 2)]));

    await process_offline_queue();

    expect(mail_changed_events).toBe(1);
    expect(stats_stale_events).toBe(0);
    expect(failure_events).toBe(1);
    expect(await get_queue()).toHaveLength(0);
  });

  it("replays an action that was parked in the failed store", async () => {
    hoisted.update_item_metadata.mockResolvedValue({ success: false });
    localStorage.setItem(SCOPED_KEY_A, JSON.stringify([star_action("a1", 2)]));

    await process_offline_queue();

    expect(await get_failed_actions()).toHaveLength(1);

    hoisted.update_item_metadata.mockResolvedValue({ success: true });

    await retry_failed_actions();
    await vi.waitFor(async () => {
      expect(await get_queue()).toHaveLength(0);
    });

    expect(await get_failed_actions()).toHaveLength(0);
    expect(hoisted.update_item_metadata).toHaveBeenCalledTimes(2);
  });

  it("emits nothing when the queue is empty", async () => {
    await process_offline_queue();

    expect(mail_changed_events).toBe(0);
    expect(stats_stale_events).toBe(0);
  });
});

describe("offline queue web replay triggers", () => {
  beforeEach(() => {
    localStorage.clear();
    hoisted.account_id.value = "acct_a";
    hoisted.update_item_metadata.mockClear();
    hoisted.update_item_metadata.mockResolvedValue({ success: true });
  });

  it("drains the queue when the browser comes back online", async () => {
    await initialize_offline_queue();

    localStorage.setItem(SCOPED_KEY_A, JSON.stringify([star_action("w1")]));

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(async () => {
      expect(await get_queue()).toHaveLength(0);
    });
  });
});
