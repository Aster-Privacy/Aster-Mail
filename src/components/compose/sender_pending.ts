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
import { normalize_address_ignoring_dots } from "@/utils/address_dots";

export interface pending_sender_input {
  loading: boolean;
  chosen_by_user: boolean;
  draft_from?: string | null;
  selected_email?: string | null;
  thread_bound?: boolean;
  resolution_ready?: boolean;
  expected_email?: string | null;
}

function same_sender(left: string, right: string): boolean {
  return (
    normalize_address_ignoring_dots(left) ===
    normalize_address_ignoring_dots(right)
  );
}

export function sender_is_pending(input: pending_sender_input): boolean {
  if (input.chosen_by_user) return false;
  if (input.loading && input.thread_bound) return true;
  if (input.resolution_ready === false) return true;

  const selected = input.selected_email?.trim();
  const expected = input.expected_email?.trim();

  if (expected) {
    if (!selected) return true;
    if (!same_sender(selected, expected)) return true;
  }

  if (!input.loading) return false;
  if (!selected) return true;

  const draft_from = input.draft_from?.trim();

  if (!draft_from) return false;

  return !same_sender(selected, draft_from);
}
