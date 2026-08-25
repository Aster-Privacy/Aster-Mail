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
  MAX_RECIPIENTS_PER_FIELD,
  MAX_RECIPIENTS_PER_SEND,
  recipient_limit_violation,
} from "./recipient_limits";

function addresses(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `user_${i}@example.com`);
}

describe("recipient_limit_violation", () => {
  it("allows a message inside every limit", () => {
    expect(recipient_limit_violation(addresses(3), [], [])).toBeNull();
  });

  it("allows a field filled exactly to the limit", () => {
    expect(
      recipient_limit_violation(addresses(MAX_RECIPIENTS_PER_FIELD), [], []),
    ).toBeNull();
  });

  it("reports a field that holds one address too many", () => {
    expect(
      recipient_limit_violation(
        addresses(MAX_RECIPIENTS_PER_FIELD + 1),
        [],
        [],
      ),
    ).toBe("field");
  });

  it("reports an over-full cc field", () => {
    expect(
      recipient_limit_violation(
        [],
        addresses(MAX_RECIPIENTS_PER_FIELD + 1),
        [],
      ),
    ).toBe("field");
  });

  it("reports an over-full bcc field", () => {
    expect(
      recipient_limit_violation(
        [],
        [],
        addresses(MAX_RECIPIENTS_PER_FIELD + 1),
      ),
    ).toBe("field");
  });

  it("allows a message filled exactly to the total limit", () => {
    expect(
      recipient_limit_violation(
        addresses(MAX_RECIPIENTS_PER_FIELD),
        addresses(MAX_RECIPIENTS_PER_FIELD),
        [],
      ),
    ).toBeNull();
  });

  it("reports a total over the message limit with every field inside its own", () => {
    expect(
      recipient_limit_violation(
        addresses(MAX_RECIPIENTS_PER_FIELD),
        addresses(MAX_RECIPIENTS_PER_FIELD),
        addresses(1),
      ),
    ).toBe("total");
  });

  it("keeps the field limit at half the message limit", () => {
    expect(MAX_RECIPIENTS_PER_FIELD * 2).toBe(MAX_RECIPIENTS_PER_SEND);
  });
});
