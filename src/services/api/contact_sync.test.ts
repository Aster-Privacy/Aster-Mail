import { describe, it, expect } from "vitest";

import { parse_csv, parse_vcard } from "./contact_sync";

describe("parse_csv (Gmail CSV import)", () => {
  it("imports one contact per record even when an address spans multiple lines", () => {
    const csv =
      "First Name,Last Name,Address 1 - Formatted,E-mail 1 - Value\n" +
      'John,Smith,"123 Main St\nApt 4\nSpringfield",john@example.com\n' +
      'Jane,Doe,"742 Evergreen Terrace\nSpringfield",jane@example.com\n';

    const mapping = {
      "First Name": "first_name" as const,
      "Last Name": "last_name" as const,
      "Address 1 - Formatted": null,
      "E-mail 1 - Value": "emails" as const,
    };

    const contacts = parse_csv(csv, mapping);

    expect(contacts).toHaveLength(2);
    expect(contacts[0].first_name).toBe("John");
    expect(contacts[0].last_name).toBe("Smith");
    expect(contacts[0].emails).toEqual(["john@example.com"]);
    expect(contacts[1].first_name).toBe("Jane");
    expect(contacts[1].last_name).toBe("Doe");

    for (const contact of contacts) {
      expect(contact.first_name).not.toContain("\n");
      expect(contact.last_name).not.toContain("\n");
    }
  });
});

describe("parse_vcard (Gmail vCard import)", () => {
  it("parses name and email from a standard vCard", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nFN:John Smith\nN:Smith;John;;;\nEMAIL;TYPE=INTERNET:john@example.com\nEND:VCARD\n";

    const contacts = parse_vcard(vcard);

    expect(contacts).toHaveLength(1);
    expect(contacts[0].first_name).toBe("John");
    expect(contacts[0].last_name).toBe("Smith");
    expect(contacts[0].emails).toEqual(["john@example.com"]);
  });

  it("unfolds folded continuation lines instead of dropping them", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nNOTE:This is a long note tha\n t was folded onto two lines\nEND:VCARD\n";

    const contacts = parse_vcard(vcard);

    expect(contacts).toHaveLength(1);
    expect(contacts[0].notes).toBe(
      "This is a long note that was folded onto two lines",
    );
    expect(contacts[0].first_name).toBe("Jane");
    expect(contacts[0].last_name).toBe("Doe");
  });

  it("captures grouped properties (item1.EMAIL) emitted by Apple/Google", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nFN:Grace Hopper\nN:Hopper;Grace;;;\nitem1.EMAIL;type=INTERNET:grace@example.com\nitem2.EMAIL;type=INTERNET:grace.work@example.com\nEND:VCARD\n";

    const contacts = parse_vcard(vcard);

    expect(contacts).toHaveLength(1);
    expect(contacts[0].emails).toEqual([
      "grace@example.com",
      "grace.work@example.com",
    ]);
  });

  it("keeps the structured N name even when FN appears after it", () => {
    const vcard =
      "BEGIN:VCARD\nVERSION:3.0\nN:Van Helsing;Abraham;;;\nFN:Abraham Van Helsing\nEMAIL:a@example.com\nEND:VCARD\n";

    const contacts = parse_vcard(vcard);

    expect(contacts).toHaveLength(1);
    expect(contacts[0].first_name).toBe("Abraham");
    expect(contacts[0].last_name).toBe("Van Helsing");
  });
});
