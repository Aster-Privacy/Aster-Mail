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
  MAX_SOCIAL_LABEL_LENGTH,
  MAX_SOCIAL_NETWORKS,
  MAX_SOCIAL_VALUE_LENGTH,
  extra_social_networks,
  merge_social_networks,
  normalize_social_networks,
  social_from_vcard_tokens,
  social_href,
  social_vcard_type_param,
} from "@/utils/contact_socials";

describe("social_href", () => {
  it("allows only http and https links", () => {
    const rejected = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "vbscript:x",
      "file:///etc/passwd",
      "//evil.example",
      "https://",
    ];

    for (const value of rejected) {
      expect(social_href({ value, type: "other" })).toBeNull();
    }
    expect(
      social_href({ value: " https://studio.example.net/a ", type: "other" }),
    ).toBe("https://studio.example.net/a");
    expect(social_href({ value: "http://x.example/", type: "other" })).toBe(
      "http://x.example/",
    );
  });

  it("treats a plain custom value as text", () => {
    expect(social_href({ value: "pat_the_coach", type: "other" })).toBeNull();
    expect(social_href({ value: "", type: "other" })).toBeNull();
    expect(social_href({ value: 5, type: "other" })).toBeNull();
  });

  it("requires a known network URL to match its host", () => {
    expect(social_href({ value: "https://github.com/ada", type: "github" })).toBe(
      "https://github.com/ada",
    );
    expect(
      social_href({ value: "https://gist.github.com/ada", type: "github" }),
    ).toBe("https://gist.github.com/ada");
    expect(
      social_href({
        value: "https://github.com.evil.example/ada",
        type: "github",
      }),
    ).toBeNull();
    expect(
      social_href({ value: "https://evil.example/ada", type: "twitter" }),
    ).toBeNull();
  });

  it("builds a profile URL from a handle", () => {
    expect(social_href({ value: "@ada", type: "twitter" })).toBe(
      "https://x.com/ada",
    );
    expect(social_href({ value: "ada.dev", type: "bluesky" })).toBe(
      "https://bsky.app/profile/ada.dev",
    );
    expect(social_href({ value: "@ada@hachyderm.io", type: "mastodon" })).toBe(
      "https://hachyderm.io/@ada",
    );
    expect(social_href({ value: "ada", type: "mastodon" })).toBeNull();
    expect(social_href({ value: "a/../b", type: "github" })).toBeNull();
    expect(social_href({ value: "a b", type: "github" })).toBeNull();
  });
});

describe("normalize_social_networks", () => {
  it("returns undefined for a missing field", () => {
    expect(normalize_social_networks(undefined)).toBeUndefined();
  });

  it("trims, skips empty rows and caps lengths", () => {
    const result = normalize_social_networks([
      { value: "  ", type: "other", label: "Empty" },
      { value: " pat ", type: "other", label: "  Coach  " },
      { value: "x".repeat(MAX_SOCIAL_VALUE_LENGTH + 9), type: "other" },
      {
        value: "y",
        type: "other",
        label: "L".repeat(MAX_SOCIAL_LABEL_LENGTH + 9),
      },
      { value: "z", type: "other", label: "   " },
      { value: "w" },
      null,
    ]);

    expect(result).toEqual([
      { value: "pat", type: "other", label: "Coach" },
      { value: "x".repeat(MAX_SOCIAL_VALUE_LENGTH), type: "other" },
      { value: "y", type: "other", label: "L".repeat(MAX_SOCIAL_LABEL_LENGTH) },
      { value: "z", type: "other" },
      { value: "w", type: "other" },
    ]);
  });

  it("dedupes and caps the count", () => {
    expect(
      normalize_social_networks([
        { value: "Pat", type: "other", label: "Coach" },
        { value: "pat", type: "other", label: "coach" },
        { value: "pat", type: "other", label: "Band" },
      ]),
    ).toHaveLength(2);
    const many = Array.from({ length: MAX_SOCIAL_NETWORKS + 3 }, (_, i) => ({
      value: `v${i}`,
      type: "other",
      label: "L",
    }));

    expect(normalize_social_networks(many)).toHaveLength(MAX_SOCIAL_NETWORKS);
  });

  it("keeps unchanged entries by identity", () => {
    const entry = { value: "ada", type: "github" as const };

    expect(normalize_social_networks([entry])?.[0]).toBe(entry);
  });
});

describe("extra and merged social networks", () => {
  it("lists only non-legacy entries", () => {
    expect(
      extra_social_networks([
        { value: "ada", type: "github" },
        { value: "ada", type: "mastodon" },
        { value: "pat", type: "other", label: "Coach" },
        { value: " ", type: "other" },
      ]),
    ).toEqual([
      { value: "ada", type: "mastodon" },
      { value: "pat", type: "other", label: "Coach" },
    ]);
  });

  it("merges both sides of a duplicate", () => {
    expect(
      merge_social_networks([
        [{ value: "pat", type: "other", label: "Coach" }],
        undefined,
        [
          { value: "Pat", type: "other", label: "coach" },
          { value: "ada", type: "github" },
        ],
      ]),
    ).toEqual([
      { value: "pat", type: "other", label: "Coach" },
      { value: "ada", type: "github" },
    ]);
    expect(merge_social_networks([undefined])).toBeUndefined();
  });
});

describe("vCard social tokens", () => {
  it("resolves known types, group labels and raw tokens", () => {
    expect(social_from_vcard_tokens(["twitter"], undefined)).toEqual({
      type: "twitter",
    });
    expect(social_from_vcard_tokens(["x-user", "X"], undefined)).toEqual({
      type: "twitter",
    });
    expect(social_from_vcard_tokens(["Band"], "_$!<Band page>!$_")).toEqual({
      type: "other",
      label: "Band page",
    });
    expect(social_from_vcard_tokens(["pref"], "Mastodon")).toEqual({
      type: "mastodon",
    });
    expect(social_from_vcard_tokens(["Strava"], undefined)).toEqual({
      type: "other",
      label: "Strava",
    });
    expect(social_from_vcard_tokens(["pref", "x-foo"], undefined)).toEqual({
      type: "other",
    });
  });

  it("sanitizes the TYPE parameter", () => {
    expect(social_vcard_type_param("Band page; x=1:2")).toBe("Band-page-x-1-2");
    expect(social_vcard_type_param("\u{1F3B8}")).toBe("");
  });
});
