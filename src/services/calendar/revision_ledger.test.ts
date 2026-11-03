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
export type RevisionKind = "event" | "calendar";

import { afterEach, describe, expect, it } from "vitest";

import {
  accept_revision,
  is_rolled_back,
  known_revision,
  load_revisions,
  next_revision,
  observe_revision,
  release_revision,
  reset_revisions,
  settle_revision,
  take_revision_snapshot,
} from "./revision_ledger";

describe("revision_ledger", () => {
  afterEach(() => {
    reset_revisions();
  });

  it("accepts a conflict row older than a local bump but not older than the confirmed revision", () => {
    observe_revision("event", "e1", 100);
    const bumped = next_revision("event", "e1");

    expect(known_revision("event", "e1")).toBe(bumped);

    accept_revision("event", "e1", 150);
    expect(known_revision("event", "e1")).toBe(150);

    accept_revision("event", "e1", 120);
    expect(known_revision("event", "e1")).toBe(150);
    expect(is_rolled_back("event", "e1", 120)).toBe(true);
  });

  it("does not confirm an unacknowledged local write", () => {
    observe_revision("event", "e1", 100);
    const bumped = next_revision("event", "e1");

    observe_revision("event", "e1", bumped);
    accept_revision("event", "e1", 120);

    expect(known_revision("event", "e1")).toBe(120);
  });

  it("restores the confirmed revision when a local write is released", () => {
    observe_revision("event", "e1", 100);
    const bumped = next_revision("event", "e1");

    observe_revision("event", "e1", bumped);
    release_revision("event", "e1");

    expect(known_revision("event", "e1")).toBe(100);
    expect(is_rolled_back("event", "e1", 100)).toBe(false);
    expect(is_rolled_back("event", "e1", 99)).toBe(true);
  });

  it("forgets a revision that was only ever local when it is released", () => {
    next_revision("calendar", "c1");
    release_revision("calendar", "c1");

    expect(known_revision("calendar", "c1")).toBe(0);
  });

  it("confirms a settled write when the server copy is seen", () => {
    observe_revision("event", "e1", 100);
    const bumped = next_revision("event", "e1");

    settle_revision("event", "e1");
    observe_revision("event", "e1", bumped);
    release_revision("event", "e1");
    accept_revision("event", "e1", 150);

    expect(known_revision("event", "e1")).toBe(bumped);
  });

  it("keeps pending writes in the snapshot", () => {
    const bumped = next_revision("event", "e1");
    const snapshot = take_revision_snapshot();

    expect(snapshot?.event_pending).toEqual({ e1: bumped });

    reset_revisions();
    load_revisions(snapshot ?? {});
    observe_revision("event", "e1", bumped);
    release_revision("event", "e1");

    expect(known_revision("event", "e1")).toBe(0);
  });

  it("refuses to lower the ledger below a confirmed server revision", () => {
    observe_revision("calendar", "c1", 500);
    accept_revision("calendar", "c1", 400);

    expect(known_revision("calendar", "c1")).toBe(500);
  });

  it("persists confirmed revisions through a snapshot", () => {
    observe_revision("event", "e1", 200);
    next_revision("event", "e1");
    const snapshot = take_revision_snapshot();

    expect(snapshot?.event_confirmed).toEqual({ e1: 200 });

    reset_revisions();
    load_revisions(snapshot ?? {});
    accept_revision("event", "e1", 150);

    expect(known_revision("event", "e1")).toBeGreaterThan(200);
  });
});
