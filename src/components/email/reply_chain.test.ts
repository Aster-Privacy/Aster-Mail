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

import { build_reply_chain } from "./reply_chain";

describe("build_reply_chain", () => {
  it("returns nothing when the parent has no message id", () => {
    expect(build_reply_chain(undefined)).toBeUndefined();
    expect(
      build_reply_chain([{ name: "Subject", value: "Hello" }]),
    ).toBeUndefined();
  });

  it("carries the parent references and its own message id", () => {
    const chain = build_reply_chain([
      { name: "References", value: "<a@x> <b@x>" },
      { name: "Message-ID", value: "<c@x>" },
    ]);

    expect(chain).toBe("<a@x> <b@x> <c@x>");
  });

  it("matches header names case insensitively and drops duplicates", () => {
    const chain = build_reply_chain([
      { name: "message-id", value: " <c@x> " },
      { name: "references", value: "<a@x> <c@x>" },
    ]);

    expect(chain).toBe("<a@x> <c@x>");
  });

  it("keeps only the newest ids when a thread runs long", () => {
    const references = Array.from({ length: 30 }, (_, i) => `<r${i}@x>`);
    const chain = build_reply_chain([
      { name: "References", value: references.join(" ") },
      { name: "Message-ID", value: "<last@x>" },
    ]);

    expect(chain?.split(" ")).toHaveLength(20);
    expect(chain?.endsWith("<last@x>")).toBe(true);
  });
});
