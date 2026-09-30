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
import { describe, it, expect } from "vitest";
import * as openpgp from "openpgp";

import {
  MAX_DECOMPRESSED_MESSAGE_SIZE,
  apply_openpgp_limits,
} from "@/services/crypto/openpgp_limits";
import { MAX_PAID_ATTACHMENT_SIZE } from "@/services/attachment_limits";

describe("openpgp limits", () => {
  it("caps decompressed message size above the largest attachment", () => {
    expect(MAX_DECOMPRESSED_MESSAGE_SIZE).toBeGreaterThan(
      MAX_PAID_ATTACHMENT_SIZE,
    );
    expect(MAX_DECOMPRESSED_MESSAGE_SIZE).toBeGreaterThanOrEqual(
      64 * 1024 * 1024,
    );
    expect(Number.isFinite(MAX_DECOMPRESSED_MESSAGE_SIZE)).toBe(true);
  });

  it("applies the cap to the openpgp config on import", () => {
    expect(openpgp.config.maxDecompressedMessageSize).toBe(
      MAX_DECOMPRESSED_MESSAGE_SIZE,
    );

    openpgp.config.maxDecompressedMessageSize = Infinity;
    apply_openpgp_limits();

    expect(openpgp.config.maxDecompressedMessageSize).toBe(
      MAX_DECOMPRESSED_MESSAGE_SIZE,
    );
  });
});
