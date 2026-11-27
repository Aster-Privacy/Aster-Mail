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

import {
  classify,
  is_locked_to_primary,
  learned_category_for,
} from "./mail_categorizer";

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

  it("keeps an official Aster sign-in alert in primary despite a pin to deals", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@astermail.org" },
      subject: "A new sign-in on Windows PC",
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    const trust = { system_origin: true, is_external: false };

    expect(classify(envelope, metadata, { trust })).toBe("primary");
    expect(classify(envelope, null, { trust })).toBe("primary");
    expect(is_locked_to_primary(envelope, trust)).toBe(true);
  });

  it("keeps server-proven Aster system mail in primary over a pin and a sender rule", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "mailer-daemon@astermail.org" },
      subject: "Delivery status notification",
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;
    const trust = { system_origin: true, is_external: false };

    expect(is_locked_to_primary(envelope, trust)).toBe(true);
    expect(
      classify(envelope, metadata, { trust, rule_category: "promotions" }),
    ).toBe("primary");
  });

  it("keeps verified internal mail from an official Aster role in primary despite a pin", () => {
    const envelope = make_envelope({
      from: { name: "Aster Security", email: "security@astermail.org" },
      sender_verification: "verified",
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;
    const trust = { is_external: false };

    expect(classify(envelope, metadata, { trust })).toBe("primary");
  });

  it("honors a pin on mail that only claims to be Aster in its display name", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@aster-mail-security.com" },
      subject: "A new sign-in on Windows PC",
      sender_verification: "verified",
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;
    const trust = { system_origin: true, is_external: true };

    expect(is_locked_to_primary(envelope, trust)).toBe(false);
    expect(classify(envelope, metadata, { trust })).toBe("promotions");
  });

  it("does not lock an external copy of an official Aster address with a pin", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@astermail.org" },
      subject: "A new sign-in on Windows PC",
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;
    const trust = { system_origin: true, is_external: true };

    expect(is_locked_to_primary(envelope, trust)).toBe(false);
    expect(classify(envelope, metadata, { trust })).toBe("promotions");
  });

  it("ignores a learned sender for an official Aster sign-in alert", () => {
    const envelope = make_envelope({
      from: { name: "Aster Mail", email: "no-reply@astermail.org" },
      subject: "New Sign-In to Your Aster Mail Account",
    });
    const trust = { system_origin: true, is_external: false };
    const learned_senders = new Map([["no-reply@astermail.org", "social"]]);

    expect(classify(envelope, null, { trust, learned_senders })).toBe(
      "primary",
    );
  });

  it("puts mail from a learned sender in the learned category over heuristics", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "Notifications@LinkedIn.com" },
    });
    const learned_senders = new Map([
      ["notifications@linkedin.com", "promotions"],
    ]);

    expect(classify(envelope, null, { learned_senders })).toBe("promotions");
    expect(
      classify(
        make_envelope({
          from: { name: "LinkedIn", email: "notifications@linkedin.com" },
        }),
        null,
      ),
    ).toBe("social");
  });

  it("lets a server rule category beat a learned sender", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
    });
    const learned_senders = new Map([
      ["notifications@linkedin.com", "promotions"],
    ]);

    expect(
      classify(envelope, null, { learned_senders, rule_category: "updates" }),
    ).toBe("updates");
  });

  it("ignores a learned sender when sender verification is invalid", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
      sender_verification: "invalid",
    });
    const learned_senders = new Map([
      ["notifications@linkedin.com", "promotions"],
    ]);

    expect(classify(envelope, null, { learned_senders })).toBe("social");
  });

  it("keeps account access mail in Primary for a learned sender", () => {
    const envelope = make_envelope({
      from: { name: "Shop", email: "deals@shop.example" },
      subject: "Your verification code is 482913",
    });
    const learned_senders = new Map([["deals@shop.example", "promotions"]]);

    expect(classify(envelope, null, { learned_senders })).toBe("primary");
    expect(
      classify(
        make_envelope({
          from: { name: "Shop", email: "deals@shop.example" },
          subject: "Spring catalog",
        }),
        null,
        { learned_senders },
      ),
    ).toBe("promotions");
  });

  it("ignores a learned entry for an Aster-domain sender", () => {
    const envelope = make_envelope({
      from: { name: "Friend", email: "friend@astermail.org" },
    });
    const learned_senders = new Map([["friend@astermail.org", "social"]]);
    const trust = { is_external: false };

    expect(classify(envelope, null, { trust, learned_senders })).toBe(
      "primary",
    );
    expect(learned_category_for(envelope, learned_senders, trust)).toBe(
      undefined,
    );
  });

  it("ignores a learned sender whose SPF, DKIM or DMARC failed", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
    });
    const learned_senders = new Map([
      ["notifications@linkedin.com", "promotions"],
    ]);

    for (const trust of [
      { spf_result: "fail" },
      { dkim_result: "FAIL" },
      { dmarc_result: "hardfail" },
    ]) {
      expect(classify(envelope, null, { trust, learned_senders })).toBe(
        "social",
      );
    }
    expect(
      classify(envelope, null, {
        trust: { spf_result: "pass", dkim_result: "none" },
        learned_senders,
      }),
    ).toBe("promotions");
  });

  it("applies a learned sender when there is no verification result", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
    });
    const learned_senders = new Map([
      ["notifications@linkedin.com", "promotions"],
    ]);

    expect(classify(envelope, null, { trust: {}, learned_senders })).toBe(
      "promotions",
    );
  });

  it("lets a user pin beat a learned sender", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
    });
    const metadata = {
      category: "updates",
      category_pinned: true,
    } as unknown as MailItemMetadata;
    const learned_senders = new Map([
      ["notifications@linkedin.com", "promotions"],
    ]);

    expect(classify(envelope, metadata, { learned_senders })).toBe("updates");
  });

  it("ignores a learned custom category that is not enabled", () => {
    const envelope = make_envelope({
      from: { name: "LinkedIn", email: "notifications@linkedin.com" },
    });
    const learned_senders = new Map([
      ["notifications@linkedin.com", "custom:missing"],
    ]);

    expect(
      classify(envelope, null, { learned_senders, custom_categories: [] }),
    ).toBe("social");
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

  it("treats generic bulk mail without promo/updates signals as a newsletter", () => {
    const envelope = make_envelope({
      from: { name: "Some Newsletter", email: "hello@somesite.com" },
      subject: "This week at SomeSite",
      list_unsubscribe: "<mailto:unsub@somesite.com>",
    });

    expect(classify(envelope)).toBe("newsletters");
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

    expect(classify(envelope)).toBe("newsletters");
  });

  it("still sends a selling subject through a marketing ESP to promotions", () => {
    const envelope = make_envelope({
      from: { name: "Cool Brand", email: "hello@coolbrand.com" },
      subject: "Last chance: 30% off sitewide",
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
  it("keeps personal mailbox mail with a feedback id in primary", () => {
    const envelope = make_envelope({
      from: { name: "Sam", email: "sam@proton.me" },
      subject: "Test delivery confirmation",
      raw_headers: [
        { name: "Feedback-ID", value: "abc123:proton" },
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=proton.me; s=x",
        },
      ],
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("keeps personal mailbox mail from a generic localpart in primary", () => {
    const envelope = make_envelope({
      from: { name: "Alex", email: "contact@gmail.com" },
      subject: "Payment for dinner last night",
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("does not force a personal mailbox address on a list into primary", () => {
    const envelope = make_envelope({
      from: { name: "Deals", email: "deals@gmail.com" },
      subject: "Weekend sale starts now",
      list_unsubscribe: "<mailto:unsubscribe@example.com>",
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("does not force bulk-service mail from a personal mailbox address into primary", () => {
    const envelope = make_envelope({
      from: { name: "Billing", email: "billing@outlook.com" },
      subject: "Your receipt",
      raw_headers: [
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=sendgrid.net; s=x",
        },
      ],
    });

    expect(classify(envelope)).toBe("transactions");
  });
});

describe("category folding", () => {
  it("folds Transactions back into Updates", () => {
    expect(fold_builtin("transactions")).toBe("updates");
  });

  it("folds Newsletters into Updates so Deals keeps only selling mail", () => {
    expect(fold_builtin("newsletters")).toBe("updates");
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

describe("deals precision", () => {
  const esp_headers = [
    {
      name: "DKIM-Signature",
      value: "v=1; a=rsa-sha256; d=sendgrid.net; s=s1",
    },
  ];
  const marketing_cloud_headers = [
    {
      name: "DKIM-Signature",
      value: "v=1; a=rsa-sha256; d=exacttarget.com; s=s1",
    },
  ];

  it("keeps an MFA request out of Deals", () => {
    const envelope = make_envelope({
      from: { name: "Ubiquiti", email: "no-reply@ui.com" },
      subject: "UniFi MFA Request",
      list_unsubscribe: "<https://ui.com/unsub>",
      raw_headers: esp_headers,
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("keeps a multi-factor authentication code out of Deals", () => {
    const envelope = make_envelope({
      from: { name: "Some Service", email: "no-reply@someservice.example" },
      subject: "Your multi-factor authentication code",
      raw_headers: esp_headers,
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("keeps a sign-in approval prompt out of Deals", () => {
    const envelope = make_envelope({
      from: { name: "Some Service", email: "no-reply@someservice.example" },
      subject: "Approve your sign-in",
      raw_headers: esp_headers,
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("sends other Ubiquiti account mail to Updates", () => {
    const envelope = make_envelope({
      from: { name: "Ubiquiti", email: "no-reply@ui.com" },
      subject: "Your console firmware was updated",
      raw_headers: esp_headers,
    });

    expect(classify(envelope)).toBe("updates");
  });

  it("files an insurer's base rate notice under Finance", () => {
    const envelope = make_envelope({
      from: { name: "Aviva", email: "news@email.aviva.co.uk" },
      subject: "The Bank of England has changed the base rate",
      list_unsubscribe: "<https://aviva.co.uk/unsub>",
      raw_headers: marketing_cloud_headers,
    });

    expect(classify(envelope)).toBe("finance");
  });

  it("files sports news from a marketing platform under Newsletters", () => {
    const envelope = make_envelope({
      from: { name: "UEFA", email: "news@news.uefa.com" },
      subject: "Conference League: matchday 4 preview",
      list_unsubscribe: "<https://uefa.com/unsub>",
      raw_headers: marketing_cloud_headers,
    });

    expect(classify(envelope)).toBe("newsletters");
  });

  it("no longer treats a news@ sender as selling", () => {
    const envelope = make_envelope({
      from: { name: "Town Council", email: "news@towncouncil.example" },
      subject: "Road closures this month",
      list_unsubscribe: "<https://towncouncil.example/unsub>",
    });

    expect(classify(envelope)).toBe("newsletters");
  });

  it("keeps an offers@ sender in Deals", () => {
    const envelope = make_envelope({
      from: { name: "Shop", email: "offers@shop.example" },
      subject: "Picked for you",
      list_unsubscribe: "<https://shop.example/unsub>",
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("keeps emoji-led bulk marketing in Deals", () => {
    const envelope = make_envelope({
      from: { name: "Shop", email: "hello@shop.example" },
      subject: "\u{1F381} Something new for you",
      list_unsubscribe: "<https://shop.example/unsub>",
    });

    expect(classify(envelope)).toBe("promotions");
  });

  it("lets an emoji newsletter issue reach Newsletters", () => {
    const envelope = make_envelope({
      from: { name: "Weekly Read", email: "newsletter@weeklyread.example" },
      subject: "\u{1F4DA} Issue #42",
      list_unsubscribe: "<https://weeklyread.example/unsub>",
      raw_headers: [{ name: "List-Id", value: "<weekly.weeklyread.example>" }],
    });

    expect(classify(envelope)).toBe("newsletters");
  });

  it("keeps account mail sent through an ESP in Updates", () => {
    const envelope = make_envelope({
      from: { name: "Shop", email: "hello@shop.example" },
      subject: "Your account update",
      raw_headers: esp_headers,
    });

    expect(classify(envelope)).toBe("updates");
  });

  it("keeps an MFA request in Deals after the user moves it there", () => {
    const envelope = make_envelope({
      from: { name: "Ubiquiti", email: "no-reply@ui.com" },
      subject: "UniFi MFA Request",
      raw_headers: esp_headers,
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    expect(classify(envelope, metadata)).toBe("promotions");
  });

  it("keeps a base rate notice in Primary after the user moves it there", () => {
    const envelope = make_envelope({
      from: { name: "Aviva", email: "news@email.aviva.co.uk" },
      subject: "The Bank of England has changed the base rate",
      list_unsubscribe: "<https://aviva.co.uk/unsub>",
      raw_headers: marketing_cloud_headers,
    });
    const metadata = {
      category: "primary",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    expect(classify(envelope, metadata)).toBe("primary");
  });

  it("keeps sports news in Deals after the user moves it there", () => {
    const envelope = make_envelope({
      from: { name: "UEFA", email: "news@news.uefa.com" },
      subject: "Conference League: matchday 4 preview",
      list_unsubscribe: "<https://uefa.com/unsub>",
      raw_headers: marketing_cloud_headers,
    });
    const metadata = {
      category: "promotions",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    expect(classify(envelope, metadata)).toBe("promotions");
  });

  it("re-sorts an unpinned category written by an older classifier", () => {
    const envelope = make_envelope({
      from: { name: "UEFA", email: "news@news.uefa.com" },
      subject: "Conference League: matchday 4 preview",
      list_unsubscribe: "<https://uefa.com/unsub>",
      raw_headers: marketing_cloud_headers,
    });
    const metadata = {
      category: "promotions",
      category_pinned: false,
    } as unknown as MailItemMetadata;

    expect(classify(envelope, metadata)).toBe("newsletters");
  });

  it("keeps a personal reply signed by a publishing host in Primary", () => {
    const envelope = make_envelope({
      from: { name: "Geral", email: "geral@schools.example" },
      subject: "Follow-up: Article 28 DPA on Aster Star plan",
      raw_headers: [
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=wordpress.com; s=k1",
        },
        { name: "In-Reply-To", value: "<abc@astermail.org>" },
      ],
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("keeps an unthreaded message from a publishing host without bulk markers out of Newsletters", () => {
    const envelope = make_envelope({
      from: { name: "Geral", email: "geral@schools.example" },
      subject: "Question about your plan",
      raw_headers: [
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=wordpress.com; s=k1",
        },
      ],
    });

    expect(classify(envelope)).toBe("primary");
  });

  it("still files a list issue from a publishing host under Newsletters", () => {
    const envelope = make_envelope({
      from: { name: "Weekly Blog", email: "blog@weekly.example" },
      subject: "This week on the blog",
      list_unsubscribe: "<https://weekly.example/unsub>",
      raw_headers: [
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=wordpress.com; s=k1",
        },
      ],
    });

    expect(classify(envelope)).toBe("newsletters");
  });

  it("does not treat a marketing send with a reply prefix as personal", () => {
    const envelope = make_envelope({
      from: { name: "Cool Brand", email: "hello@coolbrand.com" },
      subject: "Re: your cart",
      raw_headers: [
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256; d=mcsv.net; s=k1",
        },
      ],
    });

    expect(classify(envelope)).not.toBe("primary");
  });
});
