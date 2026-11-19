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

import type { EncryptedVault } from "./key_manager_core";

export const RETIRED_STORAGE_HASHES_FIELD = "retired_storage_key_hashes";

const MAX_RETIRED_STORAGE_HASHES = 256;

function hashes_of(vault: EncryptedVault | null | undefined): string[] {
  const value = vault?.retired_storage_key_hashes;

  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
}

export function merge_retired_storage_hashes(
  ...vaults: (EncryptedVault | null | undefined)[]
): string[] | undefined {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const vault of vaults) {
    for (const hash of hashes_of(vault)) {
      if (seen.has(hash)) continue;
      seen.add(hash);
      merged.push(hash);
    }
  }

  return merged.length
    ? merged.slice(0, MAX_RETIRED_STORAGE_HASHES)
    : undefined;
}

export function with_retired_storage_hashes(
  target: EncryptedVault,
  ...sources: (EncryptedVault | null | undefined)[]
): EncryptedVault {
  const merged = merge_retired_storage_hashes(target, ...sources);

  if (merged) {
    target.retired_storage_key_hashes = merged;
  }

  return target;
}
