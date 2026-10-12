//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  is_low_network: false,
  note_reaction_added: vi.fn(),
  note_reaction_removed: vi.fn(),
  note_reactions_seen: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    get_access_token: () => null,
    refresh_session: async () => {},
    is_authenticated: () => false,
  },
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => hoisted.is_low_network,
}));

vi.mock("@/hooks/email_list_cache", () => ({
  mark_view_stale: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct" },
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
  LOCKDOWN_CHANGED_EVENT: "astermail:lockdown-changed",
}));

vi.mock("@/services/unseen_reactions", () => ({
  note_reaction_added: (...a: unknown[]) => hoisted.note_reaction_added(...a),
  note_reaction_removed: (...a: unknown[]) =>
    hoisted.note_reaction_removed(...a),
  note_reactions_seen: (...a: unknown[]) => hoisted.note_reactions_seen(...a),
  ingest_unseen_reaction_flags: vi.fn(),
  reset_unseen_reactions: vi.fn(),
}));

import { sync_client } from "./sync_client";

import { MAIL_EVENTS } from "@/hooks/mail_events";

interface ReactionFrame {
  type: "new_reaction";
  mail_item_id: string;
  target_mail_item_id?: string | null;
  thread_token?: string | null;
  event?: string;
}

function deliver(frame: ReactionFrame): void {
  (
    sync_client as unknown as { handle_message: (f: ReactionFrame) => void }
  ).handle_message(frame);
}

describe("sync_client reaction events", () => {
  const seen: Record<string, unknown[]> = {};
  const listeners: Array<[string, (event: Event) => void]> = [];

  function count(name: string): number {
    return seen[name]?.length ?? 0;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.is_low_network = false;
    hoisted.note_reaction_added.mockReset();
    hoisted.note_reaction_removed.mockReset();
    hoisted.note_reactions_seen.mockReset();
    for (const name of [
      MAIL_EVENTS.REACTION_RECEIVED,
      MAIL_EVENTS.REACTIONS_CHANGED,
      MAIL_EVENTS.MAIL_SOFT_REFRESH,
      MAIL_EVENTS.MAIL_STATS_STALE,
    ]) {
      seen[name] = [];
      const listener = (event: Event) => {
        seen[name].push((event as CustomEvent).detail);
      };

      listeners.push([name, listener]);
      window.addEventListener(name, listener);
    }
  });

  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    for (const [name, listener] of listeners.splice(0)) {
      window.removeEventListener(name, listener);
    }
    sync_client.disconnect();
    vi.useRealTimers();
  });

  it("announces a reaction on the reacted-to message, not on the hidden reaction row", async () => {
    deliver({
      type: "new_reaction",
      mail_item_id: "r1",
      target_mail_item_id: "m1",
      thread_token: "t1",
      event: "added",
    });

    expect(hoisted.note_reaction_added).toHaveBeenCalledWith({
      reaction_id: "r1",
      target_id: "m1",
      thread_token: "t1",
    });
    expect(seen[MAIL_EVENTS.REACTION_RECEIVED]).toEqual([
      { reaction_id: "r1", target_id: "m1" },
    ]);
    expect(count(MAIL_EVENTS.REACTIONS_CHANGED)).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(count(MAIL_EVENTS.MAIL_SOFT_REFRESH)).toBe(1);
    expect(count(MAIL_EVENTS.MAIL_STATS_STALE)).toBe(1);
  });

  it("refreshes once for a burst of reactions", async () => {
    for (const id of ["r1", "r2", "r3"]) {
      deliver({
        type: "new_reaction",
        mail_item_id: id,
        target_mail_item_id: "m1",
        event: "added",
      });
    }
    await vi.advanceTimersByTimeAsync(1000);

    expect(count(MAIL_EVENTS.REACTION_RECEIVED)).toBe(3);
    expect(count(MAIL_EVENTS.MAIL_SOFT_REFRESH)).toBe(1);
  });

  it("does not notify for a reaction with no target", () => {
    deliver({ type: "new_reaction", mail_item_id: "r1", event: "added" });

    expect(count(MAIL_EVENTS.REACTION_RECEIVED)).toBe(0);
  });

  it("does not notify in low network mode", () => {
    hoisted.is_low_network = true;
    deliver({
      type: "new_reaction",
      mail_item_id: "r1",
      target_mail_item_id: "m1",
      event: "added",
    });

    expect(count(MAIL_EVENTS.REACTION_RECEIVED)).toBe(0);
    expect(hoisted.note_reaction_added).toHaveBeenCalled();
  });

  it("clears state without a notification when a reaction is removed", () => {
    deliver({ type: "new_reaction", mail_item_id: "r1", event: "removed" });

    expect(hoisted.note_reaction_removed).toHaveBeenCalledWith("r1");
    expect(count(MAIL_EVENTS.REACTION_RECEIVED)).toBe(0);
    expect(count(MAIL_EVENTS.REACTIONS_CHANGED)).toBe(1);
  });

  it("treats seen and hidden as silent state changes", () => {
    deliver({
      type: "new_reaction",
      mail_item_id: "r1",
      target_mail_item_id: "m1",
      thread_token: "t1",
      event: "seen",
    });
    deliver({
      type: "new_reaction",
      mail_item_id: "r2",
      target_mail_item_id: "m2",
      event: "hidden",
    });

    expect(hoisted.note_reactions_seen).toHaveBeenNthCalledWith(1, {
      target_id: "m1",
      thread_token: "t1",
    });
    expect(hoisted.note_reactions_seen).toHaveBeenNthCalledWith(2, {
      target_id: "m2",
      thread_token: undefined,
    });
    expect(count(MAIL_EVENTS.REACTION_RECEIVED)).toBe(0);
    expect(count(MAIL_EVENTS.REACTIONS_CHANGED)).toBe(0);
  });

  it("keeps the old silent behavior for a server that sends no event", async () => {
    deliver({ type: "new_reaction", mail_item_id: "r1" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(hoisted.note_reaction_added).not.toHaveBeenCalled();
    expect(count(MAIL_EVENTS.REACTION_RECEIVED)).toBe(0);
    expect(count(MAIL_EVENTS.REACTIONS_CHANGED)).toBe(1);
    expect(count(MAIL_EVENTS.MAIL_SOFT_REFRESH)).toBe(0);
  });
});
