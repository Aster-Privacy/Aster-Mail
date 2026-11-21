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
import type { DecryptedContact, RelatedPersonEntry } from "@/types/contacts";

import { describe, expect, it } from "vitest";

import {
  auto_map_csv_headers,
  parse_csv,
  parse_vcard,
} from "@/services/api/contact_sync";
import { contact_to_vcard, contacts_to_csv } from "@/utils/contact_export";
import {
  RELATION_KINDS,
  decode_related_people,
  encode_relation,
} from "@/utils/contact_relations";

const make = (overrides: Partial<DecryptedContact> = {}): DecryptedContact =>
  ({
    id: "a",
    first_name: "Ada",
    last_name: "Lovelace",
    emails: ["ada@example.com"],
    groups: [],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as DecryptedContact;

const all_kinds: RelatedPersonEntry[] = RELATION_KINDS.map((kind, index) =>
  encode_relation(kind, kind === "custom" ? "Godparent" : "", `Person ${index}`),
);

function card(lines: string[]): string {
  return ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada", ...lines, "END:VCARD"].join(
    "\r\n",
  );
}

describe("relation vCard round trip", () => {
  it("keeps every kind and the custom label", () => {
    const vcard = contact_to_vcard(make({ related_people: all_kinds }), {});

    expect(vcard).toContain("RELATED;TYPE=parent;VALUE=text:Person 7");
    expect(vcard).toContain("X-ABLabel:_$!<Mother>!$_");
    expect(vcard).toContain("X-ABLabel:Godparent");
    const [parsed] = parse_vcard(vcard);

    expect(decode_related_people(parsed.related_people)).toEqual(
      decode_related_people(all_kinds),
    );
  });

  it("escapes separators, keeps emoji and RTL text", () => {
    const value = "Ana; Lima, مريم \u{1F338}";
    const vcard = contact_to_vcard(
      make({
        related_people: [{ value, type: "other", label: "Tutor, music" }],
      }),
      {},
    );
    const [parsed] = parse_vcard(vcard);

    expect(parsed.related_people).toEqual([
      { value, type: "other", label: "Tutor, music" },
    ]);
  });

  it("writes nothing for a contact without relations", () => {
    expect(contact_to_vcard(make(), {})).not.toContain("RELATED");
  });
});

describe("relation vCard import variants", () => {
  it("reads vCard 4.0 RELATED types", () => {
    const [parsed] = parse_vcard(
      card([
        "RELATED;TYPE=kin;VALUE=text:Mei",
        "RELATED;TYPE=spouse:Sam",
        "RELATED;TYPE=co-worker;VALUE=text:Kim",
        "RELATED;VALUE=uri:urn:uuid:4fbe8971-0bc3-424c-9c26-36c3e1eff6b1",
      ]),
    );

    expect(decode_related_people(parsed.related_people)).toEqual([
      { kind: "relative", label: "", value: "Mei" },
      { kind: "spouse", label: "", value: "Sam" },
      { kind: "custom", label: "co-worker", value: "Kim" },
    ]);
  });

  it("reads Apple X-ABRELATEDNAMES with labels", () => {
    const [parsed] = parse_vcard(
      card([
        "item1.X-ABRELATEDNAMES:Ana Lima",
        "item1.X-ABLabel:_$!<Mother>!$_",
        "item2.X-ABRELATEDNAMES:Rui",
        "item2.X-ABLabel:Godparent",
        "item3.X-ABRELATEDNAMES;type=pref:Leo",
        "item3.X-ABLabel:_$!<Brother>!$_",
      ]),
    );

    expect(decode_related_people(parsed.related_people)).toEqual([
      { kind: "mother", label: "", value: "Ana Lima" },
      { kind: "custom", label: "Godparent", value: "Rui" },
      { kind: "brother", label: "", value: "Leo" },
    ]);
  });

  it("reads Android X-ANDROID-CUSTOM relations", () => {
    const [parsed] = parse_vcard(
      card([
        "X-ANDROID-CUSTOM:vnd.android.cursor.item/relation;Ana Lima;8;;;;;;;;;;;;;",
        "X-ANDROID-CUSTOM:vnd.android.cursor.item/relation;Rui;0;Godparent;;;;;;;;;;;;",
        "X-ANDROID-CUSTOM:vnd.android.cursor.item/nickname;Ace;1;;;;;;;;;;;;;",
      ]),
    );

    expect(decode_related_people(parsed.related_people)).toEqual([
      { kind: "mother", label: "", value: "Ana Lima" },
      { kind: "custom", label: "Godparent", value: "Rui" },
    ]);
  });

  it("dedupes the same person listed twice", () => {
    const [parsed] = parse_vcard(
      card(["RELATED;TYPE=friend:Sam", "RELATED;TYPE=friend:sam"]),
    );

    expect(parsed.related_people).toEqual([{ value: "Sam", type: "friend" }]);
  });
});

describe("relation CSV round trip", () => {
  it("keeps kinds and custom labels through export and import", () => {
    const csv = contacts_to_csv([
      make({
        related_people: [
          encode_relation("mother", "", "Ana Lima"),
          encode_relation("custom", "Godparent", "Rui"),
          encode_relation("relative", "", "Mei"),
        ],
      }),
      make({ id: "b", first_name: "Bo", related_people: undefined }),
    ]);
    const header_line = csv.split(/\r?\n/)[0];
    const headers = header_line
      .split(",")
      .map((cell) => cell.replace(/^"|"$/g, ""));

    expect(headers).toContain("Relation 3 - Value");
    const [first, second] = parse_csv(csv, auto_map_csv_headers(headers));

    expect(decode_related_people(first.related_people)).toEqual([
      { kind: "mother", label: "", value: "Ana Lima" },
      { kind: "custom", label: "Godparent", value: "Rui" },
      { kind: "relative", label: "", value: "Mei" },
    ]);
    expect(second.related_people).toBeUndefined();
  });

  it("reads a common contacts export layout", () => {
    const csv = [
      "First Name,Last Name,Relation 1 - Label,Relation 1 - Value,Relation 2 - Label,Relation 2 - Value",
      "Ada,Lovelace,* Sister,Ida,Godparent,Rui",
    ].join("\n");
    const headers = csv.split("\n")[0].split(",");
    const [parsed] = parse_csv(csv, auto_map_csv_headers(headers));

    expect(decode_related_people(parsed.related_people)).toEqual([
      { kind: "sister", label: "", value: "Ida" },
      { kind: "custom", label: "Godparent", value: "Rui" },
    ]);
  });
});

describe("custom social vCard round trip", () => {
  it("keeps labels and known networks", () => {
    const vcard = contact_to_vcard(
      make({
        social_networks: [
          { value: "https://studio.example.net/a", type: "other", label: "Band page" },
          { value: "pat_the_coach", type: "other", label: "Strava" },
          { value: "@ada@hachyderm.io", type: "mastodon" },
          { value: "ada", type: "github" },
        ],
      }),
      {},
    );

    expect(vcard).toMatch(/item\d+\.X-SOCIALPROFILE;TYPE=Band-page:/);
    expect(vcard).toMatch(/item\d+\.X-ABLabel:Band page/);
    const [parsed] = parse_vcard(vcard);

    expect(parsed.social_networks).toEqual([
      { value: "https://studio.example.net/a", type: "other", label: "Band page" },
      { value: "pat_the_coach", type: "other", label: "Strava" },
      { value: "@ada@hachyderm.io", type: "mastodon" },
      { value: "ada", type: "github" },
    ]);
  });

  it("reads Apple x-apple values with x-user and a group label", () => {
    const [parsed] = parse_vcard(
      card([
        "item1.X-SOCIALPROFILE;type=Strava;x-user=pat:x-apple:pat",
        "item1.X-ABLabel:Strava",
        "X-SOCIALPROFILE;type=twitter:https://x.com/ada",
        "X-SOCIALPROFILE;TYPE=Band:https://band.example/",
      ]),
    );

    expect(parsed.social_networks).toEqual([
      { value: "pat", type: "other", label: "Strava" },
      { value: "https://x.com/ada", type: "twitter" },
      { value: "https://band.example/", type: "other", label: "Band" },
    ]);
  });

  it("loads an old contact without labels unchanged", () => {
    const [parsed] = parse_vcard(
      card(["X-SOCIALPROFILE;TYPE=linkedin:https://linkedin.com/in/ada"]),
    );

    expect(parsed.social_networks).toEqual([
      { value: "https://linkedin.com/in/ada", type: "linkedin" },
    ]);
    expect(parsed.social_links?.linkedin).toBe("https://linkedin.com/in/ada");
  });
});
