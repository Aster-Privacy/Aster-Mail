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
}

export function sender_is_pending(input: pending_sender_input): boolean {
  if (!input.loading || input.chosen_by_user) return false;

  const selected = input.selected_email?.trim();

  if (!selected) return true;

  const draft_from = input.draft_from?.trim();

  if (!draft_from) return false;

  return (
    normalize_address_ignoring_dots(selected) !==
    normalize_address_ignoring_dots(draft_from)
  );
}
