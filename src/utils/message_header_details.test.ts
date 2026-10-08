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

import {
  count_aster_added_headers,
  format_raw_headers,
  get_body_format,
  get_dkim_domains,
  get_mailed_by,
  get_mailing_list,
  get_message_id,
  get_reply_to,
  get_signed_by,
  segment_auth_value,
  to_display_headers,
} from "./message_header_details";

const ARRIVED = [
  { name: "Delivered-To", value: "alex@astermail.org" },
  {
    name: "X-Aster-Spam",
    value: "verdict=inbox; score=1.2; threshold=6; reason=none",
  },
  {
    name: "Received",
    value:
      "from mail-out.shop.example (mail-out.shop.example [192.0.2.25])\r\n\tby mx.astermail.org (Stalwart SMTP) with ESMTPS id 4AbCdE for <alex@astermail.org>; Thu, 8 Oct 2026 09:21:04 +0000",
  },
  {
    name: "Authentication-Results",
    value:
      "mx.astermail.org;\r\n\tdkim=pass header.d=shop.example;\r\n\tspf=pass smtp.mailfrom=shop.example;\r\n\tdmarc=pass header.from=shop.example",
  },
  {
    name: "Received-SPF",
    value:
      "pass (mx.astermail.org: domain of bounce@shop.example designates 192.0.2.25 as permitted sender) receiver=mx.astermail.org; client-ip=192.0.2.25",
  },
  {
    name: "ARC-Seal",
    value: "i=1; a=rsa-sha256; s=arc; d=astermail.org; cv=none; b=AAAA",
  },
  {
    name: "ARC-Message-Signature",
    value: "i=1; a=rsa-sha256; s=arc; d=astermail.org; h=From; b=BBBB",
  },
  {
    name: "ARC-Authentication-Results",
    value: "i=1; mx.astermail.org; dkim=pass; spf=pass; dmarc=pass",
  },
  { name: "Return-Path", value: "<bounce@shop.example>" },
  { name: "X-Spamd-Bar", value: "/" },
  { name: "X-Spamd-Result", value: "default: False [0.40 / 15.00]" },
  { name: "X-Rspamd-Action", value: "no action" },
  { name: "X-Rspamd-Server", value: "filter-2" },
  { name: "X-Spam-Status", value: "No, score=0.40" },
  {
    name: "DKIM-Signature",
    value: "v=1; a=rsa-sha256; d=shop.example; s=s1; b=CCCC",
  },
  {
    name: "Received",
    value: "by internal.shop.example with SMTP; Thu, 8 Oct 2026 09:21:00 +0000",
  },
  {
    name: "Authentication-Results",
    value: "mx.astermail.org; dkim=pass; spf=pass; dmarc=pass",
  },
  {
    name: "Authentication-Results",
    value: "mx.microsoft.com 1; spf=fail smtp.mailfrom=shop.example",
  },
  { name: "X-Spam-Status", value: "No, score=-5.0" },
  { name: "From", value: "Shop <news@shop.example>" },
];

const marks = (headers: { name: string; value: string }[]) =>
  to_display_headers(headers).map((h) => [
    h.name,
    h.added_before_aster,
    h.highlight_results,
  ]);

const PASS = { spf_result: "pass", dkim_result: "pass", dmarc_result: "pass" };

describe("format_raw_headers", () => {
  it("joins name and value exactly, keeping folds and colons", () => {
    const headers = [
      { name: "Received", value: "from a.example\r\n\tby b.example; Wed" },
      { name: "X-Test-2", value: "a: b: c" },
    ];

    expect(format_raw_headers(headers)).toBe(
      "Received: from a.example\r\n\tby b.example; Wed\nX-Test-2: a: b: c",
    );
    expect(format_raw_headers([])).toBeNull();
    expect(format_raw_headers(undefined)).toBeNull();
  });
});

describe("to_display_headers", () => {
  it("keeps folded values, names with digits and dashes, and colons in values", () => {
    const [received, custom, colon] = to_display_headers([
      { name: "Received", value: "from a.example\r\n\tby b.example" },
      { name: "X-MS-Exchange-Organization-SCL2", value: "1" },
      { name: "Subject", value: "Re: re: ping" },
    ]);

    expect(received.value).toBe("from a.example\n\tby b.example");
    expect(received.has_valid_name).toBe(true);
    expect(received.help).toBe("received");
    expect(custom.has_valid_name).toBe(true);
    expect(custom.help).toBeUndefined();
    expect(colon.value).toBe("Re: re: ping");
  });

  it("flags a malformed name instead of styling it", () => {
    const [bad, empty] = to_display_headers([
      { name: "Bad Name", value: "x" },
      { name: "", value: "orphan continuation" },
    ]);

    expect(bad.has_valid_name).toBe(false);
    expect(empty.has_valid_name).toBe(false);
    expect(bad.help).toBeUndefined();
  });

  it("offers help once per kind of header", () => {
    const shown = to_display_headers([
      { name: "Received", value: "1" },
      { name: "received", value: "2" },
      { name: "ARC-Seal", value: "i=1" },
      { name: "ARC-Message-Signature", value: "i=1" },
      { name: "X-Spam-Score", value: "1" },
      { name: "Content-Type", value: "text/plain" },
    ]).map((h) => h.help);

    expect(shown).toEqual([
      "received",
      undefined,
      "arc",
      undefined,
      "spam",
      undefined,
    ]);
  });

  it("decodes encoded words in the subject and in address display names", () => {
    const values = to_display_headers([
      {
        name: "Subject",
        value: "=?utf-8?Q?CAF=C3=89=20CONCERTS=202026=20|=20Spring=20season?=",
      },
      { name: "Subject", value: "Re: =?UTF-8?B?T2zDoSwgbXVuZG8=?= again" },
      {
        name: "Subject",
        value: "=?ISO-8859-1?Q?Caf=E9?= =?iso-8859-1?B?Q2Fm6Q==?=",
      },
      {
        name: "Subject",
        value: "=?utf-8?Q?Ol=C3=A1?=\r\n =?utf-8?Q?_mundo?=",
      },
      {
        name: "From",
        value: "=?utf-8?B?w5xuw69jw7hkw6kgU2hvcA==?= <news@shop.example>",
      },
      {
        name: "Reply-To",
        value: '"=?utf-8?Q?Example_Tickets?=" <reply@shop.example>',
      },
    ]).map((h) => h.value);

    expect(values).toEqual([
      "CAFÉ CONCERTS 2026 | Spring season",
      "Re: Olá, mundo again",
      "CaféCafé",
      "Olá mundo",
      "Ünïcødé Shop <news@shop.example>",
      '"Example Tickets" <reply@shop.example>',
    ]);
  });

  it("leaves malformed words and structured headers as they are", () => {
    const values = to_display_headers([
      { name: "Subject", value: "=?utf-8?Q?unterminated" },
      { name: "Subject", value: "=?utf-8?X?abc?=" },
      { name: "Subject", value: "=?utf-8?B?not*base64?=" },
      { name: "Subject", value: "=?no-such-charset?Q?plain?=" },
      { name: "Message-ID", value: "<=?utf-8?Q?id?=@shop.example>" },
      { name: "DKIM-Signature", value: "v=1; z=Subject:=?utf-8?Q?x?=" },
    ]).map((h) => h.value);

    expect(values).toEqual([
      "=?utf-8?Q?unterminated",
      "=?utf-8?X?abc?=",
      "=?utf-8?B?not*base64?=",
      "plain",
      "<=?utf-8?Q?id?=@shop.example>",
      "v=1; z=Subject:=?utf-8?Q?x?=",
    ]);
  });

  it("does not let a decoded line break start a fake header line", () => {
    const [subject] = to_display_headers([
      {
        name: "Subject",
        value: "=?utf-8?B?YQ0KRnJvbTogY2VvQGJhbmsuZXhhbXBsZQ==?=",
      },
    ]);

    expect(subject.value).toBe("a  From: ceo@bank.example");
  });
});

describe("headers added before the message reached Aster", () => {
  it("ends Aster's block at the first header the sender wrote", () => {
    expect(count_aster_added_headers(ARRIVED)).toBe(14);
  });

  it("labels sender-added results and keeps only Aster's coloured", () => {
    expect(marks(ARRIVED)).toEqual([
      ["Delivered-To", false, false],
      ["X-Aster-Spam", false, false],
      ["Received", false, false],
      ["Authentication-Results", false, true],
      ["Received-SPF", false, true],
      ["ARC-Seal", false, false],
      ["ARC-Message-Signature", false, false],
      ["ARC-Authentication-Results", false, true],
      ["Return-Path", false, false],
      ["X-Spamd-Bar", false, false],
      ["X-Spamd-Result", false, false],
      ["X-Rspamd-Action", false, false],
      ["X-Rspamd-Server", false, false],
      ["X-Spam-Status", false, false],
      ["DKIM-Signature", false, false],
      ["Received", false, false],
      ["Authentication-Results", true, false],
      ["Authentication-Results", true, false],
      ["X-Spam-Status", true, false],
      ["From", false, false],
    ]);
  });

  it("labels every result when the newest Received is not Aster's", () => {
    const headers = [
      { name: "X-Aster-Spam", value: "verdict=inbox" },
      { name: "Received", value: "from a.example by mx.other.example" },
      {
        name: "Authentication-Results",
        value: "mx.astermail.org; dmarc=pass",
      },
      { name: "Received", value: "from b.example by mx.astermail.org" },
      { name: "Received-SPF", value: "pass (mx.astermail.org: ok)" },
    ];

    expect(count_aster_added_headers(headers)).toBe(0);
    expect(marks(headers).filter(([, added]) => added)).toEqual([
      ["X-Aster-Spam", true, false],
      ["Authentication-Results", true, false],
      ["Received-SPF", true, false],
    ]);
  });

  it("labels every result when there is no Received header", () => {
    const headers = [
      { name: "Authentication-Results", value: "mx.astermail.org; spf=pass" },
      { name: "X-Spam-Status", value: "No" },
    ];

    expect(marks(headers)).toEqual([
      ["Authentication-Results", true, false],
      ["X-Spam-Status", true, false],
    ]);
  });

  it("reads Aster's Received by its layout, not by a mention of the host", () => {
    const rest = ARRIVED.slice(3);
    const with_top = (value: string) => [
      ...ARRIVED.slice(0, 2),
      { name: "Received", value },
      ...rest,
    ];

    expect(
      count_aster_added_headers(
        with_top(
          "from a.example (by mx.astermail.org ) by mx.other.example with ESMTP",
        ),
      ),
    ).toBe(0);
    expect(
      count_aster_added_headers(
        with_top("from a.example by mx.other.example (by mx.astermail.org )"),
      ),
    ).toBe(0);
    expect(
      count_aster_added_headers(
        with_top("from a.example (b.example by mx.astermail.org with ESMTP"),
      ),
    ).toBe(0);
    expect(
      count_aster_added_headers(
        with_top("from a.example) by mx.astermail.org with ESMTP"),
      ),
    ).toBe(0);
    expect(
      count_aster_added_headers(
        with_top("from a.example by mx.astermail.org.other.example with ESMTP"),
      ),
    ).toBe(0);
    expect(
      count_aster_added_headers(
        with_top(
          "from a.example (a.example [192.0.2.1])\r\n\tby mx.astermail.org (Stalwart SMTP) with ESMTPS",
        ),
      ),
    ).toBe(14);
  });

  it("reads Aster's Received-SPF by its layout, not by a later mention", () => {
    const top = ARRIVED.slice(0, 4);
    const spf = (value: string) => [...top, { name: "Received-SPF", value }];

    expect(
      count_aster_added_headers(
        spf("pass (mx.other.example: ok) receiver=mx.astermail.org"),
      ),
    ).toBe(4);
    expect(
      count_aster_added_headers(
        spf("pass (mx.other.example: ok (mx.astermail.org: ok))"),
      ),
    ).toBe(4);
    expect(
      count_aster_added_headers(spf("pass (mx.astermail.org: ok) x=y")),
    ).toBe(5);
  });

  it("does not stretch Aster's block over a sender's look-alike lines", () => {
    const top = ARRIVED.slice(0, 4);
    const after_return_path = [
      ...top,
      { name: "Return-Path", value: "<bounce@shop.example>" },
      {
        name: "Received-SPF",
        value: "pass (mx.astermail.org: ok) receiver=mx.astermail.org",
      },
      {
        name: "ARC-Authentication-Results",
        value: "i=2; mx.astermail.org; dmarc=pass",
      },
    ];
    const second_copy = [
      ...top,
      {
        name: "Authentication-Results",
        value: "mx.astermail.org; dmarc=pass",
      },
    ];
    const other_signer = [
      ...top,
      { name: "ARC-Seal", value: "i=2; d=astermail.org.evil.example; b=x" },
      {
        name: "ARC-Authentication-Results",
        value: "i=2; mx.astermail.org.evil.example; dmarc=pass",
      },
    ];

    expect(count_aster_added_headers(after_return_path)).toBe(5);
    expect(count_aster_added_headers(second_copy)).toBe(4);
    expect(count_aster_added_headers(other_signer)).toBe(4);
    expect(
      marks(after_return_path)
        .slice(5)
        .every(([, added, coloured]) => added && !coloured),
    ).toBe(true);
  });
});

describe("segment_auth_value", () => {
  it("marks each result token and keeps the text intact", () => {
    const value =
      "mx.example; dkim=pass header.d=a.example; spf=softfail smtp.mailfrom=a.example; dmarc=fail";
    const segments = segment_auth_value("Authentication-Results", value);

    expect(segments.map((s) => s.text).join("")).toBe(value);
    expect(
      segments.filter((s) => s.status).map((s) => [s.text, s.status]),
    ).toEqual([
      ["pass", "pass"],
      ["softfail", "other"],
      ["fail", "fail"],
    ]);
  });

  it("marks the leading verdict of Received-SPF", () => {
    const segments = segment_auth_value(
      "Received-SPF",
      "Pass (sender SPF authorized) identity=mailfrom",
    );

    expect(segments[0]).toEqual({ text: "Pass", status: "pass" });
  });
});

describe("header insights", () => {
  it("reads the topmost Return-Path domain", () => {
    expect(
      get_mailed_by(
        [
          { name: "Return-Path", value: "<bounce@Mail.Shop.example>" },
          { name: "Return-Path", value: "<other@evil.example>" },
        ],
        { spf_result: "pass" },
      ),
    ).toBe("mail.shop.example");
    expect(
      get_mailed_by([{ name: "Return-Path", value: "<>" }], {
        spf_result: "pass",
      }),
    ).toBeNull();
  });

  it("hides the Return-Path domain unless SPF passed", () => {
    const headers = [{ name: "Return-Path", value: "<bounce@shop.example>" }];

    expect(get_mailed_by(headers, { spf_result: "fail" })).toBeNull();
    expect(get_mailed_by(headers, { spf_result: "softfail" })).toBeNull();
    expect(get_mailed_by(headers, {})).toBeNull();
  });

  it("reads d= from folded DKIM signatures", () => {
    expect(
      get_dkim_domains([
        {
          name: "DKIM-Signature",
          value: "v=1; a=rsa-sha256;\r\n\td=Shop.example; s=s1; b=abc",
        },
        { name: "DKIM-Signature", value: "v=1; d=esp.example; b=x" },
        { name: "DKIM-Signature", value: "v=1; d=shop.example; b=y" },
      ]),
    ).toEqual(["shop.example", "esp.example"]);
  });

  it("names the signer only when the recorded DKIM result passed", () => {
    const one = [{ name: "DKIM-Signature", value: "v=1; d=shop.example" }];

    expect(get_signed_by(one, PASS, "news@shop.example")).toBe("shop.example");
    expect(
      get_signed_by(one, { ...PASS, dkim_result: "fail" }, "news@shop.example"),
    ).toBeNull();
  });

  it("picks the aligned signer among several only when DMARC passed", () => {
    const two = [
      { name: "DKIM-Signature", value: "v=1; d=esp.example" },
      { name: "DKIM-Signature", value: "v=1; d=mail.shop.example" },
    ];

    expect(get_signed_by(two, PASS, "news@shop.example")).toBe(
      "mail.shop.example",
    );
    expect(
      get_signed_by(
        two,
        { ...PASS, dmarc_result: "none" },
        "news@shop.example",
      ),
    ).toBeNull();
  });

  it("shows Reply-To only when it differs, and flags another domain", () => {
    const headers = (value: string) => [{ name: "Reply-To", value }];

    expect(
      get_reply_to(headers("news@shop.example"), "News@shop.example"),
    ).toBeNull();
    expect(
      get_reply_to(
        headers("Help <help@support.shop.example>"),
        "news@shop.example",
      ),
    ).toEqual({
      email: "help@support.shop.example",
      name: "Help",
      other_domain: false,
    });
    expect(
      get_reply_to(headers("pay@elsewhere.example"), "news@shop.example")
        ?.other_domain,
    ).toBe(true);
  });

  it("reads List-Id and notes List-Unsubscribe", () => {
    expect(
      get_mailing_list([
        { name: "List-Id", value: "Shop news <news.shop.example>" },
        { name: "List-Unsubscribe", value: "<mailto:u@shop.example>" },
      ]),
    ).toEqual({ id: "news.shop.example", has_unsubscribe: true });
    expect(get_mailing_list([{ name: "Subject", value: "x" }])).toBeNull();
  });

  it("brackets a bare Message-ID", () => {
    expect(
      get_message_id([{ name: "Message-Id", value: "abc@x.example" }]),
    ).toBe("<abc@x.example>");
  });
});

describe("get_body_format", () => {
  const ct = (...values: string[]) =>
    values.map((value) => ({ name: "Content-Type", value }));

  it("maps the top-level media type", () => {
    expect(get_body_format(ct("text/plain"))).toBe("plain");
    expect(get_body_format(ct(" TEXT/HTML ; charset=utf-8"))).toBe("html");
    expect(get_body_format(ct('multipart/alternative; boundary="x"'))).toBe(
      "html_and_plain",
    );
  });

  it("returns null when the structure is unknown or contradictory", () => {
    expect(get_body_format(undefined)).toBeNull();
    expect(get_body_format([])).toBeNull();
    expect(get_body_format(ct("multipart/mixed"))).toBeNull();
    expect(get_body_format(ct("multipart/related"))).toBeNull();
    expect(get_body_format(ct("text/calendar"))).toBeNull();
    expect(get_body_format(ct("text/plain", "text/html"))).toBeNull();
    expect(get_body_format(ct("text/plain", "text/plain"))).toBe("plain");
  });
});
