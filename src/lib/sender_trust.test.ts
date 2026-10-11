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
import { describe, expect, it } from "vitest";

import {
  domain_for_display,
  domain_to_ascii,
  evaluate_sender_trust,
  registrable_domain,
  sanitize_display_name,
  skeleton,
  type SenderTrustInput,
} from "@/lib/sender_trust";
import trust_data from "@/lib/sender_trust_data.json";
import vector_file from "@/lib/sender_trust_vectors.json";

interface TrustVector {
  id: string;
  input: SenderTrustInput;
  expect: Record<string, unknown>;
}

const vectors = vector_file.vectors as unknown as TrustVector[];

describe("sender trust vectors", () => {
  it("has unique ids", () => {
    const ids = vectors.map((vector) => vector.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const vector of vectors) {
    it(vector.id, () => {
      const result = evaluate_sender_trust(vector.input) as unknown as Record<
        string,
        unknown
      >;

      for (const [key, expected] of Object.entries(vector.expect)) {
        expect(result[key], key).toEqual(expected);
      }
    });
  }
});

describe("sender trust data", () => {
  it("maps every confusable from one code point to ascii", () => {
    for (const [from, to] of Object.entries(trust_data.confusables)) {
      expect(Array.from(from).length, from).toBe(1);
      expect(to, from).toMatch(/^[a-z]$/);
    }
  });

  it("never warns for a brand name on that brand's own domains", () => {
    for (const brand of trust_data.brands) {
      for (const name of brand.names) {
        for (const domain of brand.domains) {
          const result = evaluate_sender_trust({
            name,
            email: `noreply@${domain}`,
            sender_aligned: true,
          });

          expect(result.warning, `${name} ${domain}`).toBeNull();
          expect(result.name, `${name} ${domain}`).toBe(name);
        }
      }
    }
  });

  it("never treats a protected domain as a lookalike of another", () => {
    const domains = [
      ...trust_data.home_brand.domains,
      ...trust_data.brands.flatMap((brand) => brand.domains),
      ...trust_data.lookalike_only_domains,
      ...trust_data.relay_domains,
    ];

    for (const domain of domains) {
      const result = evaluate_sender_trust({
        email: `noreply@${domain}`,
        sender_aligned: true,
      });

      expect(result.warning, domain).toBeNull();
    }
  });

  it("warns for every unambiguous brand name on an unrelated domain", () => {
    for (const brand of trust_data.brands) {
      if (brand.ambiguous) continue;
      for (const name of brand.names) {
        const result = evaluate_sender_trust({
          name,
          email: "noreply@unrelated.example",
          sender_aligned: true,
        });

        expect(result.warning?.kind, name).toBe("brand_name");
        expect(result.name, name).toBe("");
      }
    }
  });
});

describe("sender trust false positives", () => {
  const ordinary_names = [
    "Jordan Lee",
    "Dr. María-José O'Neil",
    "李雷",
    "Иван Петров",
    "Αλέξανδρος",
    "محمد",
    "Ian Illingworth",
    "Bill Ill",
    "Lily Lilliput",
    "Apple",
    "Chase",
    "Meta",
    "Adobe",
    "Stripe",
    "Discord",
    "Aster",
    "Amazonia Travel",
    "Googleplex Tours",
    "Microsoftware Ltd",
    "Paypalace",
    "Team Rocket",
    "Customer Support",
    "noreply",
    "Billing",
    "Security Alerts",
    "The Outlook Inn Hotel",
    "Netflixing Podcast",
    "DHLS Logistics",
    "Yahoos Anonymous",
    "Spotifyers",
    "Bank of Ireland",
    "First America Title",
    "100% Pure",
    "L1 Capital",
    "O0O",
    "",
  ];

  for (const name of ordinary_names) {
    it(`does not warn for "${name}"`, () => {
      const result = evaluate_sender_trust({
        name,
        email: "sender@ordinary-business.example",
        spf_result: "pass",
        dkim_result: "pass",
        dmarc_result: "pass",
        sender_aligned: true,
      });

      expect(result.warning).toBeNull();
      expect(result.show_identity_marks).toBe(true);
    });
  }

  const ordinary_domains = [
    "example.com",
    "modern.io",
    "burn.example",
    "live.example",
    "mail.example.co.uk",
    "googl.example",
    "pay.example",
    "apple-tree-farm.example",
    "my-paypal-receipts.example",
    "microsoft-partner.example",
    "t-online.de",
    "gmx.net",
    "web.de",
    "orange.fr",
    "bbc.co.uk",
    "u-tokyo.ac.jp",
  ];

  for (const domain of ordinary_domains) {
    it(`does not warn for ${domain}`, () => {
      const result = evaluate_sender_trust({
        name: "Jordan Lee",
        email: `jordan@${domain}`,
        sender_aligned: true,
      });

      expect(result.warning).toBeNull();
      expect(result.domain).toBe(domain);
    });
  }
});

describe("sender trust helpers", () => {
  it("builds the same skeleton for confusable spellings", () => {
    expect(skeleton("PayPaI")).toBe(skeleton("PayPal"));
    expect(skeleton("paypa1")).toBe(skeleton("paypal"));
    expect(skeleton("rnicrosoft")).toBe(skeleton("microsoft"));
    expect(skeleton("vvise")).toBe(skeleton("wise"));
    expect(skeleton("gооgle")).toBe(skeleton("google"));
    expect(skeleton("Páypal")).toBe(skeleton("Paypal"));
    expect(skeleton("pay​pal")).toBe(skeleton("paypal"));
    expect(skeleton("paypal")).not.toBe(skeleton("paypol"));
  });

  it("round trips punycode", () => {
    expect(domain_to_ascii("München.Example")).toBe("xn--mnchen-3ya.example");
    expect(domain_to_ascii("例え.example")).toBe("xn--r8jz45g.example");
    expect(domain_to_ascii("аpple.com")).toBe("xn--pple-43d.com");
    expect(domain_for_display("xn--mnchen-3ya.example")).toBe(
      "münchen.example",
    );
    expect(domain_for_display("xn--pple-43d.com")).toBe("xn--pple-43d.com");
    expect(domain_for_display("xn--r8jz45g.example")).toBe("例え.example");
  });

  it("rejects malformed domains", () => {
    for (const domain of [
      "",
      "localhost",
      "exa mple.com",
      "-bad.example",
      "bad-.example",
      "a..example",
      "under_score.example",
      "192.168.1.1",
      "exam‮ple.com/",
      `${"a".repeat(64)}.example`,
    ]) {
      expect(domain_to_ascii(domain), domain).toBe("");
    }
  });

  it("keeps undecodable punycode labels as ascii", () => {
    expect(domain_for_display("xn--999999999.example")).toBe(
      "xn--999999999.example",
    );
    expect(domain_for_display("xn--abc.example")).toBe("xn--abc.example");
  });

  it("finds the registrable domain", () => {
    expect(registrable_domain("example.com")).toBe("example.com");
    expect(registrable_domain("a.b.example.com")).toBe("example.com");
    expect(registrable_domain("a.example.co.uk")).toBe("example.co.uk");
    expect(registrable_domain("mail.u-tokyo.ac.jp")).toBe("u-tokyo.ac.jp");
    expect(registrable_domain("a.b.example.io")).toBe("example.io");
    expect(registrable_domain("a.onmicrosoft.com")).toBe("a.onmicrosoft.com");
    expect(registrable_domain("x.a.github.io")).toBe("a.github.io");
    expect(registrable_domain("github.io")).toBe("github.io");
    expect(registrable_domain("mail.acme.uk.com")).toBe("acme.uk.com");
  });

  it("sanitizes names without throwing on any input", () => {
    expect(sanitize_display_name(undefined)).toBe("");
    expect(sanitize_display_name(null)).toBe("");
    expect(sanitize_display_name("\ud83d")).toBe("");
    expect(sanitize_display_name("a\ud83db")).toBe("ab");
    expect(sanitize_display_name("'\"Jordan\"'")).toBe("Jordan");
    expect(sanitize_display_name("O'Neil")).toBe("O'Neil");
  });

  it("is deterministic and total over hostile input", () => {
    const hostile = [
      "\u0000",
      "@",
      "@@",
      "a@",
      "@b",
      "<>",
      "a@b@c.example",
      "‮@‮.‮",
      "x@xn--.example",
      "x@xn--a.example",
      `${"a".repeat(5000)}@${"b".repeat(5000)}.example`,
      "🙂@🙂.example",
    ];

    for (const email of hostile) {
      for (const name of hostile) {
        const first = evaluate_sender_trust({ name, email, reply_to: email });
        const second = evaluate_sender_trust({ name, email, reply_to: email });

        expect(first).toEqual(second);
        expect(first.address.length).toBeLessThanOrEqual(640);
      }
    }
  });
});
