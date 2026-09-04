import type { ContactFormData } from "@/types/contacts";

import { describe, it, expect } from "vitest";

import {
  CONTACT_REVISION_LIMIT,
  contact_fields_changed,
  contact_revision_snapshot,
  strip_contact_revisions,
  with_contact_revision,
} from "./contact_history";

const base = (): ContactFormData => ({
  first_name: "Ada",
  last_name: "Lovelace",
  emails: ["ada@example.com"],
});

describe("contact history", () => {
  it("reports no change when only revisions differ", () => {
    const previous = { ...base(), revisions: [] };
    const next = base();

    expect(contact_fields_changed(previous, next)).toBe(false);
  });

  it("keeps the contact unchanged when nothing was edited", () => {
    const previous = base();
    const next = base();

    expect(with_contact_revision(next, previous).revisions).toBeUndefined();
  });

  it("records the previous state as the newest revision", () => {
    const previous = base();
    const next = { ...base(), company: "Analytical Engines" };
    const result = with_contact_revision(next, previous);

    expect(result.revisions).toHaveLength(1);
    expect(result.revisions?.[0].data.company).toBeUndefined();
    expect(result.company).toBe("Analytical Engines");
  });

  it("never nests revisions inside a revision", () => {
    const previous = { ...base(), revisions: [] };
    const next = { ...base(), phone: "555" };

    expect(
      with_contact_revision(next, previous).revisions?.[0].data.revisions,
    ).toBeUndefined();
  });

  it("caps the stored revisions", () => {
    let contact: ContactFormData = base();

    for (let i = 0; i < CONTACT_REVISION_LIMIT + 3; i += 1) {
      contact = with_contact_revision(
        { ...contact, company: `c${i}` },
        contact,
      );
    }

    expect(contact.revisions).toHaveLength(CONTACT_REVISION_LIMIT);
    expect(contact.revisions?.[0].data.company).toBe(
      `c${CONTACT_REVISION_LIMIT + 1}`,
    );
  });

  it("ignores a photo-only edit", () => {
    const previous = { ...base(), avatar_url: "data:image/png;base64,AAAA" };
    const next = { ...base(), avatar_url: "data:image/png;base64,BBBB" };

    expect(contact_fields_changed(previous, next)).toBe(false);
    expect(with_contact_revision(next, previous).revisions).toBeUndefined();
  });

  it("keeps the photo out of a stored revision", () => {
    const previous = { ...base(), avatar_url: "data:image/png;base64,AAAA" };
    const next = { ...previous, company: "Analytical Engines" };
    const result = with_contact_revision(next, previous);

    expect(result.revisions?.[0].data.avatar_url).toBeUndefined();
    expect(result.avatar_url).toBe("data:image/png;base64,AAAA");
  });

  it("drops the photo and the revisions from a snapshot", () => {
    const snapshot = contact_revision_snapshot({
      ...base(),
      avatar_url: "data:image/png;base64,AAAA",
      revisions: [],
    });

    expect(snapshot.avatar_url).toBeUndefined();
    expect(snapshot.revisions).toBeUndefined();
    expect(snapshot.first_name).toBe("Ada");
  });

  it("strips revisions without touching the other fields", () => {
    const stripped = strip_contact_revisions({ ...base(), revisions: [] });

    expect(stripped.revisions).toBeUndefined();
    expect(stripped.first_name).toBe("Ada");
  });
});
