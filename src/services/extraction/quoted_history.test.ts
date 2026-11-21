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
import { describe, it, expect } from "vitest";

import { extract_email_details } from "./extractor";

const reply_subject = "Re: me again - Newsletter bug?";
const support_email = "hello@astermail.org";
const support_name = "Aster Mail";

const reply_text =
  "Hi Sam,\n\nThanks for the report. The newsletter bug is fixed now, so the next issue " +
  "should arrive normally. Let us know if it happens again.\n\nBest,\nThe Aster team";

const payment_lines = [
  "Payment receipt",
  "Thanks for your purchase.",
  "We received your payment of $14.49 for your Aster Mail Star plan.",
  "Amount paid: $14.49",
  "Your plan renews on December 10, 2026.",
  "View or download the invoice in your billing settings.",
];

function details(subject: string, text: string, html?: string) {
  return extract_email_details(
    subject,
    text,
    html,
    support_email,
    support_name,
  );
}

function expect_no_card(subject: string, text: string, html?: string) {
  const result = details(subject, text, html);

  expect(result.has_purchase_details).toBe(false);
  expect(result.has_shipping_details).toBe(false);
}

describe("order detection ignores quoted history", () => {
  it("treats the payment confirmation alone as a receipt", () => {
    expect(
      details("Payment receipt", payment_lines.join("\n")).has_purchase_details,
    ).toBe(true);
  });

  it("ignores a payment confirmation quoted in an html blockquote", () => {
    const html =
      `<div dir="ltr">${reply_text.replace(/\n/g, "<br>")}</div>` +
      "<div>On Mon, Nov 10, 2026 at 3:12 PM Aster Mail &lt;hello@astermail.org&gt; wrote:<br></div>" +
      '<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' +
      payment_lines.map((line) => `<p>${line}</p>`).join("") +
      "</blockquote>";

    expect_no_card(reply_subject, "", html);
  });

  it("ignores a payment confirmation quoted in a cite blockquote", () => {
    const html =
      `<div>${reply_text.replace(/\n/g, "<br>")}</div>` +
      '<blockquote type="cite">' +
      payment_lines.map((line) => `<div>${line}</div>`).join("") +
      "</blockquote>";

    expect_no_card(reply_subject, "", html);
  });

  it("ignores a payment confirmation quoted after an english attribution", () => {
    const text =
      `${reply_text}\n\nOn Mon, Nov 10, 2026 at 3:12 PM Aster Mail <hello@astermail.org> wrote:\n` +
      payment_lines.map((line) => `> ${line}`).join("\n");

    expect_no_card(reply_subject, text);
  });

  it("ignores a payment confirmation below a german header block", () => {
    const text =
      `${reply_text}\n\nVon: Aster Mail <hello@astermail.org>\n` +
      "Datum: Montag, 10. November 2026 um 15:12\n" +
      "An: sam@example.com\n" +
      "Betreff: Zahlungsbeleg\n\n" +
      payment_lines.join("\n");

    expect_no_card(reply_subject, text);
  });

  it("ignores a payment confirmation below a german attribution", () => {
    const text =
      `${reply_text}\n\nAm 10.11.2026 um 15:12 schrieb Aster Mail <hello@astermail.org>:\n\n` +
      payment_lines.join("\n");

    expect_no_card("AW: me again - Newsletter bug?", text);
  });

  it("ignores a payment confirmation below an original message marker", () => {
    const text =
      `${reply_text}\n\n-----Original Message-----\n` + payment_lines.join("\n");

    expect_no_card(reply_subject, text);
  });

  it("still detects a receipt sent as html", () => {
    const html =
      "<html><body><h1>Payment receipt</h1>" +
      payment_lines
        .slice(1)
        .map((line) => `<p>${line}</p>`)
        .join("") +
      "</body></html>";

    expect(
      details("Your Aster Mail receipt", "", html).has_purchase_details,
    ).toBe(true);
  });

  it("still detects a forwarded receipt with a short note on top", () => {
    const text =
      "See below for the receipt.\n\n---------- Forwarded message ---------\n" +
      "From: Aster Mail <hello@astermail.org>\n" +
      "Date: Mon, Nov 10, 2026 at 3:12 PM\n" +
      "Subject: Payment receipt\n\n" +
      payment_lines.join("\n");

    expect(details("Fwd: Payment receipt", text).has_purchase_details).toBe(
      true,
    );
  });

  it("still detects a receipt written in the reply itself", () => {
    const text =
      payment_lines.join("\n") +
      "\n\nOn Mon, Nov 10, 2026 at 3:12 PM Sam <sam@example.com> wrote:\n> Can you send my receipt again?";

    expect(details("Re: Receipt request", text).has_purchase_details).toBe(
      true,
    );
  });
});
