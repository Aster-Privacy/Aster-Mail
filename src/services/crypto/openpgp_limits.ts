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
import * as openpgp from "openpgp";

const LARGEST_ATTACHMENT_BYTES = 250 * 1024 * 1024;
const DECOMPRESSION_HEADROOM_BYTES = 16 * 1024 * 1024;

export const MAX_DECOMPRESSED_MESSAGE_SIZE =
  LARGEST_ATTACHMENT_BYTES + DECOMPRESSION_HEADROOM_BYTES;

export function apply_openpgp_limits(): void {
  openpgp.config.maxDecompressedMessageSize = MAX_DECOMPRESSED_MESSAGE_SIZE;
}

apply_openpgp_limits();
