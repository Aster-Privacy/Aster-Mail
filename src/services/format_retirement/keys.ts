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
import type { LegacyDerivedKek } from "@/services/crypto/key_manager_core";

import { is_format_hard_refused } from "./record";

import { is_public_mail_kek } from "@/services/crypto/server_known_keys";

export function without_refused_public_keks(
  list: LegacyDerivedKek[] | undefined,
): LegacyDerivedKek[] | undefined {
  if (!list || !is_format_hard_refused("mail_public_kek")) return list;

  return list.filter((entry) => !is_public_mail_kek(entry.k));
}
