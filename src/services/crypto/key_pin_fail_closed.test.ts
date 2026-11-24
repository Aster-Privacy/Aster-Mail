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
import { describe, expect, it } from "vitest";

import {
  create_encrypted_key_handle,
  verify_pinned_fingerprint,
} from "./key_manager_core";

describe("key fingerprint pins", () => {
  it("refuses a key that was never pinned", async () => {
    expect(await verify_pinned_fingerprint("never-pinned", "AA11")).toBe(false);
  });

  it("pins a handle when it is created", async () => {
    const handle = create_encrypted_key_handle(
      new Uint8Array(64),
      "BB22",
      "identity",
    );

    expect(await verify_pinned_fingerprint(handle.key_id, "BB22")).toBe(true);
    expect(await verify_pinned_fingerprint(handle.key_id, "CC33")).toBe(false);
  });
});
