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

import { parse_vcard } from "./contact_sync";

const CARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Reyes;Sofia;Ines;Dr.;PhD",
  "FN:Sofia Reyes",
  "X-PHONETIC-FIRST-NAME:SO-fee-ah",
  "X-PHONETIC-MIDDLE-NAME:EE-ness",
  "X-PHONETIC-LAST-NAME:RAY-ess",
  "X-PRONOUNS:she/her",
  "EMAIL;TYPE=INTERNET,WORK:sofia@astermail.org",
  "CATEGORIES:Work,Conference 2026",
  "RELATED;TYPE=spouse:Robin Vance",
  "RELATED;TYPE=supervisor:Delia Fontaine",
  "RELATED:Unlabeled Person",
  "IMPP;X-SERVICE-TYPE=signal:signal:+14155550142",
  "IMPP:matrix:@sofia:matrix.org",
  "X-SOCIALPROFILE;TYPE=linkedin:in/sofiareyes",
  "X-SOCIALPROFILE;TYPE=mastodon:@sofia@mastodon.social",
  "ANNIVERSARY:2016-05-04",
  "X-ABDATE;TYPE=graduation:2009-06-15",
  "URL;TYPE=WORK:https://ironvale.example/sofia",
  "URL;TYPE=HOME:https://sofia.example",
  "URL;TYPE=BLOG:https://sofia.example/notes",
  "X-ASTER-RELATIONSHIP:family",
  "X-ASTER-FAVORITE:true",
  "X-ASTER-COLOR:#5e35b1",
  "X-ASTER-COMMENT:Prefers Signal.",
  "END:VCARD",
].join("\r\n");

describe("parse_vcard extended fields", () => {
  const [contact] = parse_vcard(CARD);

  it("reads the honorific prefix and suffix from the name", () => {
    expect(contact.title).toBe("Dr.");
    expect(contact.name_suffix).toBe("PhD");
    expect(contact.middle_name).toBe("Ines");
  });

  it("reads phonetic names and pronouns", () => {
    expect(contact.phonetic_first_name).toBe("SO-fee-ah");
    expect(contact.phonetic_middle_name).toBe("EE-ness");
    expect(contact.phonetic_last_name).toBe("RAY-ess");
    expect(contact.pronouns).toBe("she/her");
  });

  it("reads categories as groups", () => {
    expect(contact.groups).toEqual(["Work", "Conference 2026"]);
  });

  it("reads related people and maps synonyms", () => {
    expect(contact.related_people).toEqual([
      { value: "Robin Vance", type: "spouse" },
      { value: "Delia Fontaine", type: "manager" },
      { value: "Unlabeled Person", type: "other" },
    ]);
  });

  it("reads messengers from the service param and from the uri scheme", () => {
    expect(contact.instant_messengers).toEqual([
      { value: "+14155550142", type: "signal" },
      { value: "@sofia:matrix.org", type: "matrix" },
    ]);
  });

  it("reads social profiles and mirrors the known ones", () => {
    expect(contact.social_networks).toEqual([
      { value: "in/sofiareyes", type: "linkedin" },
      { value: "@sofia@mastodon.social", type: "mastodon" },
    ]);
    expect(contact.social_links?.linkedin).toBe("in/sofiareyes");
  });

  it("reads typed dates", () => {
    expect(contact.date_entries).toEqual([
      { value: "2016-05-04", type: "anniversary" },
      { value: "2009-06-15", type: "graduation" },
    ]);
  });

  it("reads typed websites and keeps the first as the primary site", () => {
    expect(contact.websites).toEqual([
      { value: "https://ironvale.example/sofia", type: "work" },
      { value: "https://sofia.example", type: "private" },
      { value: "https://sofia.example/notes", type: "blog" },
    ]);
    expect(contact.social_links?.website).toBe(
      "https://ironvale.example/sofia",
    );
  });

  it("reads the private aster extensions", () => {
    expect(contact.relationship).toBe("family");
    expect(contact.is_favorite).toBe(true);
    expect(contact.profile_color).toBe("#5e35b1");
    expect(contact.comment).toBe("Prefers Signal.");
  });

  it("ignores an invalid color", () => {
    const [other] = parse_vcard(
      CARD.replace("X-ASTER-COLOR:#5e35b1", "X-ASTER-COLOR:blurple"),
    );

    expect(other.profile_color).toBeUndefined();
  });
});
