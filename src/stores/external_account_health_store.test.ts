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
import { afterEach, describe, expect, it } from "vitest";

import {
  clear_external_account_health,
  forget_external_account_problems,
  get_external_account_health,
  get_external_account_health_generation,
  has_published_external_account_health,
  publish_external_account_health,
} from "@/stores/external_account_health_store";

const KEY = "aster_external_account_problem_since";
const NOW = Date.parse("2026-10-25T12:00:00.000Z");

function account(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@example.org`,
    protocol: "imap",
    is_enabled: true,
    needs_reauth: false,
    last_sync_at: "2026-10-25T11:00:00.000Z",
    last_sync_status: "success",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot() {
  return get_external_account_health();
}

afterEach(() => {
  forget_external_account_problems();
  localStorage.clear();
});

describe("external account health store", () => {
  it("keeps only the fields the health view needs", () => {
    const full = { ...account("a"), label_name: "Work", email_count: 3 };

    publish_external_account_health([full], NOW);

    expect(Object.keys(snapshot()[0]).sort()).toEqual(
      [
        "created_at",
        "email",
        "id",
        "is_enabled",
        "last_sync_at",
        "last_sync_status",
        "needs_reauth",
        "problem_since",
        "protocol",
      ].sort(),
    );
  });

  it("remembers when a problem was first seen across later refreshes", () => {
    publish_external_account_health(
      [account("a", { last_sync_status: "error" })],
      NOW,
    );
    publish_external_account_health(
      [account("a", { last_sync_status: "syncing" })],
      NOW + 1000,
    );
    publish_external_account_health(
      [account("a", { last_sync_status: "error" })],
      NOW + 2000,
    );

    expect(snapshot()[0].problem_since).toBe(NOW);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({ a: NOW });
  });

  it("forgets the problem once the account recovers", () => {
    publish_external_account_health(
      [account("a", { needs_reauth: true })],
      NOW,
    );
    publish_external_account_health([account("a")], NOW + 1000);

    expect(snapshot()[0].problem_since).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();

    publish_external_account_health(
      [account("a", { needs_reauth: true })],
      NOW + 2000,
    );

    expect(snapshot()[0].problem_since).toBe(NOW + 2000);
  });

  it("ignores malformed stored values", () => {
    localStorage.setItem(KEY, JSON.stringify({ a: "x", b: -5 }));

    publish_external_account_health(
      [account("a", { last_sync_status: "error" })],
      NOW,
    );

    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({ a: NOW });
  });

  it("keeps another signed-in account's problems across an account switch", () => {
    publish_external_account_health(
      [account("a", { last_sync_status: "error" })],
      NOW,
    );
    clear_external_account_health();

    expect(snapshot()).toEqual([]);
    expect(has_published_external_account_health()).toBe(false);

    publish_external_account_health(
      [account("b", { needs_reauth: true })],
      NOW + 1000,
    );
    clear_external_account_health();
    publish_external_account_health(
      [account("a", { last_sync_status: "error" })],
      NOW + 2000,
    );

    expect(snapshot()[0].problem_since).toBe(NOW);
  });

  it("drops a list fetched before an account switch", () => {
    const stale = get_external_account_health_generation();

    clear_external_account_health();
    publish_external_account_health([account("a")], NOW, stale);

    expect(snapshot()).toEqual([]);
    expect(has_published_external_account_health()).toBe(false);
  });

  it("clears memory and storage on sign-out", () => {
    publish_external_account_health(
      [account("a", { last_sync_status: "error" })],
      NOW,
    );
    forget_external_account_problems();

    expect(snapshot()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
