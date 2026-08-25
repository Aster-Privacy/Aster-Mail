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
import type { DraftType } from "@/services/api/multi_drafts";

export interface SignatureScopePreferences {
  signature_in_replies?: boolean;
  signature_in_forwards?: boolean;
}

export function signature_allowed_for_draft_type(
  preferences: SignatureScopePreferences,
  draft_type: DraftType,
): boolean {
  if (draft_type === "reply") {
    return preferences.signature_in_replies !== false;
  }

  if (draft_type === "forward") {
    return preferences.signature_in_forwards !== false;
  }

  return true;
}
