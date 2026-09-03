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
import { normalize_address_ignoring_dots } from "@/utils/address_dots";
import { sender_id_matches } from "@/lib/preferred_sender";

export const from_tier_draft = 0;
export const from_tier_thread = 1;
export const from_tier_external = 2;
export const from_tier_pinned = 3;
export const from_tier_fallback = 4;

export interface from_sender_candidate {
  id: string;
  email?: string;
  is_enabled?: boolean;
  type?: string;
}

export interface from_resolution_input<T extends from_sender_candidate> {
  options: T[];
  draft_from?: string | null;
  thread_addresses?: (string | null | undefined)[];
  prefer_external?: boolean;
  preferred_sender_id?: string | null;
}

export interface from_resolution<T extends from_sender_candidate> {
  option: T;
  tier: number;
}

function enabled_options<T extends from_sender_candidate>(options: T[]): T[] {
  return options.filter((o) => o.is_enabled !== false);
}

function find_by_address<T extends from_sender_candidate>(
  options: T[],
  address: string | null | undefined,
): T | undefined {
  const trimmed = address?.trim();

  if (!trimmed) return undefined;
  const normalized = normalize_address_ignoring_dots(trimmed);

  return options.find(
    (o) => !!o.email && normalize_address_ignoring_dots(o.email) === normalized,
  );
}

export function resolve_from_sender<T extends from_sender_candidate>(
  input: from_resolution_input<T>,
): from_resolution<T> | null {
  const options = enabled_options(input.options);

  if (options.length === 0) return null;

  const draft_match = find_by_address(options, input.draft_from);

  if (draft_match) return { option: draft_match, tier: from_tier_draft };

  for (const address of input.thread_addresses ?? []) {
    const match = find_by_address(options, address);

    if (match) return { option: match, tier: from_tier_thread };
  }

  if (input.prefer_external) {
    const external = options.find((o) => o.type === "external");

    if (external) return { option: external, tier: from_tier_external };
  }

  if (input.preferred_sender_id) {
    const pinned = options.find((o) =>
      sender_id_matches(o.id, input.preferred_sender_id as string),
    );

    if (pinned) return { option: pinned, tier: from_tier_pinned };
  }

  return { option: options[0], tier: from_tier_fallback };
}
