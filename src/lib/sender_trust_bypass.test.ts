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
} from "@/lib/sender_trust";
import { UTS39_CONFUSABLES } from "@/lib/sender_trust_confusables";
import trust_data from "@/lib/sender_trust_data.json";

const authenticated = {
  spf_result: "pass",
  dkim_result: "pass",
  dmarc_result: "pass",
  sender_aligned: true,
};

const invisible_points = [
  0xfff0, 0xfff1, 0xfff2, 0xfff3, 0xfff4, 0xfff5, 0xfff6, 0xfff7, 0xfff8,
  0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180e,
  0x180f, 0x200b, 0x200c, 0x200d, 0x2060, 0x2064, 0x2065, 0x206f, 0x3164,
  0xfe00, 0xfe0f, 0xfeff, 0xffa0, 0x1bca0, 0x1d173, 0xe0001, 0xe0020, 0xe0100,
  0xe0fff,
];

function hex_of(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function letters_by_target(pattern: RegExp): Map<string, string[]> {
  const by_letter = new Map<string, string[]>();

  for (const [from, to] of Object.entries(UTS39_CONFUSABLES)) {
    if (to.length !== 1 || !pattern.test(to)) continue;
    if (from.normalize("NFKC").toLowerCase() !== from.toLowerCase()) continue;
    const bucket = by_letter.get(to) ?? [];

    bucket.push(from);
    by_letter.set(to, bucket);
  }

  return by_letter;
}

describe("sender trust invisible characters", () => {
  for (const code of invisible_points) {
    const mark = String.fromCodePoint(code);

    it(`sees through ${hex_of(code)} in a brand name`, () => {
      for (const name of [
        `Pay${mark}Pal Security`,
        `${mark}P${mark}a${mark}y${mark}P${mark}a${mark}l${mark} Security`,
      ]) {
        const result = evaluate_sender_trust({
          name,
          email: "billing@evil.example",
          ...authenticated,
        });

        expect(result.warning?.kind, name).toBe("brand_name");
        expect(result.name).toBe("");
        expect(result.show_identity_marks).toBe(false);
      }
    });

    it(`sees through ${hex_of(code)} in the home brand name`, () => {
      for (const name of [
        `Aster${mark} Mail Security`,
        `As${mark}ter Ma${mark}il Security`,
      ]) {
        const result = evaluate_sender_trust({
          name,
          email: "billing@evil.example",
          ...authenticated,
        });

        expect(result.warning?.kind, name).toBe("home_brand_name");
        expect(result.show_identity_marks).toBe(false);
      }
    });

    it(`sees through ${hex_of(code)} in an address in the name`, () => {
      for (const name of [
        `ceo@victim${mark}corp.com`,
        `ceo${mark}@victimcorp.com`,
        `ceo@${mark}victimcorp${mark}.com`,
      ]) {
        const result = evaluate_sender_trust({
          name,
          email: "billing@evil.example",
          ...authenticated,
        });

        expect(result.warning, name).toEqual({
          kind: "address_in_name",
          claimed: "ceo@victimcorp.com",
        });
        expect(result.show_identity_marks).toBe(false);
      }
    });

    it(`drops ${hex_of(code)} from the shown name`, () => {
      expect(sanitize_display_name(`Jor${mark}dan Lee`)).toBe("Jordan Lee");
    });
  }

  it("keeps emoji joiner sequences in the shown name", () => {
    const family = "\u{1f468}‍\u{1f469}‍\u{1f467} Family";

    expect(sanitize_display_name(family)).toBe(family);
    expect(sanitize_display_name("Love ❤️")).toBe("Love ❤️");
    expect(sanitize_display_name("Team 1️⃣")).toBe("Team 1️⃣");
    expect(sanitize_display_name("می‌رزا")).toBe("می‌رزا");
  });
});

describe("sender trust confusables", () => {
  it("covers the reported lookalike letters", () => {
    expect(skeleton("ᏢayᏢal")).toBe(skeleton("PayPal"));
    expect(skeleton("ⲢayⲢal")).toBe(skeleton("PayPal"));
    expect(skeleton("ꓑayꓑal")).toBe(skeleton("PayPal"));
    expect(skeleton("ƿaypal")).toBe(skeleton("paypal"));
    expect(skeleton("astermaiȴ")).toBe(skeleton("astermail"));
    expect(skeleton("Ꭺster")).toBe(skeleton("Aster"));
    expect(skeleton("Ꮐoogle")).toBe(skeleton("Google"));
    expect(skeleton("Ꮇicrosoft")).toBe(skeleton("Microsoft"));
    expect(skeleton("ϲhase")).toBe(skeleton("chase"));
  });

  it("maps Cherokee small letters like their capitals", () => {
    for (let code = 0xab70; code <= 0xabbf; code += 1) {
      const small = String.fromCodePoint(code);
      const capital = small.toUpperCase();

      if (UTS39_CONFUSABLES[small] !== undefined) continue;
      if (UTS39_CONFUSABLES[capital] === undefined) continue;

      expect(skeleton(small), hex_of(code)).toBe(UTS39_CONFUSABLES[capital]);
    }
  });

  it("maps every generated confusable to ascii", () => {
    for (const [from, to] of Object.entries(UTS39_CONFUSABLES)) {
      expect(Array.from(from).length, from).toBe(1);
      expect(from.codePointAt(0)!, from).toBeGreaterThan(0x7f);
      expect(to, from).toMatch(/^[a-z0-9]+$/);
    }
  });

  for (const name of [
    "ᏢayᏢal",
    "ⲢayⲢal",
    "ꓑayꓑal",
    "ᏢayᏢal Security",
    "Ꮐoogle",
    "Ꮇicrosoft",
    "Ꮐoogle Security",
    "Ꮇicrosoft Support",
    "ꮲayꮲal",
    "ꮲayꮲal Security",
  ]) {
    it(`warns for ${name}`, () => {
      const result = evaluate_sender_trust({
        name,
        email: "x@evil.example",
        ...authenticated,
      });

      expect(result.warning, name).not.toBeNull();
      expect(result.name).toBe("");
      expect(result.show_identity_marks).toBe(false);
    });
  }

  for (const name of ["Ꭺster Mail", "Ꭺster Mail Security", "ꭺster Mail"]) {
    it(`warns for ${name}`, () => {
      const result = evaluate_sender_trust({
        name,
        email: "x@evil.example",
        ...authenticated,
      });

      expect(result.warning?.kind, name).toBe("home_brand_name");
      expect(result.show_identity_marks).toBe(false);
    });
  }

  it("warns when one letter of a brand name is swapped for a lookalike", () => {
    const by_letter = letters_by_target(/^[a-z]$/);
    const misses: string[] = [];

    for (const brand of trust_data.brands) {
      if (brand.ambiguous) continue;
      for (const name of brand.names) {
        const points = Array.from(name);

        for (let index = 0; index < points.length; index += 1) {
          for (const lookalike of by_letter.get(points[index].toLowerCase()) ??
            []) {
            const forged = [...points];

            forged[index] = lookalike;

            const text = forged.join("");
            const result = evaluate_sender_trust({
              name: text,
              email: "x@evil.example",
              ...authenticated,
            });

            if (result.warning === null) misses.push(`${name} -> ${text}`);
          }
        }
      }
    }

    expect(misses).toEqual([]);
  });
});

describe("sender trust lookalike domains", () => {
  it("keeps the reported lookalike domains in ascii form", () => {
    expect(domain_for_display("xn--aypal-ytb.com")).toBe("xn--aypal-ytb.com");
    expect(domain_for_display("xn--astermai-mhd.org")).toBe(
      "xn--astermai-mhd.org",
    );
  });

  for (const [email, claimed] of [
    ["support@xn--aypal-ytb.com", "paypal.com"],
    ["support@xn--astermai-mhd.org", "astermail.org"],
  ]) {
    it(`warns for ${email}`, () => {
      const result = evaluate_sender_trust({
        name: "Support",
        email,
        ...authenticated,
      });

      expect(result.address).toBe(email);
      expect(result.domain).toBe(email.split("@")[1]);
      expect(result.warning).toEqual({ kind: "lookalike_domain", claimed });
      expect(result.show_identity_marks).toBe(false);
    });
  }

  it("never shows a decoded lookalike of a protected domain", () => {
    const by_letter = letters_by_target(/^[a-z0-9]$/);
    const leaks: string[] = [];
    const domains = [
      ...trust_data.home_brand.domains,
      ...trust_data.brands.flatMap((brand) => brand.domains),
    ];

    for (const domain of domains) {
      const [label, ...rest] = domain.split(".");
      const points = Array.from(label);

      for (let index = 0; index < points.length; index += 1) {
        for (const lookalike of by_letter.get(points[index]) ?? []) {
          const forged = [...points];

          forged[index] = lookalike;

          const ascii = domain_to_ascii([forged.join(""), ...rest].join("."));

          if (!ascii || ascii === domain) continue;

          const shown = domain_for_display(ascii);
          const result = evaluate_sender_trust({
            name: "Support",
            email: `support@${ascii}`,
            ...authenticated,
          });

          const owned = registrable_domain(domain) === domain;

          if (shown !== ascii || (owned && result.warning === null)) {
            leaks.push(`${domain} -> ${shown} ${result.warning?.kind}`);
          }
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it("still shows ordinary internationalized domains decoded", () => {
    for (const domain of [
      "münchen.example",
      "straße.example",
      "bücher.example",
      "øresund.example",
      "例え.example",
      "пример.example",
      "παράδειγμα.example",
      "日本語.jp",
      "مثال.example",
      "דוגמה.example",
    ]) {
      const ascii = domain_to_ascii(domain);

      expect(ascii, domain).toMatch(/xn--/);
      expect(domain_for_display(ascii), domain).toBe(domain);
    }
  });

  it("keeps labels in lookalike-only scripts in ascii form", () => {
    for (const domain of [
      "ᏢᎪᎩ.example",
      "ⲣⲁⲛ.example",
      "ꓑꓮ.example",
      "pɑypal.example",
      "ınfo.example",
    ]) {
      const ascii = domain_to_ascii(domain);

      expect(ascii, domain).toMatch(/xn--/);
      expect(domain_for_display(ascii), domain).toBe(ascii);
    }
  });
});

describe("sender trust international names", () => {
  for (const name of [
    "José García",
    "Müller",
    "Søren Kierkegaard",
    "Łukasz Nowak",
    "Nguyễn Văn An",
    "Đặng Thu Thảo",
    "Björk Guðmundsdóttir",
    "山田太郎",
    "김민준",
    "محمد علي",
    "יעל כהן",
    "Сергей Иванов",
    "Ελένη Παπαδοπούλου",
    "Հայկ Պետրոսյան",
    "ქეთევან",
    "สมชาย ใจดี",
    "राहुल शर्मा",
    "Jordan \u{1f642}",
    "\u{1f468}‍\u{1f469}‍\u{1f467} Family",
  ]) {
    it(`keeps ${name} as is without a warning`, () => {
      const result = evaluate_sender_trust({
        name,
        email: "person@ordinary-business.example",
        ...authenticated,
      });

      expect(result.warning).toBeNull();
      expect(result.name).toBe(name);
      expect(result.show_identity_marks).toBe(true);
    });
  }
});

describe("sender trust relay senders", () => {
  it("warns when a relay alias puts a protected address in its name", () => {
    for (const name of [
      "security@astermail.org",
      "support@aster.cx",
      "service@paypal.com",
      "no-reply@accounts.google.com",
      "security@paypa1.com",
    ]) {
      const result = evaluate_sender_trust({
        name,
        email: "x7k2@aleeas.com",
        ...authenticated,
      });

      expect(result.warning, name).not.toBeNull();
      expect(result.name, name).toBe("");
      expect(result.show_identity_marks, name).toBe(false);
    }
  });

  it("reports the reported relay case as an address in the name", () => {
    const result = evaluate_sender_trust({
      name: "security@astermail.org",
      email: "x7k2@aleeas.com",
      ...authenticated,
    });

    expect(result.warning).toEqual({
      kind: "address_in_name",
      claimed: "security@astermail.org",
    });
  });

  it("warns when a relay alias claims your own or a contact's address", () => {
    const own_addresses = ["me@victimcorp.com"];
    const contacts = [
      { name: "Robin Park", emails: ["robin@partner.example"] },
    ];

    for (const name of ["robin@partner.example", "me@victimcorp.com"]) {
      const result = evaluate_sender_trust({
        name,
        email: "abc123@mozmail.com",
        own_addresses,
        contacts,
        ...authenticated,
      });

      expect(result.warning, name).toEqual({
        kind: "address_in_name",
        claimed: name,
      });
    }
  });

  it("still accepts ordinary forwarded senders from relays", () => {
    for (const [name, email] of [
      ["friend@example.org", "abc123@mozmail.com"],
      ["friend@example.org [via Relay]", "abc123@mozmail.com"],
      ["Jordan Lee", "x7k2@aleeas.com"],
    ]) {
      const result = evaluate_sender_trust({ name, email, ...authenticated });

      expect(result.warning, name).toBeNull();
      expect(result.name, name).toBe(name);
    }
  });
});
