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

const SERVER_SEALED_ENVELOPE_MARKERS: ReadonlySet<number> = new Set([
  0x02, 0x03, 0x04, 0x05, 0x06,
]);

export function is_server_sealed_envelope_marker(
  marker: number | null | undefined,
): boolean {
  return (
    typeof marker === "number" && SERVER_SEALED_ENVELOPE_MARKERS.has(marker)
  );
}
