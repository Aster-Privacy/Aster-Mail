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

import { settle_bundle_subject } from "./sealed_message_fields";

import { extract_reply_to } from "@/utils/reply_to";

function outer_envelope() {
  return {
    subject: "Outer subject",
    from: { name: "Outer", email: "alice@astermail.org" },
    raw_headers: [
      { name: "From", value: "alice@astermail.org" },
      { name: "Reply-To", value: "other@example.net" },
    ],
  };
}

describe("list envelopes for sealed mail", () => {
  it("drops the outer Reply-To when the bundle is sealed", () => {
    const envelope = outer_envelope();

    settle_bundle_subject(envelope, { subject: "Sealed subject", sealed: true });

    expect(extract_reply_to(envelope.raw_headers)).toBeUndefined();
    expect(envelope.raw_headers.map((h) => h.name)).toEqual(["From"]);
    expect(envelope.subject).toBe("Sealed subject");
  });

  it("drops it even when the sealed subject is missing", () => {
    const envelope = outer_envelope();

    settle_bundle_subject(envelope, { subject: null, sealed: true });

    expect(extract_reply_to(envelope.raw_headers)).toBeUndefined();
  });

  it("keeps Reply-To for mail that is not sealed", () => {
    const envelope = outer_envelope();

    settle_bundle_subject(envelope, { subject: "Plain", sealed: false });

    expect(extract_reply_to(envelope.raw_headers)?.email).toBe(
      "other@example.net",
    );
  });
});
