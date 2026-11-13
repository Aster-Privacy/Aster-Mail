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
import { raise_sync_counter, read_sync_counter } from "./ratchet_sync_counter";
import { RATCHET_SYNC_FLOOR_PREFIX } from "./storage_key_names";

export function read_sync_floor(conversation_id: string): Promise<number> {
  return read_sync_counter(RATCHET_SYNC_FLOOR_PREFIX, conversation_id);
}

export function raise_sync_floor(
  conversation_id: string,
  sync_version: number,
): Promise<void> {
  return raise_sync_counter(
    RATCHET_SYNC_FLOOR_PREFIX,
    conversation_id,
    sync_version,
  );
}
