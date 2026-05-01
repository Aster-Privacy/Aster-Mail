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

import { parse_address, extract_reply_to } from "./reply_to";

describe("parse_address", () => {
  it("parses bare email", () => {
    expect(parse_address("user@external.example")).toEqual({
      email: "user@external.example",
    });
  });

  it("parses name with angle brackets", () => {
    expect(parse_address("Real User <user@external.example>")).toEqual({
      name: "Real User",
      email: "user@external.example",
    });
  });

  it("parses quoted name with angle brackets", () => {
    expect(parse_address('"Real User" <user@external.example>')).toEqual({
      name: "Real User",
      email: "user@external.example",
    });
  });

  it("parses angle-only address", () => {
    expect(parse_address("<user@external.example>")).toEqual({
      email: "user@external.example",
    });
  });

  it("ignores whitespace", () => {
    expect(parse_address("   user@external.example  ")).toEqual({
      email: "user@external.example",
    });
  });

  it("returns undefined for empty input", () => {
    expect(parse_address("")).toBeUndefined();
    expect(parse_address("   ")).toBeUndefined();
  });

  it("returns undefined for invalid email", () => {
    expect(parse_address("not-an-email")).toBeUndefined();
    expect(parse_address("Name <not-an-email>")).toBeUndefined();
  });
});

describe("extract_reply_to", () => {
  it("returns undefined when no headers", () => {
    expect(extract_reply_to(undefined)).toBeUndefined();
    expect(extract_reply_to([])).toBeUndefined();
  });

  it("returns undefined when no reply-to header", () => {
    expect(
      extract_reply_to([
        { name: "From", value: "Sender <sender@mail.example.com>" },
        { name: "Subject", value: "Hi" },
      ]),
    ).toBeUndefined();
  });

  it("extracts simple Reply-To", () => {
    expect(
      extract_reply_to([
        { name: "From", value: "Sender <sender@mail.example.com>" },
        { name: "Reply-To", value: "user@external.example" },
      ]),
    ).toEqual({ email: "user@external.example" });
  });

  it("extracts Reply-To with display name", () => {
    expect(
      extract_reply_to([
        { name: "Reply-To", value: "Real User <user@external.example>" },
      ]),
    ).toEqual({ name: "Real User", email: "user@external.example" });
  });

  it("matches header name case-insensitively", () => {
    expect(
      extract_reply_to([
        { name: "reply-to", value: "user@external.example" },
      ]),
    ).toEqual({ email: "user@external.example" });
    expect(
      extract_reply_to([
        { name: "REPLY-TO", value: "user@external.example" },
      ]),
    ).toEqual({ email: "user@external.example" });
  });

  it("uses first address when multiple are listed", () => {
    expect(
      extract_reply_to([
        {
          name: "Reply-To",
          value: "user@external.example, other@x.example",
        },
      ]),
    ).toEqual({ email: "user@external.example" });
  });

  it("issue #13 scenario: From and Reply-To differ", () => {
    const headers = [
      { name: "From", value: "Sender <sender@mail.example.com>" },
      { name: "To", value: "inbox@example.net" },
      { name: "Reply-To", value: "user@external.example" },
      { name: "Subject", value: "Contact request" },
    ];

    expect(extract_reply_to(headers)).toEqual({
      email: "user@external.example",
    });
  });
});
