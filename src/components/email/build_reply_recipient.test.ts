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

import { build_reply_recipient } from "./build_reply_recipient";

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
});
