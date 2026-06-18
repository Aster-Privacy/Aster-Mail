//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import {
  build_reply_recipient,
  build_reply_recipient_for_message,
} from "./build_reply_recipient";

import { extract_reply_to } from "@/utils/reply_to";

describe("build_reply_recipient", () => {
  it("issue #13: replies to Reply-To, not From", () => {
    const raw_headers = [
      { name: "From", value: "Sender <sender@mail.example.com>" },
      { name: "To", value: "inbox@example.net" },
      { name: "Reply-To", value: "user@external.example" },
      { name: "Subject", value: "Contact request" },
    ];
    const reply_to_parsed = extract_reply_to(raw_headers);

    expect(reply_to_parsed).toEqual({ email: "user@external.example" });

    const result = build_reply_recipient(
      {
        sender_name: "Sender",
        sender_email: "sender@mail.example.com",
        first_to: { name: "", email: "inbox@example.net" },
        reply_to: reply_to_parsed
          ? { name: reply_to_parsed.name ?? "", email: reply_to_parsed.email }
          : undefined,
      },
      false,
    );

    expect(result.recipient_email).toBe("user@external.example");
    expect(result.recipient_email).not.toBe("sender@mail.example.com");
  });

  it("uses Reply-To display name when present", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Sender",
        sender_email: "sender@mail.example.com",
        reply_to: { name: "Real User", email: "user@external.example" },
      },
      false,
    );

    expect(result.recipient_name).toBe("Real User");
    expect(result.recipient_email).toBe("user@external.example");
  });

  it("derives name from email username when Reply-To has no name", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Sender",
        sender_email: "sender@mail.example.com",
        reply_to: { name: "", email: "alice@external.example" },
      },
      false,
    );

    expect(result.recipient_name).toBe("alice");
    expect(result.recipient_email).toBe("alice@external.example");
  });

  it("falls back to From when no Reply-To", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Sender",
        sender_email: "sender@mail.example.com",
      },
      false,
    );

    expect(result.recipient_email).toBe("sender@mail.example.com");
    expect(result.recipient_name).toBe("Sender");
  });

  it("ignores Reply-To when replying to own sent message", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Me",
        sender_email: "me@astermail.org",
        first_to: { name: "Recipient", email: "them@example.com" },
        reply_to: { name: "", email: "spoofed@bad.example" },
      },
      true,
    );

    expect(result.recipient_email).toBe("them@example.com");
  });

  it("falls back to sender on own message with no first_to", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Me",
        sender_email: "me@astermail.org",
      },
      true,
    );

    expect(result.recipient_email).toBe("me@astermail.org");
  });

  it("treats empty reply_to email as absent", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Sender",
        sender_email: "sender@mail.example.com",
        reply_to: { name: "Junk", email: "" },
      },
      false,
    );

    expect(result.recipient_email).toBe("sender@mail.example.com");
  });

  it("routes a forwarded-alias reply to the reverse alias, overriding Reply-To", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Hi Example",
        sender_email: "reverse_alias_x@simplelogin.co",
        reply_to: { name: "", email: "hi@example.com" },
        reply_alias: {
          name: "Hi Example",
          email: "reverse_alias_x@simplelogin.co",
        },
      },
      false,
    );

    expect(result.recipient_email).toBe("reverse_alias_x@simplelogin.co");
    expect(result.recipient_email).not.toBe("hi@example.com");
  });

  it("never applies reply_alias to an own sent message", () => {
    const result = build_reply_recipient(
      {
        sender_name: "Me",
        sender_email: "me@astermail.org",
        first_to: { name: "Recipient", email: "them@example.com" },
        reply_alias: { email: "reverse_alias_x@simplelogin.co" },
      },
      true,
    );

    expect(result.recipient_email).toBe("them@example.com");
  });
});

describe("build_reply_recipient_for_message", () => {
  it("issue #13: inline thread reply targets Reply-To, not From", () => {
    const result = build_reply_recipient_for_message({
      item_type: "received",
      sender_name: "Info",
      sender_email: "info@company.example",
      to_recipients: [{ name: "", email: "inbox@example.net" }],
      raw_headers: [
        { name: "From", value: "Info <info@company.example>" },
        { name: "To", value: "inbox@example.net" },
        { name: "Reply-To", value: "dummy@external.example" },
      ],
    });

    expect(result.recipient_email).toBe("dummy@external.example");
  });

  it("falls back to sender when the message has no Reply-To header", () => {
    const result = build_reply_recipient_for_message({
      item_type: "received",
      sender_name: "Info",
      sender_email: "info@company.example",
      raw_headers: [{ name: "From", value: "Info <info@company.example>" }],
    });

    expect(result.recipient_email).toBe("info@company.example");
    expect(result.recipient_name).toBe("Info");
  });

  it("falls back to sender when raw_headers are missing entirely", () => {
    const result = build_reply_recipient_for_message({
      item_type: "received",
      sender_name: "Info",
      sender_email: "info@company.example",
    });

    expect(result.recipient_email).toBe("info@company.example");
  });

  it("replies to the original recipient on own sent messages", () => {
    const result = build_reply_recipient_for_message({
      item_type: "sent",
      sender_name: "Me",
      sender_email: "me@astermail.org",
      to_recipients: [{ name: "Them", email: "them@example.com" }],
      raw_headers: [
        { name: "Reply-To", value: "spoofed@bad.example" },
      ],
    });

    expect(result.recipient_email).toBe("them@example.com");
  });

  it("ignores a Reply-To pointing at the user's own address and uses the sender", () => {
    const result = build_reply_recipient_for_message(
      {
        item_type: "received",
        sender_name: "Nus Eon",
        sender_email: "nuseon@atomicmail.io",
        to_recipients: [{ name: "Nous Aeon", email: "eon@astermail.org" }],
        raw_headers: [
          { name: "From", value: "Nus Eon <nuseon@atomicmail.io>" },
          { name: "Reply-To", value: "eon@astermail.org" },
        ],
      },
      ["eon@astermail.org"],
    );

    expect(result.recipient_email).toBe("nuseon@atomicmail.io");
    expect(result.recipient_email).not.toBe("eon@astermail.org");
  });

  it("keeps the reverse alias over Reply-To for forwarded-alias mail", () => {
    const result = build_reply_recipient_for_message({
      item_type: "received",
      sender_name: "Hi Example",
      sender_email: "reverse_alias_x@simplelogin.co",
      display_sender_email: "hi@example.com",
      raw_headers: [
        { name: "Reply-To", value: "hi@example.com" },
      ],
    });

    expect(result.recipient_email).toBe("reverse_alias_x@simplelogin.co");
  });
});
