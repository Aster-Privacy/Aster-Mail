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
const open_reader_counts = new Map<string, number>();

export function register_open_reader(id: string): () => void {
  open_reader_counts.set(id, (open_reader_counts.get(id) ?? 0) + 1);

  return () => {
    const remaining = (open_reader_counts.get(id) ?? 1) - 1;

    if (remaining <= 0) {
      open_reader_counts.delete(id);

      return;
    }
    open_reader_counts.set(id, remaining);
  };
}

export function get_open_reader_ids(): Set<string> {
  return new Set(open_reader_counts.keys());
}
