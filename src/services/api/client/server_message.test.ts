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
import { describe, expect, it } from "vitest";

import {
  reads_as_user_prose,
  should_show_server_message,
} from "./server_message";

describe("should_show_server_message", () => {
  it("hides developer jargon from untyped validation failures", () => {
    for (const message of [
      "content_nonce must be 12 bytes",
      "encrypted content too large",
      "Alias limit reached",
      "too many conditions",
      "alias_id mismatch",
      "Invalid regex pattern",
      "expression: unexpected token",
    ]) {
      expect(should_show_server_message("VALIDATION_ERROR", message)).toBe(
        false,
      );
    }
  });

  it("keeps validation messages written for the reader", () => {
    for (const message of [
      "Please enter a valid domain name.",
      "That domain extension is not supported yet.",
    ]) {
      expect(should_show_server_message("VALIDATION_ERROR", message)).toBe(
        true,
      );
    }
  });

  it("leaves coded errors untouched", () => {
    expect(
      should_show_server_message(
        "TOTP_REQUIRED",
        "Enter the code from your authenticator app.",
      ),
    ).toBe(true);
    expect(should_show_server_message("USERNAME_IN_USE", "taken")).toBe(true);
    expect(should_show_server_message(undefined, "taken")).toBe(true);
  });

  it("keeps sentinel tokens the client branches on", () => {
    expect(
      should_show_server_message("VALIDATION_ERROR", "NOT_ACADEMIC_DOMAIN"),
    ).toBe(true);
  });

  it("rejects single words and unbounded text", () => {
    expect(reads_as_user_prose("Nope.")).toBe(false);
    expect(reads_as_user_prose("A".repeat(500))).toBe(false);
  });
});
