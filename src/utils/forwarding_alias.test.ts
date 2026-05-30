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
  detect_forwarded_alias,
  resolve_forwarding_display,
  displayed_sender,
} from "./forwarding_alias";

const SL_ALIAS = {
  name: "John",
  email: "reverse_alias_718jakwi@simplelogin.co",
};

function headers(entries: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(entries).map(([name, value]) => ({ name, value }));
}

describe("detect_forwarded_alias", () => {
  it("extracts the original sender from a SimpleLogin forward", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Type": "Forward",
        "X-SimpleLogin-Original-From": "Hi Example <hi@example.com>",
        From: "John <reverse_alias_718jakwi@simplelogin.co>",
      }),
      SL_ALIAS,
    );

    expect(result?.service).toBe("simplelogin");
    expect(result?.original.email).toBe("hi@example.com");
    expect(result?.original.name).toBe("Hi Example");
    expect(result?.reverse_alias.email).toBe(SL_ALIAS.email);
  });

  it("falls back to Envelope-From when Original-From is absent", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Type": "Forward",
        "X-SimpleLogin-Envelope-From": "hi@example.com",
      }),
      SL_ALIAS,
    );

    expect(result?.original.email).toBe("hi@example.com");
  });

  it("is case-insensitive on header names", () => {
    const result = detect_forwarded_alias(
      headers({
        "x-simplelogin-original-from": "hi@example.com",
      }),
      SL_ALIAS,
    );

    expect(result?.original.email).toBe("hi@example.com");
  });

  it("handles addy.io original sender", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-AnonAddy-Original-Sender": "hi@example.com",
      }),
      { email: "alias@anonaddy.me" },
    );

    expect(result?.service).toBe("addy");
    expect(result?.original.email).toBe("hi@example.com");
    expect(result?.reverse_alias.email).toBe("alias@anonaddy.me");
  });

  it("ignores a SimpleLogin Reply direction", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Type": "Reply",
        "X-SimpleLogin-Original-From": "hi@example.com",
      }),
      SL_ALIAS,
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined when original equals the alias", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Original-From": SL_ALIAS.email,
      }),
      SL_ALIAS,
    );

    expect(result).toBeUndefined();
  });

  it("does not trust forwarding headers spoofed by a non-forwarder sender", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Type": "Forward",
        "X-SimpleLogin-Original-From": "Your Bank <security@bank.com>",
        From: "Attacker <attacker@evil.com>",
      }),
      { name: "Attacker", email: "attacker@evil.com" },
    );

    expect(result).toBeUndefined();
  });

  it("does not trust addy headers when the alias is not an addy domain", () => {
    const result = detect_forwarded_alias(
      headers({ "X-AnonAddy-Original-Sender": "security@bank.com" }),
      { email: "attacker@evil.com" },
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined for ordinary mail with no forwarding headers", () => {
    const result = detect_forwarded_alias(
      headers({ From: "Real Sender <real@gmail.com>" }),
      { email: "real@gmail.com" },
    );

    expect(result).toBeUndefined();
  });

  it("returns undefined without raw headers", () => {
    expect(detect_forwarded_alias(undefined, SL_ALIAS)).toBeUndefined();
    expect(detect_forwarded_alias([], SL_ALIAS)).toBeUndefined();
  });

  it("matches a SimpleLogin subdomain alias", () => {
    const result = detect_forwarded_alias(
      headers({ "X-SimpleLogin-Original-From": "hi@example.com" }),
      { email: "rev@mail.simplelogin.co" },
    );

    expect(result?.original.email).toBe("hi@example.com");
  });

  it("parses a quoted display name containing a comma", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Original-From": '"Doe, John" <john@example.com>',
      }),
      SL_ALIAS,
    );

    expect(result?.original.email).toBe("john@example.com");
    expect(result?.original.name).toBe("Doe, John");
  });

  it("still extracts the address when the display name is RFC 2047 encoded", () => {
    const result = detect_forwarded_alias(
      headers({
        "X-SimpleLogin-Original-From": "=?utf-8?B?w4ZsaWNl?= <alice@example.com>",
      }),
      SL_ALIAS,
    );

    expect(result?.original.email).toBe("alice@example.com");
  });

  it("handles an addy.io original sender with a display name", () => {
    const result = detect_forwarded_alias(
      headers({ "X-AnonAddy-Original-Sender": "Jane <jane@example.com>" }),
      { email: "alias@addy.io" },
    );

    expect(result?.service).toBe("addy");
    expect(result?.original.email).toBe("jane@example.com");
    expect(result?.original.name).toBe("Jane");
  });
});

describe("resolve_forwarding_display", () => {
  it("produces display fields for a forwarded message", () => {
    const display = resolve_forwarding_display(
      { name: "John", email: SL_ALIAS.email },
      headers({
        "X-SimpleLogin-Original-From": "Hi Example <hi@example.com>",
      }),
    );

    expect(display).toEqual({
      display_sender_name: "Hi Example",
      display_sender_email: "hi@example.com",
      forwarding_service: "simplelogin",
    });
  });

  it("derives a display name from the address when none is given", () => {
    const display = resolve_forwarding_display(
      { email: SL_ALIAS.email },
      headers({ "X-SimpleLogin-Original-From": "hi@example.com" }),
    );

    expect(display?.display_sender_name).toBe("hi");
    expect(display?.display_sender_email).toBe("hi@example.com");
  });

  it("returns undefined for ordinary mail", () => {
    expect(
      resolve_forwarding_display(
        { email: "real@gmail.com" },
        headers({ From: "real@gmail.com" }),
      ),
    ).toBeUndefined();
  });
});

describe("displayed_sender", () => {
  it("prefers the display sender when present", () => {
    expect(
      displayed_sender({
        sender_name: "John",
        sender_email: SL_ALIAS.email,
        display_sender_name: "Hi Example",
        display_sender_email: "hi@example.com",
      }),
    ).toEqual({ name: "Hi Example", email: "hi@example.com" });
  });

  it("falls back to the literal sender otherwise", () => {
    expect(
      displayed_sender({
        sender_name: "Real Sender",
        sender_email: "real@gmail.com",
      }),
    ).toEqual({ name: "Real Sender", email: "real@gmail.com" });
  });
});
