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

import {
  ENABLE_PQXDH_TRANSCRIPT_BINDING,
  ENFORCE_AUTHENTICATED_RATCHET,
  is_pqxdh_transcript_binding_enabled,
} from "./crypto_enforcement_policy";

describe("crypto enforcement policy defaults", () => {
  it("binds the key agreement transcript by default", () => {
    expect(ENABLE_PQXDH_TRANSCRIPT_BINDING).toBe(true);
    expect(is_pqxdh_transcript_binding_enabled()).toBe(true);
  });

  it("keeps the authenticated ratchet enforced", () => {
    expect(ENFORCE_AUTHENTICATED_RATCHET).toBe(true);
  });
});
