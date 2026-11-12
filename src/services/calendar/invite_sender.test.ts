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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { afterEach, describe, expect, it } from "vitest";

import {
  invite_sender_options,
  reply_identity,
  resolve_invite_sender,
} from "@/services/calendar/invite_sender";
import {
  clear_own_addresses,
  is_own_address,
  own_address_among,
  set_own_addresses,
} from "@/services/calendar/own_addresses";

const options: SenderOption[] = [
  {
    id: "primary",
    email: "me@astermail.org",
    type: "primary",
    is_enabled: true,
  },
  {
    id: "alias-1",
    email: "work@astermail.org",
    type: "alias",
    is_enabled: true,
    address_hash: "hash-work",
    display_name: "Work",
  },
  {
    id: "alias-2",
    email: "old@astermail.org",
    type: "alias",
    is_enabled: false,
    address_hash: "hash-old",
  },
  {
    id: "ghost-1",
    email: "ghost@astermail.org",
    type: "ghost",
    is_enabled: true,
    address_hash: "hash-ghost",
  },
  {
    id: "external-1",
    email: "me@example.com",
    type: "external",
    is_enabled: true,
  },
];

afterEach(() => {
  clear_own_addresses();
});

describe("invite_sender_options", () => {
  it("keeps enabled primary, alias, and domain addresses", () => {
    expect(invite_sender_options(options).map((o) => o.email)).toEqual([
      "me@astermail.org",
      "work@astermail.org",
    ]);
  });
});

describe("resolve_invite_sender", () => {
  it("uses the primary address when nothing is requested", () => {
    const result = resolve_invite_sender({ options, requested: "" });

    expect(result.option?.email).toBe("me@astermail.org");
    expect(result.issue).toBeNull();
  });

  it("uses the requested alias", () => {
    const result = resolve_invite_sender({
      options,
      requested: "Work@astermail.org",
    });

    expect(result.option?.email).toBe("work@astermail.org");
    expect(result.issue).toBeNull();
  });

  it("falls back to the primary address for a disabled alias", () => {
    const result = resolve_invite_sender({
      options,
      requested: "old@astermail.org",
    });

    expect(result.option?.email).toBe("me@astermail.org");
    expect(result.issue).toBe("unavailable");
  });

  it("reports an unverified domain", () => {
    const result = resolve_invite_sender({
      options,
      requested: "team@pending.example",
      pending_domain_names: ["pending.example"],
    });

    expect(result.option?.email).toBe("me@astermail.org");
    expect(result.issue).toBe("unverified_domain");
  });

  it("does not report an issue while addresses are loading", () => {
    const result = resolve_invite_sender({
      options,
      requested: "work2@astermail.org",
      loading: true,
    });

    expect(result.issue).toBeNull();
  });
});

describe("own addresses", () => {
  it("treats aliases and catch-all domains as the user", () => {
    set_own_addresses(["work@astermail.org"], ["mydomain.example"]);

    expect(is_own_address("WORK@astermail.org", "me@astermail.org")).toBe(true);
    expect(is_own_address("any@mydomain.example", "me@astermail.org")).toBe(
      true,
    );
    expect(is_own_address("friend@example.com", "me@astermail.org")).toBe(
      false,
    );
    expect(
      own_address_among(
        ["friend@example.com", "work@astermail.org"],
        "me@astermail.org",
      ),
    ).toBe("work@astermail.org");
  });
});

describe("reply_identity", () => {
  it("replies from the alias the invitation reached", () => {
    set_own_addresses(["work@astermail.org"]);

    const identity = reply_identity(
      options,
      ["friend@example.com", "work@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.attendee_email).toBe("work@astermail.org");
    expect(identity.reply_email).toBe("work@astermail.org");
    expect(identity.sender).toEqual({
      email: "work@astermail.org",
      address_hash: "hash-work",
    });
  });

  it("never answers for a disabled alias from the primary address", () => {
    set_own_addresses(["old@astermail.org"]);

    const identity = reply_identity(
      options,
      ["old@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.attendee_email).toBe("old@astermail.org");
    expect(identity.reply_email).not.toBe("me@astermail.org");
    expect(identity.sender).toBeNull();
    expect(identity.blocked).toBe(true);
  });

  it("never answers for an address the sender list does not hold yet", () => {
    set_own_addresses(["new@astermail.org"]);

    const identity = reply_identity(
      [],
      ["new@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.blocked).toBe(true);
    expect(identity.reply_email).not.toBe("me@astermail.org");
  });

  it("answers from the primary address when the invitation reached it", () => {
    const identity = reply_identity(
      options,
      ["friend@example.com", "me@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.blocked).toBe(false);
    expect(identity.reply_email).toBe("me@astermail.org");
  });

  it("uses the alias name for a reply from an alias", () => {
    set_own_addresses(["work@astermail.org"]);

    const identity = reply_identity(
      options,
      ["work@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.display_name).toBe("Work");
  });

  it("leaves a nameless alias unnamed instead of using the account name", () => {
    const nameless: SenderOption[] = options.map((option) =>
      option.id === "alias-1" ? { ...option, display_name: undefined } : option,
    );

    set_own_addresses(["work@astermail.org"]);

    const identity = reply_identity(
      nameless,
      ["work@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.reply_email).toBe("work@astermail.org");
    expect(identity.display_name).toBeNull();
  });

  it("replies from the Ghost Mode address the invitation reached", () => {
    set_own_addresses(["ghost@astermail.org"]);

    const identity = reply_identity(
      options,
      ["friend@example.com", "ghost@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.attendee_email).toBe("ghost@astermail.org");
    expect(identity.reply_email).toBe("ghost@astermail.org");
    expect(identity.display_name).toBeNull();
    expect(identity.sender).toEqual({
      email: "ghost@astermail.org",
      address_hash: "hash-ghost",
    });
  });

  it("does not reply from a disabled Ghost Mode address", () => {
    const disabled: SenderOption[] = options.map((option) =>
      option.id === "ghost-1" ? { ...option, is_enabled: false } : option,
    );

    set_own_addresses(["ghost@astermail.org"]);

    const identity = reply_identity(
      disabled,
      ["ghost@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.sender).toBeNull();
    expect(identity.blocked).toBe(true);
  });

  it("keeps the account name for a reply from the primary address", () => {
    const identity = reply_identity(
      options,
      ["me@astermail.org"],
      "me@astermail.org",
      "Me",
    );

    expect(identity.display_name).toBe("Me");
  });
});
