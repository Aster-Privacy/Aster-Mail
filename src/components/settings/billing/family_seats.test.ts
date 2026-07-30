/*
 * Aster Communications Inc.
 *
 * Copyright (c) 2026 Aster Communications Inc.
 *
 * This file is part of this project.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from "vitest";
import { family_seat_usage } from "./family_seats";

const members = (active: number, grace = 0) => [
  ...Array.from({ length: active }, () => ({ status: "active" })),
  ...Array.from({ length: grace }, () => ({ status: "grace" })),
];

describe("family_seat_usage", () => {
  it("uses the backend seat total instead of the visible member count", () => {
    const usage = family_seat_usage({
      members: members(3),
      pending_invites: [{}],
      max_members: 6,
      seats_used: 5,
    });

    expect(usage.active_members).toBe(3);
    expect(usage.seats_used).toBe(5);
    expect(usage.seats_remaining).toBe(1);
    expect(usage.seats_full).toBe(false);
  });

  it("reports the group as full when reservations and invites consume every seat", () => {
    const usage = family_seat_usage({
      members: members(3),
      pending_invites: [{}, {}],
      max_members: 6,
      seats_used: 6,
    });

    expect(usage.seats_remaining).toBe(0);
    expect(usage.seats_full).toBe(true);
  });

  it("never reports negative remaining seats when the backend total overshoots", () => {
    const usage = family_seat_usage({
      members: members(6),
      pending_invites: [],
      max_members: 6,
      seats_used: 8,
    });

    expect(usage.seats_remaining).toBe(0);
    expect(usage.seats_full).toBe(true);
  });

  it("falls back to members plus pending invites when the backend omits the total", () => {
    const usage = family_seat_usage({
      members: members(2, 1),
      pending_invites: [{}],
      max_members: 6,
    });

    expect(usage.active_members).toBe(2);
    expect(usage.seats_used).toBe(3);
    expect(usage.seats_remaining).toBe(3);
  });

  it("excludes grace-period members from the visible roster count", () => {
    const usage = family_seat_usage({
      members: members(1, 4),
      pending_invites: [],
      max_members: 6,
      seats_used: 5,
    });

    expect(usage.active_members).toBe(1);
    expect(usage.seats_used).toBe(5);
  });
});
