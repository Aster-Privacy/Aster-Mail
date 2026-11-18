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
import type { ReportableMessage } from "./phishing_blocklist";
import type { InboxEmail } from "@/types/email";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  inbox_email_reportable,
  report_not_phishing_once_per_sender,
  report_not_phishing_message,
  report_phishing_message,
} from "./phishing_blocklist";

import { api_client } from "@/services/api/client";

vi.mock("@/services/api/client", () => ({
  api_client: { post: vi.fn() },
}));

const mocked_post = vi.mocked(api_client.post);

async function domain_hash_hex(domain: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(domain),
  );

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function received(fields: Partial<ReportableMessage>): ReportableMessage {
  return {
    item_type: "received",
    is_external: true,
    sender_email: "",
    body: "",
    ...fields,
  };
}

function sent_hashes(): {
  domain_hashes: string[];
  sender_domain_hash?: string;
} {
  return mocked_post.mock.calls[0][1] as {
    domain_hashes: string[];
    sender_domain_hash?: string;
  };
}

beforeEach(() => {
  mocked_post.mockReset();
  mocked_post.mockResolvedValue({ data: { success: true } } as never);
});

describe("report_phishing_message", () => {
  it("sends the hashed link hosts and sender domain", async () => {
    await report_phishing_message(
      received({
        sender_email: "Alerts@Mail.Spoof.example",
        html_content:
          '<a href="https://Login.Bad.example/verify?token=secret">a</a><a href="http://bad.example/">b</a>',
      }),
    );

    expect(mocked_post).toHaveBeenCalledWith("/phishing/v1/report", {
      verdict: "phishing",
      domain_hashes: [
        await domain_hash_hex("login.bad.example"),
        await domain_hash_hex("bad.example"),
      ],
      sender_domain_hash: await domain_hash_hex("mail.spoof.example"),
    });
  });

  it("never sends a path, query or the sender's address", async () => {
    await report_phishing_message(
      received({
        sender_email: "alice@spoof.example",
        html_content:
          '<a href="https://bad.example/reset/alice?token=secret">x</a>',
      }),
    );

    const body = JSON.stringify(sent_hashes());

    expect(body).not.toContain("secret");
    expect(body).not.toContain("alice");
    expect(body).not.toContain("bad.example");
  });

  it("reads links written in upper case, unquoted or with entities", async () => {
    await report_phishing_message(
      received({
        html_content:
          '<a href="HTTPS://one.example/">a</a><a href=https://two.example/x>b</a><a href="https://&#116;hree.example/">c</a><a href="mailto:x@four.example">d</a>',
      }),
    );

    expect(sent_hashes().domain_hashes).toEqual([
      await domain_hash_hex("one.example"),
      await domain_hash_hex("two.example"),
      await domain_hash_hex("three.example"),
    ]);
  });

  it("finds the links of a plain text email", async () => {
    await report_phishing_message(
      received({ body: "Verify now: https://bad.example/login, thanks" }),
    );

    expect(sent_hashes().domain_hashes).toEqual([
      await domain_hash_hex("bad.example"),
    ]);
  });

  it("leaves out addresses, local names and intranet hosts", async () => {
    await report_phishing_message(
      received({
        html_content: [
          "http://192.168.1.1/",
          "http://[::1]/",
          "http://localhost/",
          "http://intranet/",
          "https://bad.example/",
        ]
          .map((url) => `<a href="${url}">x</a>`)
          .join(""),
      }),
    );

    expect(sent_hashes().domain_hashes).toEqual([
      await domain_hash_hex("bad.example"),
    ]);
  });

  it("hashes a domain one way however it is written", async () => {
    await report_phishing_message(
      received({
        sender_email: "x@Bücher.example.",
        html_content: '<a href="https://bücher.example./">x</a>',
      }),
    );

    const punycode = await domain_hash_hex("xn--bcher-kva.example");

    expect(sent_hashes()).toEqual({
      verdict: "phishing",
      domain_hashes: [punycode],
      sender_domain_hash: punycode,
    });
  });

  it("sends each host once and at most fifty", async () => {
    const html = Array.from(
      { length: 80 },
      (_, i) => `<a href="https://host${i % 60}.example/">x</a>`,
    ).join("");

    await report_phishing_message(received({ html_content: html }));

    expect(sent_hashes().domain_hashes).toHaveLength(50);
    expect(new Set(sent_hashes().domain_hashes).size).toBe(50);
  });

  it("reports only external mail that was received", async () => {
    const html = '<a href="https://bad.example/">x</a>';

    await report_phishing_message(
      received({ html_content: html, item_type: "sent" }),
    );
    await report_phishing_message(
      received({ html_content: html, is_external: false }),
    );

    expect(mocked_post).not.toHaveBeenCalled();
  });

  it("sends nothing when there is nothing to report", async () => {
    await report_phishing_message(received({ body: "no links here" }));
    await report_phishing_message(
      received({ sender_email: "no-at-sign", body: "http://localhost/" }),
    );

    expect(mocked_post).not.toHaveBeenCalled();
  });
});

describe("report_not_phishing_message", () => {
  it("sends the same hashes as a not phishing verdict", async () => {
    const msg = received({
      sender_email: "news@shop.example",
      html_content: '<a href="https://shop.example/sale">x</a>',
    });

    await report_not_phishing_message(msg);

    expect(mocked_post).toHaveBeenCalledWith("/phishing/v1/report", {
      verdict: "not_phishing",
      domain_hashes: [await domain_hash_hex("shop.example")],
      sender_domain_hash: await domain_hash_hex("shop.example"),
    });
  });

  it("keeps the same limits as a report", async () => {
    await report_not_phishing_message(
      received({
        html_content: '<a href="https://shop.example/">x</a>',
        is_external: false,
      }),
    );
    await report_not_phishing_message(
      received({ html_content: '<a href="http://10.0.0.1/">x</a>' }),
    );

    expect(mocked_post).not.toHaveBeenCalled();
  });
});

describe("inbox_email_reportable", () => {
  it("reads a list item as a reportable message", () => {
    const email = {
      item_type: "received",
      is_external: true,
      sender_email: "news@shop.example",
      body_html: '<a href="https://shop.example/">x</a>',
      preview: "Sale",
    } as unknown as InboxEmail;

    expect(inbox_email_reportable(email)).toEqual({
      item_type: "received",
      is_external: true,
      sender_email: "news@shop.example",
      html_content: '<a href="https://shop.example/">x</a>',
    });
  });

  it("treats a list item of unknown origin as internal", () => {
    const email = {
      item_type: "received",
      sender_email: "x@shop.example",
    } as unknown as InboxEmail;

    expect(inbox_email_reportable(email).is_external).toBe(false);
  });
});

describe("report_not_phishing_once_per_sender", () => {
  it("sends one verdict per sender", async () => {
    const email = (sender_email: string) =>
      ({
        item_type: "received",
        is_external: true,
        sender_email,
      }) as unknown as InboxEmail;

    report_not_phishing_once_per_sender([
      email("a@one.example"),
      email("b@one.example"),
      email("a@one.example"),
    ]);
    await vi.waitFor(() => expect(mocked_post).toHaveBeenCalledTimes(2));

    expect(
      mocked_post.mock.calls.every(
        ([, body]) => (body as { verdict: string }).verdict === "not_phishing",
      ),
    ).toBe(true);
  });
});
