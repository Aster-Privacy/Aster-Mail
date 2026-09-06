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

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  auto_map_csv_header,
  parse_csv,
  parse_vcard,
  type CsvFieldTarget,
} from "@/services/api/contact_sync";
import {
  can_share_contact_file,
  contact_to_share_text,
  contact_to_vcard,
  contact_vcard_file,
  CONTACT_CSV_HEADERS,
  contacts_to_csv,
  contacts_to_vcard,
  share_contact_vcard,
} from "@/utils/contact_export";

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

describe("contacts_to_csv", () => {
  it("writes a header row and one row per contact", () => {
    const csv = contacts_to_csv([
      make({ first_name: "Ada", last_name: "Lovelace" }),
    ]);
    const rows = csv.split("\r\n");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(CONTACT_CSV_HEADERS.map((h) => `"${h}"`).join(","));
    expect(rows[1]).toContain('"Ada","Lovelace"');
  });

  it("neutralizes spreadsheet formulas and escapes quotes", () => {
    const csv = contacts_to_csv([
      make({
        first_name: "=HYPERLINK(1)",
        last_name: 'He said "hi"',
      }),
    ]);

    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain('"He said ""hi"""');
  });

  it("joins every email and maps the favorite flag", () => {
    const csv = contacts_to_csv([
      make({
        emails: ["a@example.com", "b@example.com"],
        is_favorite: true,
      }),
    ]);

    expect(csv).toContain('"a@example.com; b@example.com"');
    expect(csv).toContain('"true"');
  });

  it("writes the address, website, and phone columns", () => {
    const csv = contacts_to_csv([
      make({
        phone_entries: [
          { value: "+1 555 0100", type: "mobile" },
          { value: "+1 555 0200", type: "work" },
        ],
        address_entries: [
          {
            street: "12 Bridge Street",
            city: "London",
            state: "Greater London",
            postal_code: "SW1A",
            country: "United Kingdom",
            type: "home",
          },
        ],
        websites: [{ value: "https://example.com", type: "work" }],
      } as Partial<DecryptedContact>),
    ]);

    expect(csv).toContain(`"'+1 555 0100; +1 555 0200"`);
    expect(csv).toContain('"12 Bridge Street","London","Greater London"');
    expect(csv).toContain('"https://example.com"');
  });
});

describe("byte order mark handling", () => {
  it("imports a csv file that starts with a byte order mark", () => {
    const csv = `\ufeff${contacts_to_csv([
      make({
        first_name: "Ada",
        last_name: "Lovelace",
      } as Partial<DecryptedContact>),
    ])}`;
    const mapping: Record<string, CsvFieldTarget | null> = {};

    for (const header of CONTACT_CSV_HEADERS) {
      mapping[header] = auto_map_csv_header(header);
    }

    const [contact] = parse_csv(csv, mapping);

    expect(contact.first_name).toBe("Ada");
    expect(contact.last_name).toBe("Lovelace");
  });

  it("imports a vcard file that starts with a byte order mark", () => {
    const vcard = `\ufeff${contact_to_vcard(
      make({
        first_name: "Ada",
        last_name: "Lovelace",
      } as Partial<DecryptedContact>),
    )}`;
    const parsed = parse_vcard(vcard);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].first_name).toBe("Ada");
  });
});

describe("csv round trip", () => {
  it("re-imports an exported file through the auto mapping", () => {
    const csv = contacts_to_csv([
      make({
        first_name: "Ada",
        last_name: "Lovelace",
        emails: ["ada@example.com", "ada@work.example.com"],
        phone_entries: [
          { value: "+1 555 0100", type: "mobile" },
          { value: "+1 555 0200", type: "work" },
        ],
        company: "Analytical Engines",
        job_title: "Engineer",
        address_entries: [
          {
            street: "12 Bridge Street",
            city: "London",
            state: "Greater London",
            postal_code: "SW1A",
            country: "United Kingdom",
            type: "home",
          },
        ],
        websites: [{ value: "https://example.com", type: "work" }],
        birthday: "1815-12-10",
        notes: "a, b",
        is_favorite: true,
      } as Partial<DecryptedContact>),
    ]);

    const mapping: Record<string, CsvFieldTarget | null> = {};

    for (const header of CONTACT_CSV_HEADERS) {
      mapping[header] = auto_map_csv_header(header);
    }

    const [contact] = parse_csv(csv, mapping);

    expect(contact.first_name).toBe("Ada");
    expect(contact.last_name).toBe("Lovelace");
    expect(contact.emails).toEqual(["ada@example.com", "ada@work.example.com"]);
    expect(contact.phone).toBe("+1 555 0100");
    expect(contact.phone_entries?.[1].value).toBe("+1 555 0200");
    expect(contact.company).toBe("Analytical Engines");
    expect(contact.job_title).toBe("Engineer");
    expect(contact.address).toEqual({
      street: "12 Bridge Street",
      city: "London",
      state: "Greater London",
      postal_code: "SW1A",
      country: "United Kingdom",
    });
    expect(contact.social_links?.website).toBe("https://example.com");
    expect(contact.birthday).toBe("1815-12-10");
    expect(contact.notes).toBe("a, b");
    expect(contact.is_favorite).toBe(true);
  });
});

describe("contact_to_vcard round trip", () => {
  const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  const rich = make({
    middle_name: "Byron",
    nickname: "Ada L",
    avatar_url: photo,
    role: "Analyst",
    pronouns: "she/her",
    phonetic_first_name: "AY-duh",
    comment: "Founding programmer",
    email_entries: [
      { value: "ada@example.com", type: "home" },
      { value: "ada@work.example", type: "work" },
    ],
    emails: ["ada@example.com", "ada@work.example"],
    phone_entries: [{ value: "+15550000", type: "mobile" }],
    address_entries: [
      {
        street: "1 Analytical Way",
        city: "London",
        postal_code: "E1",
        country: "UK",
        type: "work",
      },
    ],
    websites: [{ value: "https://example.com/ada", type: "blog" }],
    social_networks: [{ value: "adalovelace", type: "linkedin" }],
    instant_messengers: [{ value: "@ada:matrix.org", type: "matrix" }],
    related_people: [{ value: "Charles Babbage", type: "friend" }],
    date_entries: [{ value: "1835-07-08", type: "anniversary" }],
  });

  it("keeps the profile picture", () => {
    const card = contact_to_vcard(rich);

    expect(card).toContain("PHOTO;ENCODING=b;TYPE=PNG:");

    const [parsed] = parse_vcard(card);

    expect(parsed.avatar_url).toBe(photo);
  });

  it("keeps typed entries and extended fields", () => {
    const [parsed] = parse_vcard(contact_to_vcard(rich));

    expect(parsed.email_entries).toEqual([
      { value: "ada@example.com", type: "home" },
      { value: "ada@work.example", type: "work" },
    ]);
    expect(parsed.phone_entries).toEqual([
      { value: "+15550000", type: "mobile" },
    ]);
    expect(parsed.address_entries?.[0]).toMatchObject({
      street: "1 Analytical Way",
      city: "London",
      type: "work",
    });
    expect(parsed.websites).toEqual([
      { value: "https://example.com/ada", type: "blog" },
    ]);
    expect(parsed.social_networks).toEqual([
      { value: "adalovelace", type: "linkedin" },
    ]);
    expect(parsed.instant_messengers).toEqual([
      { value: "@ada:matrix.org", type: "matrix" },
    ]);
    expect(parsed.related_people).toEqual([
      { value: "Charles Babbage", type: "friend" },
    ]);
    expect(parsed.date_entries).toEqual([
      { value: "1835-07-08", type: "anniversary" },
    ]);
    expect(parsed.middle_name).toBe("Byron");
    expect(parsed.nickname).toBe("Ada L");
    expect(parsed.role).toBe("Analyst");
    expect(parsed.pronouns).toBe("she/her");
    expect(parsed.phonetic_first_name).toBe("AY-duh");
    expect(parsed.comment).toBe("Founding programmer");
  });
});

describe("contact_to_vcard", () => {
  it("writes a version 3 card with the name and address", () => {
    const card = contact_to_vcard(make());

    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0")).toBe(true);
    expect(card).toContain("N:Lovelace;Ada;;;");
    expect(card).toContain("FN:Ada Lovelace");
    expect(card).toContain("EMAIL;TYPE=INTERNET:ada@example.com");
    expect(card.endsWith("END:VCARD")).toBe(true);
  });

  it("escapes separators in free text", () => {
    const card = contact_to_vcard(
      make({ notes: "Met at a talk; loved it, a lot" }),
    );

    expect(card).toContain("NOTE:Met at a talk\\; loved it\\, a lot");
  });

  it("writes groups as categories", () => {
    const card = contact_to_vcard(make({ groups: ["Work", "Team"] }));

    expect(card).toContain("CATEGORIES:Work,Team");
  });

  it("folds long lines at seventy five characters", () => {
    const card = contact_to_vcard(make({ notes: "x".repeat(200) }));
    const note_line = card
      .split("\r\n")
      .find((line) => line.startsWith("NOTE:")) as string;

    expect(note_line.length).toBe(75);
  });
});

describe("contacts_to_vcard", () => {
  it("joins every card and ends with a newline", () => {
    const output = contacts_to_vcard([make(), make({ id: "b" })]);

    expect(output.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(output.endsWith("\r\n")).toBe(true);
  });
});

describe("share_contact_vcard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shares the card when the browser can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const can_share = vi.fn().mockReturnValue(true);

    vi.stubGlobal("navigator", { canShare: can_share, share });

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await share_contact_vcard(make());

    expect(share).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();

    const payload = share.mock.calls[0][0] as { files: File[]; title: string };

    expect(payload.title).toBe("Ada Lovelace");
    expect(payload.files[0].name).toBe("Ada_Lovelace.vcf");
  });

  it("downloads the card when sharing is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:card"),
      revokeObjectURL: vi.fn(),
    });

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await share_contact_vcard(make());

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads the card when sharing fails for a reason other than cancel", async () => {
    const share = vi.fn().mockRejectedValue(new Error("no target"));

    vi.stubGlobal("navigator", { canShare: () => true, share });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:card"),
      revokeObjectURL: vi.fn(),
    });

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await share_contact_vcard(make());

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("does nothing more when the person cancels the share sheet", async () => {
    const abort = new DOMException("cancelled", "AbortError");
    const share = vi.fn().mockRejectedValue(abort);

    vi.stubGlobal("navigator", { canShare: () => true, share });

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    await share_contact_vcard(make());

    expect(click).not.toHaveBeenCalled();
  });
});

describe("contact_to_share_text", () => {
  it("lists the name, role, and every way to reach the person", () => {
    const text = contact_to_share_text(
      make({
        company: "Analytical Engines",
        job_title: "Mathematician",
        phone_entries: [{ value: "+1 555 0100", type: "mobile" }],
        websites: [{ value: "https://example.com", type: "work" }],
      }),
    );

    expect(text.split("\n")).toEqual([
      "Ada Lovelace",
      "Mathematician, Analytical Engines",
      "ada@example.com",
      "+1 555 0100",
      "https://example.com",
    ]);
  });

  it("falls back to the legacy phone field when there are no entries", () => {
    const text = contact_to_share_text(make({ phone: "+1 555 0111" }));

    expect(text).toContain("+1 555 0111");
  });
});

describe("contact_vcard_file", () => {
  it("names the file after the contact and carries the card", async () => {
    const file = contact_vcard_file(make());

    expect(file?.name).toBe("Ada_Lovelace.vcf");
    expect(file?.type).toBe("text/vcard");
    expect(await file?.text()).toContain("FN:Ada Lovelace");
  });

  it("reports that sharing is unavailable without a share target", () => {
    vi.stubGlobal("navigator", {});

    expect(can_share_contact_file(make())).toBe(false);
  });

  it("reports that sharing is available when the browser accepts the file", () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: () => Promise.resolve(),
    });

    expect(can_share_contact_file(make())).toBe(true);
  });
});
