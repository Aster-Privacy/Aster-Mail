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
import type { CustomDomain } from "@/services/api/domains";
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  set_catch_all_context,
  typed_catch_all_domains,
  typed_catch_all_options,
} from "./catch_all_sender";

const unlocked = vi.hoisted(() => ({ value: true }));

vi.mock("@/hooks/use_plan_limits", () => ({
  is_cached_feature_unlocked: () => unlocked.value,
}));

vi.mock("@/services/api/domains", () => ({
  compute_address_routing_hash: vi.fn(async () => "hash"),
}));

const make_domain = (id: string, name: string, extra = {}): CustomDomain =>
  ({
    id,
    domain_name: name,
    status: "active",
    catch_all_enabled: true,
    ...extra,
  }) as CustomDomain;

const existing: SenderOption[] = [
  {
    id: "primary",
    email: "me@astermail.org",
    type: "primary",
    is_enabled: true,
  },
  {
    id: "addr1",
    email: "hello@shop.example",
    type: "domain",
    is_enabled: true,
  },
];

describe("typed catch-all sender", () => {
  beforeEach(() => {
    unlocked.value = true;
    set_catch_all_context(
      [
        make_domain("d1", "shop.example"),
        make_domain("d2", "home.example"),
        make_domain("d3", "off.example", { catch_all_enabled: false }),
        make_domain("d4", "shared.example", { is_shared: true }),
        make_domain("d5", "wait.example", { status: "pending" }),
      ],
      ["me@astermail.org", "hello@shop.example"],
    );
  });

  it("lists only usable catch-all domains", () => {
    expect(typed_catch_all_domains()).toEqual(["shop.example", "home.example"]);
  });

  it("offers every catch-all domain for a bare local part", () => {
    const result = typed_catch_all_options("  Orders ", existing);

    expect(result.options.map((o) => o.email)).toEqual([
      "orders@shop.example",
      "orders@home.example",
    ]);
    expect(result.options[0]).toMatchObject({
      id: "catch-all-d1-orders@shop.example",
      type: "domain",
      is_catch_all: true,
    });
    expect(result.invalid_domain).toBeNull();
  });

  it("narrows by a partial domain", () => {
    expect(
      typed_catch_all_options("orders@ho", existing).options.map(
        (o) => o.email,
      ),
    ).toEqual(["orders@home.example"]);
  });

  it("skips addresses that already exist", () => {
    expect(typed_catch_all_options("hello@shop.example", existing)).toEqual({
      options: [],
      invalid_domain: null,
    });
    expect(typed_catch_all_options("h.ello@shop.example", existing)).toEqual({
      options: [],
      invalid_domain: null,
    });
  });

  it("reports an invalid address on a full catch-all domain", () => {
    expect(typed_catch_all_options("a..b@shop.example", existing)).toEqual({
      options: [],
      invalid_domain: "shop.example",
    });
    expect(typed_catch_all_options("@shop.example", existing)).toEqual({
      options: [],
      invalid_domain: "shop.example",
    });
  });

  it("ignores domains without catch-all and unrelated searches", () => {
    expect(typed_catch_all_options("x@off.example", existing).options).toEqual(
      [],
    );
    expect(typed_catch_all_options("x@shared.example", existing)).toEqual({
      options: [],
      invalid_domain: null,
    });
    expect(typed_catch_all_options("", existing).options).toEqual([]);
  });

  it("offers nothing when the plan lacks catch-all", () => {
    unlocked.value = false;
    expect(typed_catch_all_domains()).toEqual([]);
    expect(typed_catch_all_options("orders", existing).options).toEqual([]);
  });
});
