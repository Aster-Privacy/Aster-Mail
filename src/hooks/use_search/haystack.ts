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

import { build_search_haystack } from "./matching";
import type { DecryptedIndexEntry, SearchHaystack } from "./types";

const empty_haystack: SearchHaystack = {
  subject: "",
  sender_name: "",
  sender_email: "",
  contact: "",
  recipients: "",
};

export function entry_haystack(entry: DecryptedIndexEntry): SearchHaystack {
  if (entry.haystack) return entry.haystack;
  if (!entry.envelope) return empty_haystack;

  entry.haystack = build_search_haystack(entry.envelope);

  return entry.haystack;
}
