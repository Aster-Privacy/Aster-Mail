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
  build_import_hash_map,
  is_owned_import_address,
  resolve_import_routing,
} from "./import_routing";

const map = build_import_hash_map([
  { address: "Alias@MyDomain.com", hash: "alias-hash" },
  { address: "first.last@example.org", hash: "domain-hash" },
]);

function email(
  overrides: Partial<Parameters<typeof resolve_import_routing>[0]>,
) {
  return {
    from: "someone@elsewhere.net",
    to: [],
    cc: [],
    bcc: [],
    raw_headers: {},
    ...overrides,
  };
}

describe("resolve_import_routing", () => {
  it("links received mail through a subaddressed recipient", () => {
    expect(
      resolve_import_routing(
        email({ to: ["Me <alias+test@mydomain.com>"] }),
        false,
        map,
      ),
    ).toEqual({ routing_token: "alias-hash" });
  });

  it("prefers the delivery header over visible recipients", () => {
    expect(
      resolve_import_routing(
        email({
          to: ["alias@mydomain.com"],
          raw_headers: { "delivered-to": "firstlast@example.org" },
        }),
        false,
        map,
      ),
    ).toEqual({ routing_token: "domain-hash" });
  });

  it("links received mail through cc and bcc", () => {
    expect(
      resolve_import_routing(
        email({ bcc: ["first.last@example.org"] }),
        false,
        map,
      ),
    ).toEqual({ routing_token: "domain-hash" });
  });

  it("links sent mail through the sender", () => {
    expect(
      resolve_import_routing(
        email({
          from: "Alias <alias@mydomain.com>",
          to: ["first.last@example.org"],
        }),
        true,
        map,
      ),
    ).toEqual({ sender_alias_hash: "alias-hash" });
  });

  it("returns nothing for unknown addresses", () => {
    expect(
      resolve_import_routing(email({ to: ["other@mydomain.com"] }), false, map),
    ).toEqual({});
    expect(resolve_import_routing(email({}), true, map)).toEqual({});
  });

  it("returns nothing when no addresses are known", () => {
    expect(
      resolve_import_routing(
        email({ to: ["alias@mydomain.com"] }),
        false,
        build_import_hash_map([]),
      ),
    ).toEqual({});
  });
});

describe("is_owned_import_address", () => {
  it("matches owned addresses regardless of case, dots and tags", () => {
    expect(is_owned_import_address("FIRSTLAST+x@Example.org", map)).toBe(true);
    expect(is_owned_import_address("stranger@example.org", map)).toBe(false);
    expect(is_owned_import_address(undefined, map)).toBe(false);
  });
});
