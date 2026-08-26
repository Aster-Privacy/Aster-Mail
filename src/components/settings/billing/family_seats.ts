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

export interface SeatBreakdown {
  active_members: number;
  pending_invites: number;
  reserved_addresses: number;
}

export interface SeatSource {
  members: { status: string; role?: string }[];
  pending_invites: unknown[];
  max_members: number;
  seats_used?: number;
  seats?: SeatBreakdown;
}

export interface SeatUsage {
  active_members: number;
  seats_used: number;
  seats_remaining: number;
  seats_full: boolean;
  breakdown: SeatBreakdown | null;
}

export function seat_breakdown_total(breakdown: SeatBreakdown): number {
  return (
    breakdown.active_members +
    breakdown.pending_invites +
    breakdown.reserved_addresses
  );
}

export function family_seat_usage(group: SeatSource): SeatUsage {
  const active_members = group.members.filter(
    (m) => m.status === "active",
  ).length;
  const seats_used =
    typeof group.seats_used === "number"
      ? group.seats_used
      : active_members + group.pending_invites.length;

  return {
    active_members,
    seats_used,
    seats_remaining: Math.max(0, group.max_members - seats_used),
    seats_full: seats_used >= group.max_members,
    breakdown: group.seats ?? null,
  };
}
