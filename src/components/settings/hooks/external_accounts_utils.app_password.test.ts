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

import { normalize_app_password } from "./external_accounts_utils";

describe("normalize_app_password", () => {
  it("strips the cosmetic spaces Google shows in an app password", () => {
    expect(
      normalize_app_password("imap.gmail.com", "abcd efgh ijkl mnop"),
    ).toBe("abcdefghijklmnop");
    expect(
      normalize_app_password("smtp.gmail.com", "  abcd efgh ijkl mnop  "),
    ).toBe("abcdefghijklmnop");
    expect(
      normalize_app_password("IMAP.Gmail.com", "abcd efgh ijkl mnop"),
    ).toBe("abcdefghijklmnop");
  });

  it("accepts a host the user pasted with a scheme or trailing slash", () => {
    expect(
      normalize_app_password("https://imap.gmail.com/", "abcd efgh ijkl mnop"),
    ).toBe("abcdefghijklmnop");
  });

  it("leaves an app password that is already joined", () => {
    expect(normalize_app_password("imap.gmail.com", "abcdefghijklmnop")).toBe(
      "abcdefghijklmnop",
    );
  });

  it("leaves passwords for other hosts untouched", () => {
    expect(
      normalize_app_password("imap.example.com", "abcd efgh ijkl mnop"),
    ).toBe("abcd efgh ijkl mnop");
  });

  it("leaves a Google password that is not four groups of four", () => {
    expect(
      normalize_app_password("imap.gmail.com", "correct horse battery staple"),
    ).toBe("correct horse battery staple");
    expect(normalize_app_password("imap.gmail.com", "abcd efgh ijkl")).toBe(
      "abcd efgh ijkl",
    );
    expect(
      normalize_app_password("imap.gmail.com", "ab!d efgh ijkl mnop"),
    ).toBe("ab!d efgh ijkl mnop");
  });
});
