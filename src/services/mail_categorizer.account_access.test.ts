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

const ses_headers = [
  {
    name: "Return-Path",
    value: "<0101019a5b7c1234-abcd@us-west-2.amazonses.com>",
  },
  {
    name: "DKIM-Signature",
    value: "v=1; a=rsa-sha256; d=browser-sync.example; s=s1; bh=abc",
  },
  { name: "Feedback-ID", value: "1.us-west-2.abc=:AmazonSES" },
  { name: "X-SES-Outgoing", value: "2026.11.06-54.240.1.1" },
];

function envelope(
  from_email: string,
  subject: string,
  raw_headers: { name: string; value: string }[] = [],
  list_unsubscribe?: string,
): DecryptedEnvelope {
  return {
    subject,
    body_text: "",
    from: { name: "", email: from_email },
    to: [],
    cc: [],
    bcc: [],
    sent_at: "2026-11-06T04:25:20Z",
    raw_headers,
    ...(list_unsubscribe ? { list_unsubscribe } : {}),
  };
}

describe("account access mail", () => {
  it("keeps an English sign-in verification in Primary", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "Verify this sign-in",
      ses_headers,
    );

    expect(classify(env, null)).toBe("primary");
  });

  it("keeps an English code subject in Primary", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "Use 482913 to confirm your account",
      ses_headers,
    );

    expect(classify(env, null)).toBe("primary");
  });

  it("keeps a Simplified Chinese sign-in verification in Primary", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "验证此次登录",
      ses_headers,
    );

    expect(classify(env, null)).toBe("primary");
  });

  it("keeps a Simplified Chinese code subject in Primary", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "您的验证码：482913",
      ses_headers,
    );

    expect(classify(env, null)).toBe("primary");
  });

  it("keeps a Simplified Chinese account confirmation in Primary", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "请确认您的帐户",
      ses_headers,
    );

    expect(classify(env, null)).toBe("primary");
  });

  it("keeps mail with a verification code header in Primary in any language", () => {
    const env = envelope("accounts@browser-sync.example", "Account notice", [
      ...ses_headers,
      { name: "X-Verify-Short-Code", value: "482913" },
    ]);

    expect(classify(env, null)).toBe("primary");
  });

  it.each([
    "Ihr Bestätigungscode",
    "Votre code de sécurité",
    "Tu código de verificación",
    "Seu código de verificação",
    "認証コードのお知らせ",
    "인증 코드 안내",
    "Ваш код подтверждения",
    "Reset your password",
    "Your sign-in link",
    "Confirm your email address",
    "123456 is your login code",
  ])("keeps %s in Primary", (subject) => {
    const env = envelope("no-reply@service.example.test", subject, ses_headers);

    expect(classify(env, null)).toBe("primary");
  });

  it("keeps a new sign-in alert in Updates", () => {
    const env = envelope(
      "no-reply@github.com",
      "A new sign-in to your account",
      [{ name: "Auto-Submitted", value: "auto-generated" }],
    );

    expect(classify(env, null)).toBe("updates");
  });

  it("does not treat a promo code as account access", () => {
    const env = envelope(
      "deals@shop.example.test",
      "Use promo code SAVE20 today only",
      ses_headers,
      "<mailto:unsubscribe@shop.example.test>",
    );

    expect(classify(env, null)).toBe("promotions");
  });

  it("does not treat a promotional subject with a code header as account access", () => {
    const env = envelope(
      "deals@shop.example.test",
      "Flash sale: 40% off your verification kit",
      [...ses_headers, { name: "X-Verify-Code", value: "482913" }],
      "<mailto:unsubscribe@shop.example.test>",
    );

    expect(classify(env, null)).toBe("promotions");
  });

  it("keeps an ordinary shipping notice in Transactions", () => {
    const env = envelope(
      "notifications@shop.example.test",
      "Your package has shipped",
      ses_headers,
    );

    expect(classify(env, null)).toBe("transactions");
  });

  it("keeps an ordinary appointment notice in Updates", () => {
    const env = envelope(
      "notifications@clinic.example.test",
      "Your appointment is tomorrow",
      ses_headers,
    );

    expect(classify(env, null)).toBe("updates");
  });

  it("keeps a bulk marketing send in Promotions", () => {
    const env = envelope(
      "news@shop.example.test",
      "New arrivals for the season",
      ses_headers,
      "<mailto:unsubscribe@shop.example.test>",
    );

    expect(classify(env, null)).toBe("promotions");
  });

  it("moves mail with a stale unpinned category back to Primary", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "Verify this sign-in",
      ses_headers,
    );
    const meta = {
      category: "updates",
      category_pinned: false,
    } as unknown as MailItemMetadata;

    expect(classify(env, meta)).toBe("primary");
  });

  it("keeps a category the user pinned", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "Verify this sign-in",
      ses_headers,
    );
    const meta = {
      category: "updates",
      category_pinned: true,
    } as unknown as MailItemMetadata;

    expect(classify(env, meta)).toBe("updates");
  });

  it("lets a mail rule category win", () => {
    const env = envelope(
      "accounts@browser-sync.example",
      "Verify this sign-in",
      ses_headers,
    );

    expect(classify(env, null, { rule_category: "updates" })).toBe("updates");
  });
});
