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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, expect, it } from "vitest";

import {
  include_opened_message,
  keep_readable_bodies,
} from "./thread_message_merge";

import { PGP_UNDECRYPTABLE_SENTINEL } from "@/utils/email_crypto";

const OUTER_HTML = "<p>outer html that nobody signed</p>";
const SIGNED_TEXT = "signed words from the sender";

function base(id: string): DecryptedThreadMessage {
  return {
    id,
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.test",
    subject: "Subject",
    body: "",
    timestamp: "2026-11-17T12:00:00.000Z",
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
  } as DecryptedThreadMessage;
}

function outer_copy(id: string): DecryptedThreadMessage {
  return {
    ...base(id),
    body: "outer text",
    html_content: OUTER_HTML,
    text_part: "outer text",
    e2e_verified: false,
    e2e_sender_bound: false,
  };
}

function empty_verified_copy(id: string): DecryptedThreadMessage {
  return {
    ...base(id),
    body: "",
    html_content: undefined,
    text_part: undefined,
    e2e_verified: true,
    e2e_sender_bound: true,
    e2e_details_sealed: true,
    sender_verification: "verified",
  };
}

function verified_copy(id: string): DecryptedThreadMessage {
  return {
    ...base(id),
    body: SIGNED_TEXT,
    e2e_verified: true,
    e2e_sender_bound: true,
    sender_verification: "verified",
  };
}

function failed_copy(id: string): DecryptedThreadMessage {
  return {
    ...base(id),
    body: PGP_UNDECRYPTABLE_SENTINEL,
    e2e_verified: false,
    e2e_sender_bound: false,
  };
}

function sealed_copy(id: string): DecryptedThreadMessage {
  return {
    ...verified_copy(id),
    sender_name: "Real Sender",
    sender_email: "sender@example.test",
    display_sender_name: "Real Sender",
    display_sender_email: "sender@example.test",
    subject: "Sealed subject",
    to_recipients: [{ name: "", email: "owner@astermail.org" }],
    cc_recipients: [],
    raw_headers: [],
    e2e_details_sealed: true,
    timestamp: "2026-11-17T09:00:00.000Z",
  };
}

function swapped_failed_copy(id: string): DecryptedThreadMessage {
  return {
    ...failed_copy(id),
    is_read: false,
    sender_name: "Billing",
    sender_email: "billing@outer.example",
    display_sender_name: "Billing",
    display_sender_email: "billing@outer.example",
    subject: "Outer subject",
    to_recipients: [{ name: "", email: "someone@outer.example" }],
    cc_recipients: [{ name: "", email: "copy@outer.example" }],
    raw_headers: [{ name: "Reply-To", value: "reply@outer.example" }],
    timestamp: "2026-11-18T09:00:00.000Z",
  };
}

function sender_fields(message: DecryptedThreadMessage) {
  return {
    sender_name: message.sender_name,
    sender_email: message.sender_email,
    display_sender_name: message.display_sender_name,
    display_sender_email: message.display_sender_email,
    subject: message.subject,
    to_recipients: message.to_recipients,
    cc_recipients: message.cc_recipients,
    raw_headers: message.raw_headers,
    timestamp: message.timestamp,
  };
}

function shown(message: DecryptedThreadMessage) {
  return {
    html_content: message.html_content,
    sender_verification: message.sender_verification,
    e2e_verified: message.e2e_verified,
    e2e_sender_bound: message.e2e_sender_bound,
    e2e_details_sealed: message.e2e_details_sealed,
  };
}

describe("keep_readable_bodies verdict pairing", () => {
  it("never shows a newer verdict on an earlier outer body", () => {
    const [merged] = keep_readable_bodies(
      [outer_copy("m1")],
      [empty_verified_copy("m1")],
    );

    expect(shown(merged)).toEqual({
      html_content: OUTER_HTML,
      sender_verification: undefined,
      e2e_verified: false,
      e2e_sender_bound: false,
      e2e_details_sealed: undefined,
    });
  });

  it("keeps the verdict of the earlier body when a refresh fails to decrypt", () => {
    const [merged] = keep_readable_bodies(
      [verified_copy("m1")],
      [failed_copy("m1")],
    );

    expect(merged.body).toBe(SIGNED_TEXT);
    expect(merged.sender_verification).toBe("verified");
    expect(merged.e2e_verified).toBe(true);
    expect(merged.e2e_sender_bound).toBe(true);
  });

  it("keeps server flags from the refresh and content from the earlier copy", () => {
    const [merged] = keep_readable_bodies(
      [outer_copy("m1")],
      [
        {
          ...empty_verified_copy("m1"),
          is_read: false,
          is_starred: true,
          subject: "Newer",
        },
      ],
    );

    expect(merged.is_read).toBe(false);
    expect(merged.is_starred).toBe(true);
    expect(merged.subject).toBe("Subject");
  });

  it("keeps the sender and headers of the verified body when a refresh fails", () => {
    const [merged] = keep_readable_bodies(
      [sealed_copy("m1")],
      [swapped_failed_copy("m1")],
    );

    expect(sender_fields(merged)).toEqual(sender_fields(sealed_copy("m1")));
    expect(merged.e2e_sender_bound).toBe(true);
    expect(merged.is_read).toBe(false);
  });
});

describe("include_opened_message verdict pairing", () => {
  it("never shows the thread copy verdict on the opened outer body", () => {
    const [merged] = include_opened_message(
      [empty_verified_copy("m1")],
      outer_copy("m1"),
    );

    expect(shown(merged)).toEqual({
      html_content: OUTER_HTML,
      sender_verification: undefined,
      e2e_verified: false,
      e2e_sender_bound: false,
      e2e_details_sealed: undefined,
    });
  });

  it("keeps the sender and headers of the opened verified body", () => {
    const [merged] = include_opened_message(
      [swapped_failed_copy("m1")],
      sealed_copy("m1"),
    );

    expect(sender_fields(merged)).toEqual(sender_fields(sealed_copy("m1")));
    expect(merged.e2e_sender_bound).toBe(true);
  });
});
