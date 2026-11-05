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
  as_sent_encryption_scope,
  drop_sent_encryption_evidence,
  reaches_outside_recipients,
  read_sent_encryption_evidence,
  sent_copy_encryption_scope,
  sent_copy_pgp_verified,
  shows_end_to_end,
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

  it("is true for an encrypted send with no outside recipients", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 0, outside_pgp: 0, internal_readable: 0 },
      }),
    ).toBe(true);
  });

  it("is false for an internal send whose copy went out readable", () => {
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 0, outside_pgp: 0, internal_readable: 2 },
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
        sent_encryption: {
          outside: 1.5,
          outside_pgp: 1.5,
          internal_readable: 0,
        },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 1, outside_pgp: 1, internal_readable: -1 },
      }),
    ).toBe(false);
    expect(sent_copy_pgp_verified({ sent_encryption: true })).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 1, outside_pgp: 2, internal_readable: 0 },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: {
          outside: 1e30,
          outside_pgp: 1e30,
          internal_readable: 0,
        },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: { outside: 1, outside_pgp: 1 },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: {
          outside: null,
          outside_pgp: 0,
          internal_readable: 0,
        },
      }),
    ).toBe(false);
    expect(
      sent_copy_pgp_verified({
        sent_encryption: {
          outside: true,
          outside_pgp: true,
          internal_readable: false,
        },
      }),
    ).toBe(false);
  });
});

describe("read_sent_encryption_evidence", () => {
  it("accepts counts up to the recipient limit", () => {
    expect(
      read_sent_encryption_evidence({
        sent_encryption: {
          outside: 100_000,
          outside_pgp: 100_000,
          internal_readable: 0,
        },
      }),
    ).toEqual({ outside: 100_000, outside_pgp: 100_000, internal_readable: 0 });
    expect(
      read_sent_encryption_evidence({
        sent_encryption: {
          outside: 100_001,
          outside_pgp: 0,
          internal_readable: 0,
        },
      }),
    ).toBeNull();
  });
});

describe("sent_copy_encryption_scope", () => {
  it("reports whether a verified send reached outside recipients", () => {
    expect(
      sent_copy_encryption_scope({
        sent_encryption: { outside: 0, outside_pgp: 0, internal_readable: 0 },
      }),
    ).toBe("internal");
    expect(
      sent_copy_encryption_scope({
        sent_encryption: { outside: 3, outside_pgp: 3, internal_readable: 0 },
      }),
    ).toBe("outside");
  });

  it("is undefined when the send was not end-to-end", () => {
    expect(
      sent_copy_encryption_scope({
        sent_encryption: { outside: 3, outside_pgp: 2, internal_readable: 0 },
      }),
    ).toBeUndefined();
    expect(sent_copy_encryption_scope({ subject: "Old" })).toBeUndefined();
  });
});

describe("as_sent_encryption_scope", () => {
  it("accepts only known scopes", () => {
    expect(as_sent_encryption_scope("internal")).toBe("internal");
    expect(as_sent_encryption_scope("outside")).toBe("outside");
    expect(as_sent_encryption_scope("everything")).toBeUndefined();
    expect(as_sent_encryption_scope(true)).toBeUndefined();
    expect(as_sent_encryption_scope(undefined)).toBeUndefined();
  });
});

describe("shows_end_to_end", () => {
  it("shows a verified sent copy as end-to-end whatever the server flags say", () => {
    expect(
      shows_end_to_end({
        is_external: true,
        has_recipient_key: false,
        e2e_verified: true,
        sent_encryption_scope: "internal",
      }),
    ).toBe(true);
    expect(
      shows_end_to_end({
        is_external: true,
        has_recipient_key: false,
        e2e_verified: false,
        sent_encryption_scope: "outside",
      }),
    ).toBe(true);
  });

  it("keeps outside mail without a recipient key in transit", () => {
    expect(
      shows_end_to_end({
        is_external: true,
        has_recipient_key: false,
        e2e_verified: true,
      }),
    ).toBe(false);
  });

  it("requires verification for internal mail", () => {
    expect(shows_end_to_end({ is_external: false, e2e_verified: true })).toBe(
      true,
    );
    expect(shows_end_to_end({ is_external: false, e2e_verified: false })).toBe(
      false,
    );
    expect(
      shows_end_to_end({
        is_external: true,
        has_recipient_key: true,
        e2e_verified: true,
      }),
    ).toBe(true);
  });

  it("ignores an unknown scope value", () => {
    expect(
      shows_end_to_end({
        is_external: true,
        e2e_verified: false,
        sent_encryption_scope: "everything" as never,
      }),
    ).toBe(false);
  });
});

describe("reaches_outside_recipients", () => {
  it("uses the verified scope over the server flag", () => {
    expect(
      reaches_outside_recipients({
        is_external: true,
        sent_encryption_scope: "internal",
      }),
    ).toBe(false);
    expect(
      reaches_outside_recipients({
        is_external: false,
        sent_encryption_scope: "outside",
      }),
    ).toBe(true);
    expect(reaches_outside_recipients({ is_external: true })).toBe(true);
    expect(reaches_outside_recipients({ is_external: false })).toBe(false);
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
