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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { PreloadedEmail } from "./preload_cache_store";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  await_preloaded_email,
  clear_preload_cache,
  get_preload_account_epoch,
  get_preload_cache,
  is_preloaded_email_fresh,
} from "./preload_cache_store";

import { MAIL_EVENTS } from "@/hooks/mail_events";

function seed_entry(time: number): PreloadedEmail {
  const entry = {
    mail_item: { id: "email_1", thread_token: "thread_1" },
    thread_cid_resolved: new Map(),
    time,
    is_stale: false,
    conversation_grouping: true,
    vault_account_epoch: get_preload_account_epoch(),
  } as unknown as PreloadedEmail;

  get_preload_cache().set("email_1", entry);

  return entry;
}

function announce_arrival(): void {
  window.dispatchEvent(
    new CustomEvent(MAIL_EVENTS.EMAIL_RECEIVED, {
      detail: { email_id: "email_2", sender: "", subject: "" },
    }),
  );
}

describe("preload freshness after new mail arrives", () => {
  beforeEach(() => {
    clear_preload_cache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats a recent entry as fresh while no mail has arrived", () => {
    const entry = seed_entry(Date.now() - 1_000);

    expect(is_preloaded_email_fresh(entry)).toBe(true);
  });

  it("treats an entry preloaded before new mail arrived as not fresh", () => {
    const entry = seed_entry(Date.now() - 1_000);

    announce_arrival();

    expect(is_preloaded_email_fresh(entry)).toBe(false);
  });

  it("treats an entry preloaded after the arrival as fresh", () => {
    announce_arrival();
    vi.advanceTimersByTime(10);
    const entry = seed_entry(Date.now());

    expect(is_preloaded_email_fresh(entry)).toBe(true);
  });

  it("does not hand a fresh-only viewer an entry that predates new mail", async () => {
    seed_entry(Date.now() - 1_000);

    announce_arrival();

    await expect(
      await_preloaded_email("email_1", true, { fresh_only: true }),
    ).resolves.toBeNull();
  });
});
