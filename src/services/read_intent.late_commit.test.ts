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
import type { InboxEmail } from "@/types/email";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  ack_flag_intents,
  apply_flag_intents,
  clear_all_flag_intents,
  note_flag_intents,
} from "@/services/read_intent";
import { merge_silent_refresh_emails } from "@/hooks/email_list_helpers/silent_refresh";
import { clear_removed_items } from "@/services/removed_items";

const BASE_NOW = 1_700_000_000_000;

function row(id: string, is_read: boolean, is_starred = false): InboxEmail {
  return { id, is_read, is_starred, is_selected: false } as InboxEmail;
}

describe("flag intents survive late list commits", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BASE_NOW);
    clear_all_flag_intents();
    clear_removed_items();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a saved read when a fetch right after the save reports unread", () => {
    note_flag_intents(["m1"], { is_read: true });
    vi.setSystemTime(BASE_NOW + 200);
    ack_flag_intents(["m1"], { is_read: true });

    const fetched_at = BASE_NOW + 300;

    vi.setSystemTime(BASE_NOW + 600);

    expect(apply_flag_intents([row("m1", false)], fetched_at)[0].is_read).toBe(
      true,
    );
    expect(apply_flag_intents([row("m1", false)], fetched_at)[0].is_read).toBe(
      true,
    );
  });

  it("lets the server value win once the save has settled", () => {
    note_flag_intents(["m1"], { is_read: true });
    ack_flag_intents(["m1"], { is_read: true });
    vi.setSystemTime(BASE_NOW + 6_000);

    expect(
      apply_flag_intents([row("m1", false)], BASE_NOW + 5_500)[0].is_read,
    ).toBe(false);
  });

  it("keeps a read made while a background refresh was in flight", () => {
    const started_at = BASE_NOW;
    const incoming = [row("m1", false), row("m2", false)];

    vi.setSystemTime(BASE_NOW + 50);
    note_flag_intents(["m1"], { is_read: true });

    const merged = merge_silent_refresh_emails(
      [row("m1", true), row("m2", false)],
      incoming,
      started_at,
    );

    expect(merged.map((email) => email.is_read)).toEqual([true, false]);
  });

  it("keeps a star made while a background refresh was in flight", () => {
    const started_at = BASE_NOW;

    vi.setSystemTime(BASE_NOW + 50);
    note_flag_intents(["m1"], { is_starred: true });

    const merged = merge_silent_refresh_emails(
      [row("m1", true, true)],
      [row("m1", true, false)],
      started_at,
    );

    expect(merged[0].is_starred).toBe(true);
  });
});
