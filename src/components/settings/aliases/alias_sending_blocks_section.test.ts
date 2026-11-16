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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { describe, expect, it } from "vitest";

import { annotate_sending_blocks } from "@/hooks/use_sender_aliases";
import { filter_sending_block_options } from "@/components/settings/aliases/alias_sending_blocks_section";

const options: SenderOption[] = [
  {
    id: "primary",
    email: "me@astermail.org",
    type: "primary",
    is_enabled: true,
  },
  {
    id: "a1",
    email: "shopping@astermail.org",
    display_name: "Shopping",
    type: "alias",
    is_enabled: true,
  },
  {
    id: "domain-d1",
    email: "hi@my.example",
    type: "domain",
    is_enabled: true,
  },
  {
    id: "catch-all-d1-any@my.example",
    email: "any@my.example",
    type: "domain",
    is_enabled: true,
    is_catch_all: true,
  },
  { id: "ghost-g1", email: "g@aster.cx", type: "ghost", is_enabled: true },
];

describe("annotate_sending_blocks", () => {
  it("marks only the blocked options", () => {
    const annotated = annotate_sending_blocks(options, (id) => id === "a1");

    expect(annotated.find((o) => o.id === "a1")?.sending_disabled).toBe(true);
    expect(
      annotated.find((o) => o.id === "primary")?.sending_disabled,
    ).toBeUndefined();
  });
});

describe("filter_sending_block_options", () => {
  it("lists aliases and domain addresses only", () => {
    expect(filter_sending_block_options(options, "").map((o) => o.id)).toEqual([
      "a1",
      "domain-d1",
    ]);
  });

  it("searches by address and display name", () => {
    expect(
      filter_sending_block_options(options, "SHOP").map((o) => o.id),
    ).toEqual(["a1"]);
    expect(
      filter_sending_block_options(options, "my.example").map((o) => o.id),
    ).toEqual(["domain-d1"]);
    expect(filter_sending_block_options(options, "nothing")).toEqual([]);
  });
});
