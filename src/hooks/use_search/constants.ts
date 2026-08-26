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

import { SNAPSHOT_CHUNK_SIZE } from "@/services/search_index_store";

export const ENVELOPE_FETCH_CHUNK = 100;
export const INDEX_PAGE_LIMIT = 500;
export const ENVELOPE_PAGE_LIMIT = 200;
export const HOT_CHUNK_COUNT = 6;
export const MAX_RAM_INDEX_ITEMS = HOT_CHUNK_COUNT * SNAPSHOT_CHUNK_SIZE;
export const MAX_INDEX_ITEMS = 1_000_000;
export const DEEP_SEGMENT_ITEMS = 10000;
export const DEEP_SEGMENT_PAUSE_MS = 1500;
export const MAX_SEARCH_RESULTS = 500;
export const INDEX_TTL_MS = 5 * 60 * 1000;
export const INDEX_TTL_MS_LOW_NETWORK = 20 * 60 * 1000;
