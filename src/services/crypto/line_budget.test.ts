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
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const line_budget: Record<string, number> = {
  "x3dh.ts": 932,
  "key_manager_pgp_signing.ts": 331,
  "ratchet_prekey_bundle.ts": 383,
  "ratchet_identity_pin.ts": 1502,
  "sender_identity_authentication.ts": 663,
  "recipient_identity_check.ts": 389,
  "double_ratchet.ts": 1120,
  "ratchet_encrypt.ts": 1173,
  "ratchet_decrypt.ts": 2324,
  "aes_gcm_aad_fallback.ts": 66,
  "envelope.ts": 620,
  "sender_key_retirement.ts": 154,
};

const count_lines = (source: string): number =>
  source.split("\n").length - (source.endsWith("\n") ? 1 : 0);

describe("audited crypto files stay within their line budget", () => {
  for (const [file, budget] of Object.entries(line_budget)) {
    it(file, () => {
      const lines = count_lines(readFileSync(resolve(here, file), "utf-8"));

      expect(lines).toBeLessThanOrEqual(budget);
    });
  }
});
