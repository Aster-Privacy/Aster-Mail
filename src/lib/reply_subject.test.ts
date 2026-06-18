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

import { build_reply_subject, strip_reply_prefix } from "./reply_subject";

describe("build_reply_subject", () => {
  it("prefixes a plain subject", () => {
    expect(build_reply_subject("Hello", "Re:")).toBe("Re: Hello");
  });

  it("does not double-prefix an existing reply", () => {
    expect(build_reply_subject("Re: Hello", "Re:")).toBe("Re: Hello");
  });

  it("collapses repeated prefixes", () => {
    expect(build_reply_subject("Re: Re: Hello", "Re:")).toBe("Re: Hello");
  });

  it("is case insensitive when detecting an existing prefix", () => {
    expect(build_reply_subject("re: hello", "Re:")).toBe("Re: hello");
  });

  it("returns empty for an empty subject instead of a bare prefix", () => {
    expect(build_reply_subject("", "Re:")).toBe("");
  });

  it("returns empty for a whitespace-only subject", () => {
    expect(build_reply_subject("   ", "Re:")).toBe("");
  });

  it("returns empty when the subject is only a reply prefix", () => {
    expect(build_reply_subject("Re:", "Re:")).toBe("");
    expect(build_reply_subject("Re: Re:", "Re:")).toBe("");
  });

  it("handles null and undefined", () => {
    expect(build_reply_subject(null, "Re:")).toBe("");
    expect(build_reply_subject(undefined, "Re:")).toBe("");
  });

  it("strips a localized prefix and re-applies it", () => {
    expect(build_reply_subject("Sv: Hei", "Sv:")).toBe("Sv: Hei");
  });

  it("strips a stray Re: even with a localized prefix configured", () => {
    expect(build_reply_subject("Re: Hei", "Sv:")).toBe("Sv: Hei");
  });
});

describe("strip_reply_prefix", () => {
  it("removes the prefix and trims", () => {
    expect(strip_reply_prefix("Re:  Hello ", "Re:")).toBe("Hello");
  });

  it("returns empty for a bare prefix", () => {
    expect(strip_reply_prefix("Re:", "Re:")).toBe("");
  });
});
