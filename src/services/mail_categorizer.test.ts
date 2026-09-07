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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";

import { describe, it, expect } from "vitest";

import { classify, is_locked_to_primary } from "./mail_categorizer";

import { BUILTIN_CATEGORIES, fold_builtin } from "@/data/category_catalog";

function make_envelope(
  overrides: Partial<DecryptedEnvelope> & {
    from: { name: string; email: string };
  },
): DecryptedEnvelope {
  return {
    subject: "",
    body_text: "",
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-06-06T00:00:00Z",
    ...overrides,
  };
}

describe("classify", () => {
  it("returns the pinned category regardless of signals", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "noreply@linkedin.com" },
    });
    const metadata = {
      category: "primary",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    expect(classify(envelope, metadata)).toBe("primary");
  });

  it("keeps an official Aster sign-in alert in Primary despite a stale pin", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@astermail.org" },
      subject: "New Sign-In to Your Aster Mail Account",
    });
    const metadata = {
      category: "social",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    const trust = { system_origin: true, is_external: false };

    expect(classify(envelope, metadata, { trust })).toBe("primary");
    expect(is_locked_to_primary(envelope, trust)).toBe(true);
  });

  it("does not lock a spoofed inbound copy of a sign-in alert to Primary", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@astermail.org" },
      subject: "New Sign-In to Your Aster Mail Account",
    });
    const trust = { system_origin: false, is_external: true };

    expect(is_locked_to_primary(envelope, trust)).toBe(false);
    expect(is_locked_to_primary(envelope)).toBe(false);
  });

  it("honors a pin on personal mail from an Aster address", () => {
    const envelope = make_envelope({
      from: { name: "Rowan", email: "rowan@astermail.org" },
      subject: "Photos from the weekend",
    });
    const metadata = {
      category: "social",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    expect(classify(envelope, metadata)).toBe("social");
    expect(is_locked_to_primary(envelope)).toBe(false);
  });

  it("does not lock a spoofed official Aster sender to Primary", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@astermail.org" },
      sender_verification: "invalid",
    });

    expect(is_locked_to_primary(envelope)).toBe(false);
  });

  it("classifies known social domains as social", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
      subject: "You have 3 new connections",
    });

    expect(classify(envelope)).toBe("social");
  });

  it("classifies mailing-list headers as forums", () => {
    const envelope = make_envelope({
      from: { name: "Dev List", email: "list@example.org" },
      subject: "[dev] weekly digest",
      raw_headers: [{ name: "List-Id", value: "<dev.example.org>" }],
    });

    expect(classify(envelope)).toBe("forums");
  });

  it("classifies transactional receipts as transactions", () => {
    const envelope = make_envelope({
      from: { name: "Acme Store", email: "receipts@acme.com" },
      subject: "Your order #12345 has shipped",
    });

    expect(classify(envelope)).toBe("transactions");
  });

  it("classifies bulk marketing as promotions", () => {
    const envelope = make_envelope({
      from: { name: "Acme Deals", email: "marketing@acme.com" },
      subject: "50% off everything this weekend",
      list_unsubscribe: "<https://acme.com/unsub>",
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("classifies a plain human sender as primary", () => {
    const envelope = make_envelope({
      from: { name: "Jane Doe", email: "jane@gmail.com" },
      subject: "Lunch tomorrow?",
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("treats generic bulk mail without promo/updates signals as promotions", () => {
    const envelope = make_envelope({
      from: { name: "Some Newsletter", email: "hello@somesite.com" },
      subject: "This week at SomeSite",
      list_unsubscribe: "<mailto:unsub@somesite.com>",
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("always keeps system/internal Aster mail in Primary", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "welcome@astermail.org" },
      subject: "Welcome to Aster - 50% off Nova this week",
      list_unsubscribe: "<https://astermail.org/unsub>",
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("keeps personal mail with transactional-sounding subjects in Primary", () => {
    const envelope = make_envelope({
      from: { name: "Bob", email: "bob@gmail.com" },
      subject: "Your order for the concert tickets this weekend",
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("keeps personal mail with promo-sounding words in Primary", () => {
    const envelope = make_envelope({
      from: { name: "Mom", email: "mom@gmail.com" },
      subject: "Huge sale at the mall, want to go?",
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("detects a brand mailing through a marketing ESP via DKIM d=", () => {
    const envelope = make_envelope({
      from: { name: "Cool Brand", email: "hello@coolbrand.com" },
      subject: "This week at Cool Brand",
      raw_headers: [
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=mcsv.net; s=k1",
        },
      ],
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("routes a delivery notification to Transactions", () => {
    const envelope = make_envelope({
      from: { name: "UPS", email: "no-reply@ups.com" },
      subject: "Your package was delivered",
    });

    expect(classify(envelope)).toBe("transactions");
  });

  it("routes a receipt from a service domain with no bulk markers to Transactions", () => {
    const envelope = make_envelope({
      from: { name: "Amazon", email: "auto-confirm@amazon.com" },
      subject: "Your order #112-9 has shipped",
    });

    expect(classify(envelope)).toBe("transactions");
  });

  it("keeps a personal note from a service-domain address in Primary", () => {
    const envelope = make_envelope({
      from: { name: "A Recruiter", email: "jane.doe@github.com" },
      subject: "Coffee next week?",
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("does not let a spoofed Aster sender ride the system rule", () => {
    const envelope = make_envelope({
      from: { name: "Aster", email: "no-reply@astermail.org" },
      subject: "50% off Nova - act now",
      list_unsubscribe: "<https://evil.example/unsub>",
      sender_verification: "invalid",
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("keeps a DKIM-verified Aster system mail in Primary", () => {
    const envelope = make_envelope({
      from: { name: "Aster", email: "welcome@astermail.org" },
      subject: "Welcome to Aster",
      sender_verification: "verified",
    });

    expect(classify(envelope)).toBe("primary");
  });
  it("keeps a tagged mailing-list digest in Forums", () => {
    const envelope = make_envelope({
      from: { name: "Dev List", email: "announce@example.org" },
      subject: "[dev] weekly digest",
      raw_headers: [{ name: "List-Id", value: "<dev.example.org>" }],
    });

    expect(classify(envelope)).toBe("forums");
  });

  it("keeps a postable discussion list in Forums", () => {
    const envelope = make_envelope({
      from: { name: "Rust Users", email: "announce@example.org" },
      subject: "Weekly roundup",
      raw_headers: [
        { name: "List-Id", value: "<users.example.org>" },
        { name: "List-Post", value: "<mailto:users@example.org>" },
      ],
    });

    expect(classify(envelope)).toBe("forums");
  });

  it("keeps a discussion-shaped localpart in Forums", () => {
    const envelope = make_envelope({
      from: { name: "Group", email: "discuss@example.org" },
      subject: "Monthly digest",
      raw_headers: [{ name: "List-Id", value: "<discuss.example.org>" }],
    });

    expect(classify(envelope)).toBe("forums");
  });

  it("still routes an editorial send to Newsletters", () => {
    const envelope = make_envelope({
      from: { name: "The Daily", email: "editor@example.org" },
      subject: "Issue #42",
      raw_headers: [
        { name: "List-Id", value: "<thedaily.example.org>" },
        { name: "List-Unsubscribe", value: "<mailto:u@example.org>" },
      ],
    });

    expect(classify(envelope)).toBe("newsletters");
  });
});

describe("category folding", () => {
  it("folds Transactions back into Updates", () => {
    expect(fold_builtin("transactions")).toBe("updates");
  });

  it("folds Newsletters back into Promotions", () => {
    expect(fold_builtin("newsletters")).toBe("promotions");
  });

  it("leaves both new tabs off by default", () => {
    expect(
      BUILTIN_CATEGORIES.find((c) => c.id === "transactions")?.default_enabled,
    ).toBe(false);
    expect(
      BUILTIN_CATEGORIES.find((c) => c.id === "newsletters")?.default_enabled,
    ).toBe(false);
  });
});
