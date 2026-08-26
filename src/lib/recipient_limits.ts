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

export const MAX_RECIPIENTS_PER_FIELD = 50;
export const MAX_RECIPIENTS_PER_SEND = 100;

export type RecipientLimitViolation = "field" | "total" | null;

export function recipient_limit_violation(
  to: readonly string[],
  cc: readonly string[],
  bcc: readonly string[],
): RecipientLimitViolation {
  if (
    to.length > MAX_RECIPIENTS_PER_FIELD ||
    cc.length > MAX_RECIPIENTS_PER_FIELD ||
    bcc.length > MAX_RECIPIENTS_PER_FIELD
  ) {
    return "field";
  }

  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS_PER_SEND) {
    return "total";
  }

  return null;
}
