//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import {
  build_reply_from_address,
  collect_recipient_emails,
} from "./build_reply_from_address";

describe("build_reply_from_address", () => {
  it("returns sender_email for own message (replying continues alias)", () => {
    expect(
      build_reply_from_address(
        { sender_email: "alias@my.example" },
        true,
      ),
    ).toBe("alias@my.example");
  });

  it("returns undefined for incoming message (let original_to matcher pick)", () => {
    expect(
      build_reply_from_address(
        { sender_email: "stranger@x.example" },
        false,
      ),
    ).toBeUndefined();
  });

  it("returns undefined when own message has no sender_email", () => {
    expect(build_reply_from_address({ sender_email: "" }, true)).toBeUndefined();
    expect(
      build_reply_from_address({ sender_email: "   " }, true),
    ).toBeUndefined();
  });
});

describe("collect_recipient_emails", () => {
  it("merges to and cc preserving order", () => {
    expect(
      collect_recipient_emails(
        ["a@x.example", "b@x.example"],
        ["c@x.example"],
      ),
    ).toEqual(["a@x.example", "b@x.example", "c@x.example"]);
  });

  it("deduplicates case-insensitively", () => {
    expect(
      collect_recipient_emails(
        ["Alias@My.Example", "other@x.example"],
        ["alias@my.example"],
      ),
    ).toEqual(["Alias@My.Example", "other@x.example"]);
  });

  it("ignores empty strings and trims", () => {
    expect(
      collect_recipient_emails(
        ["  a@x.example  ", "", "  "],
        undefined,
      ),
    ).toEqual(["a@x.example"]);
  });

  it("returns empty array when both lists are missing", () => {
    expect(collect_recipient_emails(undefined, undefined)).toEqual([]);
  });
});
