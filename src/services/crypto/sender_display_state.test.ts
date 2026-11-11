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

import { displayed_sender_verification } from "./sent_encryption_evidence";

const received_outside = {
  is_received: true,
  is_external: true,
  has_recipient_key: true,
  e2e_verified: true,
};

describe("displayed_sender_verification", () => {
  it("reports an unchecked sender for decrypted mail from outside", () => {
    expect(displayed_sender_verification(received_outside)).toBe("no_keys");
  });

  it("treats an unknown status on outside mail as unchecked", () => {
    expect(
      displayed_sender_verification({
        ...received_outside,
        sender_verification: "unknown",
      }),
    ).toBe("no_keys");
  });

  it.each(["verified", "invalid", "unsigned", "no_keys"] as const)(
    "keeps a reported %s status",
    (status) => {
      expect(
        displayed_sender_verification({
          ...received_outside,
          sender_verification: status,
        }),
      ).toBe(status);
    },
  );

  it("adds nothing to mail between Aster accounts", () => {
    expect(
      displayed_sender_verification({
        is_received: true,
        is_external: false,
        e2e_verified: true,
      }),
    ).toBeUndefined();
  });

  it("adds nothing to outside mail that was not decrypted", () => {
    expect(
      displayed_sender_verification({
        ...received_outside,
        e2e_verified: false,
      }),
    ).toBeUndefined();
  });

  it("adds nothing to sent copies", () => {
    expect(
      displayed_sender_verification({
        ...received_outside,
        is_received: false,
      }),
    ).toBeUndefined();
    expect(
      displayed_sender_verification({
        is_received: true,
        is_external: true,
        sent_encryption_scope: "outside",
      }),
    ).toBeUndefined();
  });

  it("adds nothing when the direction is not known", () => {
    expect(
      displayed_sender_verification({
        is_external: true,
        has_recipient_key: true,
        e2e_verified: true,
      }),
    ).toBeUndefined();
  });
});
