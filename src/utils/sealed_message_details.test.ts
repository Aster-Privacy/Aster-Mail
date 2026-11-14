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
  build_sealed_details,
  parse_sealed_details,
  sealed_sender_name,
  serialize_sealed_details,
} from "./sealed_message_details";
import {
  ASTER_SUBJECT_BUNDLE_PREFIX,
  build_subject_bundle,
  extract_subject_bundle,
} from "./email_crypto";

import {
  has_sealed_details,
  sealed_timestamp,
  settle_bundle_subject,
  settle_sealed_fields,
} from "@/services/crypto/sealed_message_fields";

const SENT_AT = "2026-11-12T10:15:00.000Z";

const DETAILS = build_sealed_details({
  from_name: "Ana Real",
  to: ["bo@astermail.org", "Cy Real <cy@astermail.org>"],
  cc: ['"Di Real" <di@astermail.org>'],
  sent_at: SENT_AT,
});

describe("build_sealed_details", () => {
  it("records the sender name, recipients and send time", () => {
    expect(DETAILS).toEqual({
      from_name: "Ana Real",
      to: [
        { name: "", email: "bo@astermail.org" },
        { name: "Cy Real", email: "cy@astermail.org" },
      ],
      cc: [{ name: "Di Real", email: "di@astermail.org" }],
      sent_at: SENT_AT,
    });
  });

  it("defaults to an empty name, no recipients and the current time", () => {
    const before = Date.now();
    const details = build_sealed_details({});

    expect(details.from_name).toBe("");
    expect(details.to).toEqual([]);
    expect(details.cc).toEqual([]);
    expect(new Date(details.sent_at).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("drops blank recipients and control characters in names", () => {
    const details = build_sealed_details({
      from_name: "Ana\nReal",
      to: ["", "   ", "bo@astermail.org"],
    });

    expect(details.from_name).toBe("Ana Real");
    expect(details.to).toEqual([{ name: "", email: "bo@astermail.org" }]);
  });
});

describe("sealed_sender_name", () => {
  it("prefers the name chosen for the message", () => {
    expect(sealed_sender_name("Chosen", null, "Account")).toBe("Chosen");
    expect(sealed_sender_name("Chosen", "alias-hash", "Account")).toBe(
      "Chosen",
    );
  });

  it("uses the account name only when the message is not sent from an alias", () => {
    expect(sealed_sender_name(undefined, null, "Account")).toBe("Account");
    expect(sealed_sender_name(undefined, "alias-hash", "Account")).toBe("");
    expect(sealed_sender_name(undefined, undefined, undefined)).toBe("");
  });
});

describe("parse_sealed_details", () => {
  it("reads back what was serialized", () => {
    expect(parse_sealed_details(serialize_sealed_details(DETAILS))).toEqual(
      DETAILS,
    );
  });

  it("rejects anything that is not a complete, current record", () => {
    const valid = serialize_sealed_details(DETAILS);

    expect(parse_sealed_details(undefined)).toBeUndefined();
    expect(parse_sealed_details(null)).toBeUndefined();
    expect(parse_sealed_details("details")).toBeUndefined();
    expect(parse_sealed_details([valid])).toBeUndefined();
    expect(parse_sealed_details({ ...valid, v: 2 })).toBeUndefined();
    expect(parse_sealed_details({ ...valid, v: undefined })).toBeUndefined();
    expect(parse_sealed_details({ ...valid, from_name: 7 })).toBeUndefined();
    expect(parse_sealed_details({ ...valid, to: "bo" })).toBeUndefined();
    expect(parse_sealed_details({ ...valid, cc: undefined })).toBeUndefined();
    expect(
      parse_sealed_details({ ...valid, to: [{ name: "Bo" }] }),
    ).toBeUndefined();
    expect(
      parse_sealed_details({ ...valid, to: [{ name: 1, email: "b@a.org" }] }),
    ).toBeUndefined();
    expect(
      parse_sealed_details({ ...valid, sent_at: "not a date" }),
    ).toBeUndefined();
    expect(parse_sealed_details({ ...valid, sent_at: 5 })).toBeUndefined();
  });
});

describe("subject bundle details", () => {
  it("carries the details through a bundle", () => {
    const bundle = extract_subject_bundle(
      build_subject_bundle("Subject", "<p>Body</p>", [], DETAILS),
    );

    expect(bundle.subject).toBe("Subject");
    expect(bundle.body).toBe("<p>Body</p>");
    expect(bundle.details).toEqual(DETAILS);
  });

  it("reads a bundle written without details", () => {
    const bundle = extract_subject_bundle(
      build_subject_bundle("Subject", "<p>Body</p>"),
    );

    expect(bundle.subject).toBe("Subject");
    expect(bundle.body).toBe("<p>Body</p>");
    expect(bundle.details).toBeUndefined();
  });

  it("keeps subject and body when the details are malformed", () => {
    const bundle = extract_subject_bundle(
      ASTER_SUBJECT_BUNDLE_PREFIX +
        JSON.stringify({ s: "Subject", b: "Body", details: { v: 1 } }),
    );

    expect(bundle.subject).toBe("Subject");
    expect(bundle.body).toBe("Body");
    expect(bundle.details).toBeUndefined();
  });

  it("ignores details quoted inside the body", () => {
    const quoted = build_subject_bundle("Quoted", "Quoted body", [], DETAILS);
    const bundle = extract_subject_bundle(
      build_subject_bundle("Subject", "Reply text " + quoted),
    );

    expect(bundle.subject).toBe("Subject");
    expect(bundle.details).toBeUndefined();
  });
});

describe("sealed details on the receiving side", () => {
  function served() {
    return {
      subject: "Served subject",
      from: { name: "Served Name", email: "ana@astermail.org" },
      to: [{ name: "", email: "served-to@example.com" }],
      cc: [{ name: "", email: "served-cc@example.com" }],
      sent_at: "2020-01-01T00:00:00.000Z",
    };
  }

  it("replaces the served details on a sealed message", () => {
    const envelope = served();
    const bundle = extract_subject_bundle(
      build_subject_bundle("Subject", "Body", [], DETAILS),
    );

    settle_sealed_fields(envelope, bundle, true);

    expect(envelope.subject).toBe("Subject");
    expect(envelope.from).toEqual({
      name: "Ana Real",
      email: "ana@astermail.org",
    });
    expect(envelope.to).toEqual(DETAILS.to);
    expect(envelope.cc).toEqual(DETAILS.cc);
    expect(envelope.sent_at).toBe(SENT_AT);
    expect(has_sealed_details(bundle, true)).toBe(true);
  });

  it("leaves the served details when the message is not sealed", () => {
    const envelope = served();
    const bundle = extract_subject_bundle(
      build_subject_bundle("Subject", "Body", [], DETAILS),
    );

    settle_sealed_fields(envelope, bundle, false);

    expect(envelope).toEqual(served());
    expect(has_sealed_details(bundle, false)).toBe(false);
  });

  it("leaves the served details when a sealed message carries none", () => {
    const envelope = served();
    const bundle = extract_subject_bundle(
      build_subject_bundle("Subject", "Body"),
    );

    settle_sealed_fields(envelope, bundle, true);

    expect(envelope.subject).toBe("Subject");
    expect(envelope.from).toEqual(served().from);
    expect(envelope.to).toEqual(served().to);
    expect(envelope.cc).toEqual(served().cc);
    expect(envelope.sent_at).toBe(served().sent_at);
    expect(has_sealed_details(bundle, true)).toBe(false);
  });

  it("uses the sealed send time only when the details are sealed", () => {
    const envelope = { sent_at: SENT_AT };
    const served_time = "2020-01-01T00:00:00.000Z";

    expect(sealed_timestamp(envelope, true, served_time)).toBe(SENT_AT);
    expect(sealed_timestamp(envelope, false, served_time)).toBe(served_time);
    expect(sealed_timestamp({}, true, served_time)).toBe(served_time);
  });

  it("shows the sealed sender name in a list row", () => {
    const sealed_row = served();

    settle_bundle_subject(sealed_row, {
      subject: "Subject",
      sealed: true,
      details: DETAILS,
    });
    expect(sealed_row.from.name).toBe("Ana Real");
    expect(sealed_row.subject).toBe("Subject");

    const unsealed_row = served();

    settle_bundle_subject(unsealed_row, {
      subject: "Subject",
      sealed: false,
      details: DETAILS,
    });
    expect(unsealed_row.from.name).toBe("Served Name");

    const older_row = served();

    settle_bundle_subject(older_row, { subject: "Subject", sealed: true });
    expect(older_row.from.name).toBe("Served Name");
  });
});
