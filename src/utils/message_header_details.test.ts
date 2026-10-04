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
  format_raw_headers,
  get_dkim_domains,
  get_mailed_by,
  get_mailing_list,
  get_message_id,
  get_reply_to,
  get_signed_by,
  segment_auth_value,
  to_display_headers,
} from "./message_header_details";

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
