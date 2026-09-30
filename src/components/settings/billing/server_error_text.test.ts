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

import { server_error_text } from "./server_error_text";

describe("server_error_text", () => {
  it("keeps a readable server sentence", () => {
    expect(
      server_error_text(
        "Your current subscription has an unpaid invoice.",
        "Payment failed",
      ),
    ).toBe("Your current subscription has an unpaid invoice.");
  });

  it("falls back for a sentinel code", () => {
    expect(server_error_text("change_failed", "Payment failed")).toBe(
      "Payment failed",
    );
  });

  it("falls back for a screaming snake code with spaces", () => {
    expect(server_error_text("CARD DECLINED", "Payment failed")).toBe(
      "Payment failed",
    );
  });

  it("falls back for empty and missing input", () => {
    expect(server_error_text("   ", "Payment failed")).toBe("Payment failed");
    expect(server_error_text(undefined, "Payment failed")).toBe(
      "Payment failed",
    );
  });

  it("falls back for an oversized body", () => {
    expect(server_error_text("a ".repeat(200), "Payment failed")).toBe(
      "Payment failed",
    );
  });
});
