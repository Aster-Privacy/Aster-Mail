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
import { afterEach, describe, expect, it } from "vitest";

import {
  clear_sender_trust_context,
  safe_sender_name,
  set_trust_primary_address,
} from "./sender_trust_store";

describe("safe_sender_name", () => {
  afterEach(() => {
    set_trust_primary_address("");
    clear_sender_trust_context();
  });

  it("drops a name that shows a different address", () => {
    expect(safe_sender_name("support@paypal.com", "eve@evil.example")).toBe("");
  });

  it("drops a name that imitates a brand with lookalike letters", () => {
    expect(safe_sender_name("PaypaI Support", "eve@evil.example")).toBe("");
  });

  it("keeps an ordinary name", () => {
    expect(safe_sender_name("Jane Doe", "jane@company.example")).toBe(
      "Jane Doe",
    );
  });

  it("keeps a brand name on the brand's own domain", () => {
    expect(safe_sender_name("PayPal", "service@paypal.com")).toBe("PayPal");
  });

  it("keeps the name on the user's own address", () => {
    set_trust_primary_address("me@astermail.org");

    expect(safe_sender_name("Me", "me@astermail.org")).toBe("Me");
  });

  it("returns an empty string for a missing name", () => {
    expect(safe_sender_name(null, "jane@company.example")).toBe("");
    expect(safe_sender_name("", "jane@company.example")).toBe("");
  });
});
