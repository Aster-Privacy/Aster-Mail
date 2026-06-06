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

import { classify } from "./mail_categorizer";

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

  it("classifies transactional receipts as updates", () => {
    const envelope = make_envelope({
      from: { name: "Acme Store", email: "receipts@acme.com" },
      subject: "Your order #12345 has shipped",
    });

    expect(classify(envelope)).toBe("updates");
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
        { name: "DKIM-Signature", value: "v=1; a=rsa-sha256; d=mcsv.net; s=k1" },
      ],
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("routes a transactional service notification to Updates", () => {
    const envelope = make_envelope({
      from: { name: "UPS", email: "no-reply@ups.com" },
      subject: "Your package was delivered",
    });

    expect(classify(envelope)).toBe("updates");
  });

  it("routes a receipt from a service domain with no bulk markers to Updates", () => {
    const envelope = make_envelope({
      from: { name: "Amazon", email: "auto-confirm@amazon.com" },
      subject: "Your order #112-9 has shipped",
    });

    expect(classify(envelope)).toBe("updates");
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
});
