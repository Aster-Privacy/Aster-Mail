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

import type { InboxEmail } from "@/types/email";

import { describe, it, expect } from "vitest";

import {
  canonical_alias_address,
  filter_emails_by_view,
} from "./inbox_view_helpers";
import { build_alias_view } from "@/hooks/email_list_helpers/alias_view";

function email(
  id: string,
  sender_email: string,
  recipient_addresses: string[],
): InboxEmail {
  return { id, sender_email, recipient_addresses } as unknown as InboxEmail;
}

describe("canonical_alias_address", () => {
  it("drops the plus tag and dots in the local part", () => {
    expect(canonical_alias_address(" Al.ias+Test@MyDomain.com ")).toBe(
      "alias@mydomain.com",
    );
  });

  it("keeps the domain dots", () => {
    expect(canonical_alias_address("alias@my.domain.com")).toBe(
      "alias@my.domain.com",
    );
  });

  it("returns malformed input lowercased", () => {
    expect(canonical_alias_address("NoAt")).toBe("noat");
  });
});

describe("filter_emails_by_view alias subaddress", () => {
  const emails = [
    email("tagged", "friend@example.com", ["alias+test@mydomain.com"]),
    email("plain", "friend@example.com", ["alias@mydomain.com"]),
    email("other", "friend@example.com", ["someone@mydomain.com"]),
    email("sent_tagged", "alias+news@mydomain.com", ["friend@example.com"]),
  ];

  it("keeps plus-tagged mail in the received view", () => {
    const view = build_alias_view("alias@mydomain.com", "received");
    expect(filter_emails_by_view(emails, view).map((e) => e.id)).toEqual([
      "tagged",
      "plain",
    ]);
  });

  it("keeps plus-tagged mail in the sent view", () => {
    const view = build_alias_view("alias@mydomain.com", "sent");
    expect(filter_emails_by_view(emails, view).map((e) => e.id)).toEqual([
      "sent_tagged",
    ]);
  });

  it("keeps both directions in the default view", () => {
    const view = build_alias_view("alias@mydomain.com");
    expect(filter_emails_by_view(emails, view).map((e) => e.id)).toEqual([
      "tagged",
      "plain",
      "sent_tagged",
    ]);
  });
});

describe("filter_emails_by_view alias delivered as cc or bcc", () => {
  const alias_hash = "aGFzaC1vZi1hbGlhcw==";
  const routed = (
    id: string,
    recipient_addresses: string[],
    routing_token?: string,
  ): InboxEmail =>
    ({
      ...email(id, "friend@example.com", recipient_addresses),
      routing_token,
    }) as InboxEmail;
  const emails = [
    routed("cc", ["someone@example.com"], alias_hash),
    routed("bcc", [], alias_hash),
    routed("to", ["alias@mydomain.com"], alias_hash),
    routed("other", ["someone@example.com"], "b3RoZXItaGFzaA=="),
    email("sent", "alias@mydomain.com", ["friend@example.com"]),
  ];

  it("keeps cc and bcc deliveries in the received view", () => {
    const view = build_alias_view("alias@mydomain.com", "received");
    expect(
      filter_emails_by_view(emails, view, alias_hash).map((e) => e.id),
    ).toEqual(["cc", "bcc", "to"]);
  });

  it("keeps cc and bcc deliveries in the default view", () => {
    const view = build_alias_view("alias@mydomain.com");
    expect(
      filter_emails_by_view(emails, view, alias_hash).map((e) => e.id),
    ).toEqual(["cc", "bcc", "to", "sent"]);
  });

  it("leaves the sent view to the sender address", () => {
    const view = build_alias_view("alias@mydomain.com", "sent");
    expect(
      filter_emails_by_view(emails, view, alias_hash).map((e) => e.id),
    ).toEqual(["sent"]);
  });

  it("falls back to the to header when the alias hash is unknown", () => {
    const view = build_alias_view("alias@mydomain.com", "received");
    expect(filter_emails_by_view(emails, view).map((e) => e.id)).toEqual([
      "to",
    ]);
  });
});
