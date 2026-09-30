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
import { describe, it, expect, beforeEach } from "vitest";

import {
  reply_includes_quoted_by_default,
  reply_subject_prefixes,
  resolve_reply_prefix,
  set_reply_include_quoted,
  set_reply_prefix_subject,
} from "./reply_defaults";

describe("reply_defaults", () => {
  beforeEach(() => {
    set_reply_include_quoted(true);
    set_reply_prefix_subject(true);
  });

  it("includes quoted text and prefixes the subject by default", () => {
    expect(reply_includes_quoted_by_default()).toBe(true);
    expect(reply_subject_prefixes()).toBe(true);
    expect(resolve_reply_prefix("Re:")).toBe("Re:");
  });

  it("drops the prefix when the preference is off", () => {
    set_reply_prefix_subject(false);
    expect(reply_subject_prefixes()).toBe(false);
    expect(resolve_reply_prefix("Re:")).toBe("");
  });

  it("drops quoted text when the preference is off", () => {
    set_reply_include_quoted(false);
    expect(reply_includes_quoted_by_default()).toBe(false);
  });

  it("treats a missing preference value as on", () => {
    set_reply_include_quoted(undefined);
    set_reply_prefix_subject(undefined);
    expect(reply_includes_quoted_by_default()).toBe(true);
    expect(reply_subject_prefixes()).toBe(true);
  });
});
