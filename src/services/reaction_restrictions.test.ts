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

import { reaction_restriction } from "./reaction_restrictions";

const me = "me@astermail.org";

function build_message(
  overrides: Partial<DecryptedThreadMessage> = {},
): DecryptedThreadMessage {
  return {
    id: "item_1",
    item_type: "received",
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: "Hello",
    body: "Hi",
    timestamp: new Date(0).toISOString(),
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: true,
    to_recipients: [{ name: "Me", email: me }],
    ...overrides,
  };
}

describe("reaction_restriction", () => {
  it("allows a normal received message", () => {
    expect(reaction_restriction(build_message(), me, true)).toBeNull();
  });

  it("blocks when reactions are turned off", () => {
    expect(reaction_restriction(build_message(), me, false)).toBe("disabled");
  });

  it("blocks own sent messages", () => {
    expect(
      reaction_restriction(build_message({ item_type: "sent" }), me, true),
    ).toBe("own_message");
  });

  it("blocks drafts and scheduled messages", () => {
    expect(
      reaction_restriction(build_message({ item_type: "draft" }), me, true),
    ).toBe("draft");
    expect(
      reaction_restriction(
        build_message({ send_status: "scheduled" }),
        me,
        true,
      ),
    ).toBe("draft");
  });

  it("blocks spam and trash", () => {
    expect(
      reaction_restriction(build_message({ is_spam: true }), me, true),
    ).toBe("spam_or_trash");
    expect(
      reaction_restriction(build_message({ is_deleted: true }), me, true),
    ).toBe("spam_or_trash");
  });

  it("blocks a message with a different reply-to address", () => {
    const message = build_message({
      raw_headers: [{ name: "Reply-To", value: "List <list@example.com>" }],
    });

    expect(reaction_restriction(message, me, true)).toBe("reply_to");
  });

  it("allows a reply-to that matches the sender", () => {
    const message = build_message({
      raw_headers: [{ name: "Reply-To", value: "Sender <sender@example.com>" }],
    });

    expect(reaction_restriction(message, me, true)).toBeNull();
  });

  it("blocks messages with more than twenty recipients", () => {
    const message = build_message({
      to_recipients: [
        { name: "Me", email: me },
        ...Array.from({ length: 20 }, (_, index) => ({
          name: `Person ${index}`,
          email: `person${index}@example.com`,
        })),
      ],
    });

    expect(reaction_restriction(message, me, true)).toBe("too_many_recipients");
  });

  it("blocks messages the user was only bcc'd on", () => {
    const message = build_message({
      to_recipients: [{ name: "Someone", email: "someone@example.com" }],
    });

    expect(reaction_restriction(message, me, true)).toBe("bcc");
  });

  it("allows cc'd recipients", () => {
    const message = build_message({
      to_recipients: [{ name: "Someone", email: "someone@example.com" }],
      cc_recipients: [{ name: "Me", email: me.toUpperCase() }],
    });

    expect(reaction_restriction(message, me, true)).toBeNull();
  });

  it("blocks once the message has twenty distinct reactions", () => {
    const message = build_message({
      reactions: Array.from({ length: 20 }, (_, index) => ({
        reaction_mail_item_id: `reaction_${index}`,
        source: "internal",
        emoji: String.fromCodePoint(0x1f600 + index),
        reactor_email: `person${index}@example.com`,
        is_own: false,
        created_at: new Date(0).toISOString(),
      })),
    });

    expect(reaction_restriction(message, me, true)).toBe("too_many_emojis");
  });

  it("blocks when there is no sender to reply to", () => {
    expect(
      reaction_restriction(build_message({ sender_email: "  " }), me, true),
    ).toBe("no_recipient");
  });
});
