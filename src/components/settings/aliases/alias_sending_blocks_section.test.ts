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
import {
  are_all_sending_options_disabled,
  filter_sending_block_options,
} from "@/components/settings/aliases/alias_sending_blocks_section";

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
  it("lists the primary address, aliases, ghost aliases and domain addresses", () => {
    expect(filter_sending_block_options(options, "").map((o) => o.id)).toEqual([
      "primary",
      "a1",
      "domain-d1",
      "ghost-g1",
    ]);
  });

  it("leaves out external accounts and catch-all addresses", () => {
    const with_external: SenderOption[] = [
      ...options,
      {
        id: "external-e1",
        email: "me@elsewhere.example",
        type: "external",
        is_enabled: true,
      },
    ];

    expect(
      filter_sending_block_options(with_external, "").map((o) => o.id),
    ).not.toContain("external-e1");
    expect(
      filter_sending_block_options(with_external, "any@").map((o) => o.id),
    ).toEqual([]);
  });

  it("finds the primary address by search", () => {
    expect(
      filter_sending_block_options(options, "me@aster").map((o) => o.id),
    ).toEqual(["primary"]);
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

describe("are_all_sending_options_disabled", () => {
  it("is true only when every listed address is turned off", () => {
    const listed = filter_sending_block_options(options, "");
    const all_off = annotate_sending_blocks(listed, () => true);
    const one_on = annotate_sending_blocks(listed, (id) => id !== "a1");

    expect(are_all_sending_options_disabled(all_off)).toBe(true);
    expect(are_all_sending_options_disabled(one_on)).toBe(false);
    expect(are_all_sending_options_disabled([])).toBe(false);
  });
});
