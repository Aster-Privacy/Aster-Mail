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

import { describe, expect, it } from "vitest";

import { mail_default_invite_email } from "@/components/calendar/use_invite_senders";

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
  },
  {
    id: "alias-2",
    email: "old@astermail.org",
    type: "alias",
    is_enabled: false,
  },
  {
    id: "domain-dom-1",
    email: "me@mydomain.example",
    type: "domain",
    is_enabled: true,
    address_hash: "hash-domain",
  },
  {
    id: "domain-dom-2",
    email: "nohash@mydomain.example",
    type: "domain",
    is_enabled: true,
  },
  {
    id: "ghost-1",
    email: "ghost@astermail.org",
    type: "ghost",
    is_enabled: true,
  },
  {
    id: "external-1",
    email: "me@example.com",
    type: "external",
    is_enabled: true,
  },
];

describe("mail_default_invite_email", () => {
  it("returns nothing without a mail default", () => {
    expect(mail_default_invite_email(options, null)).toBeNull();
  });

  it("follows the mail default alias", () => {
    expect(mail_default_invite_email(options, "alias-1")).toBe(
      "work@astermail.org",
    );
  });

  it("matches a custom domain address by its bare id", () => {
    expect(mail_default_invite_email(options, "dom-1")).toBe(
      "me@mydomain.example",
    );
  });

  it("ignores a custom domain address that cannot sign invitations", () => {
    expect(mail_default_invite_email(options, "dom-2")).toBeNull();
  });

  it("ignores a disabled alias", () => {
    expect(mail_default_invite_email(options, "alias-2")).toBeNull();
  });

  it("ignores addresses that cannot send invitations", () => {
    expect(mail_default_invite_email(options, "ghost-1")).toBeNull();
    expect(mail_default_invite_email(options, "external-1")).toBeNull();
  });

  it("ignores an unknown id", () => {
    expect(mail_default_invite_email(options, "missing")).toBeNull();
  });
});
