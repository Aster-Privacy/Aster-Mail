import { describe, expect, it } from "vitest";

import {
  identity_addresses_for,
  normalize_address_ignoring_dots,
  same_address_ignoring_dots,
  same_sender_identity,
  strip_plus_tag,
} from "./address_dots";

import { sanitize_username_input } from "@/services/sanitize";

const USERNAME_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

describe("normalize_address_ignoring_dots", () => {
  it("drops dots from the local part only", () => {
    expect(normalize_address_ignoring_dots("John.Smith@Aster.Mail.org")).toBe(
      "johnsmith@aster.mail.org",
    );
  });

  it("handles a bare local part", () => {
    expect(normalize_address_ignoring_dots("john.smith")).toBe("johnsmith");
  });

  it("uses the last at sign", () => {
    expect(normalize_address_ignoring_dots("a.b@c.d@example.com")).toBe(
      "a.b@c.d@example.com".toLowerCase().replace("a.b@c.d", "ab@cd"),
    );
  });
});

describe("same_address_ignoring_dots", () => {
  it("treats dotted and dotless local parts as one address", () => {
    expect(
      same_address_ignoring_dots(
        "john.smith@astermail.org",
        "johnsmith@astermail.org",
      ),
    ).toBe(true);
  });

  it("still separates different domains", () => {
    expect(
      same_address_ignoring_dots(
        "john.smith@astermail.org",
        "johnsmith@aster.cx",
      ),
    ).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(same_address_ignoring_dots("", "johnsmith@astermail.org")).toBe(
      false,
    );
  });
});

describe("registration username input", () => {
  it("keeps dots the user types", () => {
    expect(sanitize_username_input("John.Smith")).toBe("john.smith");
  });

  it("still drops characters that are not allowed", () => {
    expect(sanitize_username_input("john+smith!")).toBe("johnsmith");
  });

  it("accepts Gmail-style dotted names", () => {
    expect(USERNAME_PATTERN.test("john.smith")).toBe(true);
    expect(USERNAME_PATTERN.test("a.b.c")).toBe(true);
  });

  it("rejects leading, trailing and doubled dots", () => {
    expect(USERNAME_PATTERN.test(".john")).toBe(false);
    expect(USERNAME_PATTERN.test("john.")).toBe(false);
    expect(USERNAME_PATTERN.test("jo..hn")).toBe(false);
  });

  it("collapses to the same canonical username", () => {
    expect("john.smith".replace(/\./g, "")).toBe("johnsmith");
  });
});

describe("identity_addresses_for", () => {
  it("adds the dot-free form of a dotted Aster address", () => {
    expect(identity_addresses_for("murati.balazs@astermail.org")).toEqual([
      "murati.balazs@astermail.org",
      "muratibalazs@astermail.org",
    ]);
    expect(identity_addresses_for("a.b.c@Aster.CX")).toEqual([
      "a.b.c@Aster.CX",
      "abc@Aster.CX",
    ]);
  });

  it("keeps a single address when dots do not matter or are absent", () => {
    expect(identity_addresses_for("muratibalazs@astermail.org")).toEqual([
      "muratibalazs@astermail.org",
    ]);
    expect(identity_addresses_for("first.last@example.com")).toEqual([
      "first.last@example.com",
    ]);
    expect(identity_addresses_for("no-at-sign")).toEqual(["no-at-sign"]);
    expect(identity_addresses_for("...@astermail.org")).toEqual([
      "...@astermail.org",
    ]);
    expect(identity_addresses_for("  ")).toEqual([]);
  });
});

describe("strip_plus_tag", () => {
  it("removes a plus tag from the local part", () => {
    expect(strip_plus_tag("shop+news@astermail.org")).toBe(
      "shop@astermail.org",
    );
    expect(strip_plus_tag(" shop+a+b@astermail.org ")).toBe(
      "shop@astermail.org",
    );
  });

  it("leaves addresses without a usable tag alone", () => {
    expect(strip_plus_tag("shop@astermail.org")).toBe("shop@astermail.org");
    expect(strip_plus_tag("+tag@astermail.org")).toBe("+tag@astermail.org");
    expect(strip_plus_tag("no-at-sign")).toBe("no-at-sign");
  });
});

describe("same_sender_identity", () => {
  it("matches across case, dots, and plus tags", () => {
    expect(
      same_sender_identity("Shop@AsterMail.org", "shop@astermail.org"),
    ).toBe(true);
    expect(
      same_sender_identity("shop+orders@astermail.org", "shop@astermail.org"),
    ).toBe(true);
    expect(
      same_sender_identity(
        "first.last@astermail.org",
        "firstlast@astermail.org",
      ),
    ).toBe(true);
  });

  it("does not match different mailboxes or empty input", () => {
    expect(same_sender_identity("shop@astermail.org", "me@astermail.org")).toBe(
      false,
    );
    expect(same_sender_identity("shop@astermail.org", "shop@aster.cx")).toBe(
      false,
    );
    expect(same_sender_identity("", "me@astermail.org")).toBe(false);
    expect(same_sender_identity(undefined, null)).toBe(false);
  });
});
