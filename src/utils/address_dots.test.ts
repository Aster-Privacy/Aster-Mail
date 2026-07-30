import { describe, expect, it } from "vitest";

import {
  normalize_address_ignoring_dots,
  same_address_ignoring_dots,
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
