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
  resolve_from_sender,
  from_tier_draft,
  from_tier_thread,
  from_tier_external,
  from_tier_pinned,
  from_tier_fallback,
} from "./resolve_from_sender";

const options = [
  { id: "primary", email: "me@astermail.org", type: "primary" },
  { id: "alias-1", email: "shopping@astermail.org", type: "alias" },
  { id: "alias-2", email: "work@astermail.org", type: "alias" },
  { id: "ext-1", email: "old@example.com", type: "external" },
  { id: "alias-off", email: "retired@astermail.org", type: "alias", is_enabled: false },
];

describe("resolve_from_sender", () => {
  it("returns null when there is nothing to pick", () => {
    expect(resolve_from_sender({ options: [] })).toBeNull();
  });

  it("falls back to the first enabled option", () => {
    const resolved = resolve_from_sender({ options });

    expect(resolved?.option.id).toBe("primary");
    expect(resolved?.tier).toBe(from_tier_fallback);
  });

  it("uses the pinned sender over the fallback", () => {
    const resolved = resolve_from_sender({
      options,
      preferred_sender_id: "alias-2",
    });

    expect(resolved?.option.id).toBe("alias-2");
    expect(resolved?.tier).toBe(from_tier_pinned);
  });

  it("matches a pinned id carrying the domain prefix", () => {
    const resolved = resolve_from_sender({
      options: [{ id: "domain-abc", email: "hi@my.example" }],
      preferred_sender_id: "abc",
    });

    expect(resolved?.option.id).toBe("domain-abc");
    expect(resolved?.tier).toBe(from_tier_pinned);
  });

  it("prefers the address the thread was received on over the pinned sender", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: ["shopping@astermail.org"],
      preferred_sender_id: "alias-2",
    });

    expect(resolved?.option.id).toBe("alias-1");
    expect(resolved?.tier).toBe(from_tier_thread);
  });

  it("finds the received-on address in cc when it is not in to", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: [
        undefined,
        "someone@example.com",
        "work@astermail.org",
      ],
      preferred_sender_id: "alias-1",
    });

    expect(resolved?.option.id).toBe("alias-2");
    expect(resolved?.tier).toBe(from_tier_thread);
  });

  it("ignores dots and case when matching the received-on address", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: ["  Shop.Ping@AsterMail.org "],
    });

    expect(resolved?.option.id).toBe("alias-1");
    expect(resolved?.tier).toBe(from_tier_thread);
  });

  it("never picks a disabled alias", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: ["retired@astermail.org"],
      preferred_sender_id: "alias-off",
    });

    expect(resolved?.option.id).toBe("primary");
    expect(resolved?.tier).toBe(from_tier_fallback);
  });

  it("keeps the draft sender above every other tier", () => {
    const resolved = resolve_from_sender({
      options,
      draft_from: "work@astermail.org",
      thread_addresses: ["shopping@astermail.org"],
      preferred_sender_id: "primary",
    });

    expect(resolved?.option.id).toBe("alias-2");
    expect(resolved?.tier).toBe(from_tier_draft);
  });

  it("uses an external sender for an external thread when nothing matched", () => {
    const resolved = resolve_from_sender({
      options,
      prefer_external: true,
      preferred_sender_id: "alias-1",
    });

    expect(resolved?.option.id).toBe("ext-1");
    expect(resolved?.tier).toBe(from_tier_external);
  });

  it("still prefers the received-on address on an external thread", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: ["work@astermail.org"],
      prefer_external: true,
    });

    expect(resolved?.option.id).toBe("alias-2");
    expect(resolved?.tier).toBe(from_tier_thread);
  });

  it("ignores blank and missing thread addresses", () => {
    const resolved = resolve_from_sender({
      options,
      thread_addresses: [null, undefined, "", "   "],
      preferred_sender_id: "alias-1",
    });

    expect(resolved?.option.id).toBe("alias-1");
    expect(resolved?.tier).toBe(from_tier_pinned);
  });
});
