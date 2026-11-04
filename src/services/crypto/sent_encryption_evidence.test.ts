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
  build_sent_encryption_evidence,
  drop_sent_encryption_evidence,
  sent_copy_pgp_verified,
} from "./sent_encryption_evidence";

describe("build_sent_encryption_evidence", () => {
  it("counts every outside recipient that got an encrypted copy", () => {
    expect(
      build_sent_encryption_evidence({
        all_recipients: ["Pal@Example.com", "other@example.org"],
        outside_recipients: ["Pal@Example.com", "other@example.org"],
        client_copies: {
          "pal@example.com": "armored-1",
          "other@example.org": "armored-2",
        },
        internal_copy_is_encrypted: false,
      }),
    ).toEqual({ outside: 2, outside_pgp: 2, internal_readable: 0 });
  });

  it("counts an outside recipient without a copy as readable", () => {
    expect(
      build_sent_encryption_evidence({
        all_recipients: ["pal@example.com", "other@example.org"],
        outside_recipients: ["pal@example.com", "other@example.org"],
        client_copies: { "pal@example.com": "armored-1" },
        internal_copy_is_encrypted: true,
      }),
    ).toEqual({ outside: 2, outside_pgp: 1, internal_readable: 0 });
  });

  it("counts internal recipients whose copy was not encrypted", () => {
    expect(
      build_sent_encryption_evidence({
        all_recipients: ["pal@example.com", "friend@astermail.org"],
        outside_recipients: ["pal@example.com"],
        client_copies: { "pal@example.com": "armored-1" },
        internal_copy_is_encrypted: false,
      }),
    ).toEqual({ outside: 1, outside_pgp: 1, internal_readable: 1 });
  });

  it("deduplicates recipients listed twice", () => {
    expect(
      build_sent_encryption_evidence({
        all_recipients: ["pal@example.com", "PAL@example.com"],
        outside_recipients: ["pal@example.com", "PAL@example.com"],
        client_copies: { "pal@example.com": "armored-1" },
        internal_copy_is_encrypted: true,
      }),
    ).toEqual({ outside: 1, outside_pgp: 1, internal_readable: 0 });
  });

  it("ignores an empty copy", () => {
    expect(
      build_sent_encryption_evidence({
        all_recipients: ["pal@example.com"],
        outside_recipients: ["pal@example.com"],
        client_copies: { "pal@example.com": "" },
        internal_copy_is_encrypted: true,
      }),
    ).toEqual({ outside: 1, outside_pgp: 0, internal_readable: 0 });
  });
});

describe("sent_copy_pgp_verified", () => {
  it("is true only when every outside recipient got an encrypted copy", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 2, outside_pgp: 2, internal_readable: 0 },
      }),
    ).toBe(true);
  });

  it("is false for a mixed send", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 2, outside_pgp: 1, internal_readable: 0 },
      }),
    ).toBe(false);
  });

  it("is false when an internal copy went out readable", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 1, outside_pgp: 1, internal_readable: 1 },
      }),
    ).toBe(false);
  });

  it("is false for a send with no outside recipients", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 0, outside_pgp: 0, internal_readable: 0 },
      }),
    ).toBe(false);
  });

  it("is false for a legacy sent item without evidence", () => {
    expect(sent_copy_pgp_verified({ subject: "Old" })).toBe(false);
    expect(sent_copy_pgp_verified(null)).toBe(false);
    expect(sent_copy_pgp_verified(undefined)).toBe(false);
  });

  it("is false for malformed evidence", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: "2", outside_pgp: 2, internal_readable: 0 },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 1.5, outside_pgp: 1.5, internal_readable: 0 },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 1, outside_pgp: 1, internal_readable: -1 },
      }),
    ).toBe(false);
    expect(sent_copy_pgp_verified({ sent_encryption: true })).toBe(false);
  });
});

describe("drop_sent_encryption_evidence", () => {
  it("removes the evidence field", () => {
    const envelope = {
      subject: "s",
      sent_encryption: { outside: 1, outside_pgp: 1, internal_readable: 0 },
    };

    expect(drop_sent_encryption_evidence(envelope)).toEqual({ subject: "s" });
  });

  it("passes non-objects through", () => {
    expect(drop_sent_encryption_evidence(null)).toBeNull();
    expect(drop_sent_encryption_evidence("text")).toBe("text");
  });
});
