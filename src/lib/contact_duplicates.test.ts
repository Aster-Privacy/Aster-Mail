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
import type { DecryptedContact } from "@/types/contacts";

import { describe, expect, it } from "vitest";

import {
  count_duplicate_contacts,
  email_identity,
  find_duplicate_clusters,
  merge_contacts,
  normalize_phone,
  similarity_score,
} from "@/lib/contact_duplicates";

const make = (
  id: string,
  overrides: Partial<DecryptedContact> = {},
): DecryptedContact =>
  ({
    id,
    first_name: "",
    last_name: "",
    emails: [],
    groups: [],
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }) as DecryptedContact;

describe("email_identity", () => {
  it("strips plus tags and lowercases", () => {
    expect(email_identity("Ada.Lovelace+news@Example.COM")).toBe(
      "ada.lovelace@example.com",
    );
  });

  it("leaves values without an at sign alone", () => {
    expect(email_identity("  NotAnEmail ")).toBe("notanemail");
  });
});

describe("normalize_phone", () => {
  it("keeps the last ten digits", () => {
    expect(normalize_phone("+1 (555) 010-2345")).toBe("5550102345");
  });

  it("rejects short values", () => {
    expect(normalize_phone("12345")).toBe("");
  });
});

describe("similarity_score", () => {
  it("scores a shared address as a certain match", () => {
    const left = make("a", { emails: ["ada@example.com"] });
    const right = make("b", { emails: ["ADA@example.com"] });

    expect(similarity_score(left, right)).toBe(100);
  });

  it("scores a plus tag variant below an exact match", () => {
    const left = make("a", {
      first_name: "Ada",
      emails: ["ada@example.com"],
    });
    const right = make("b", {
      first_name: "Ada",
      emails: ["ada+news@example.com"],
    });

    expect(similarity_score(left, right)).toBe(95);
  });

  it("does not match unrelated contacts", () => {
    const left = make("a", { first_name: "Ada", emails: ["ada@example.com"] });
    const right = make("b", { first_name: "Grace", emails: ["g@example.com"] });

    expect(similarity_score(left, right)).toBe(0);
  });

  it("matches on a shared phone number", () => {
    const left = make("a", { first_name: "Ada", phone: "555-010-2345" });
    const right = make("b", { first_name: "Ada", phone: "+1 555 010 2345" });

    expect(similarity_score(left, right)).toBe(90);
  });
});

describe("find_duplicate_clusters", () => {
  it("groups transitive matches into one cluster", () => {
    const contacts = [
      make("a", { first_name: "Ada", emails: ["ada@example.com"] }),
      make("b", { first_name: "Ada", emails: ["ada+work@example.com"] }),
      make("c", { first_name: "Ada", emails: ["ada@example.com"] }),
      make("z", { first_name: "Grace", emails: ["grace@example.com"] }),
    ];

    const clusters = find_duplicate_clusters(contacts);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].contacts.map((contact) => contact.id).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(count_duplicate_contacts(clusters)).toBe(3);
  });

  it("returns nothing when every contact is distinct", () => {
    const contacts = [
      make("a", { first_name: "Ada", emails: ["ada@example.com"] }),
      make("b", { first_name: "Grace", emails: ["grace@example.com"] }),
    ];

    expect(find_duplicate_clusters(contacts)).toEqual([]);
  });
});

describe("merge_contacts", () => {
  it("keeps the first ranked values and unions the lists", () => {
    const merged = merge_contacts([
      make("a", {
        first_name: "Ada",
        emails: ["ada@example.com"],
        groups: ["Work"],
      }),
      make("b", {
        first_name: "Adalovelace",
        last_name: "Lovelace",
        emails: ["ada+news@example.com", "ada@example.com"],
        phone: "555-010-2345",
        groups: ["Friends", "work"],
        is_favorite: true,
      }),
    ]);

    expect(merged.first_name).toBe("Ada");
    expect(merged.last_name).toBe("Lovelace");
    expect(merged.emails).toEqual(["ada@example.com", "ada+news@example.com"]);
    expect(merged.phone).toBe("555-010-2345");
    expect(merged.groups).toEqual(["Work", "Friends"]);
    expect(merged.is_favorite).toBe(true);
  });
});
