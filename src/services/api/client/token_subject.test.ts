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

import { token_subject } from "./token_subject";

const encode = (value: object): string =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const make_token = (claims: object): string =>
  `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;

describe("token_subject", () => {
  it("reads the account id from a token", () => {
    expect(
      token_subject(
        make_token({ sub: "7e41c2d9-5b0a-4f3e-9c8d-2a6b1f0e4d37" }),
      ),
    ).toBe("7e41c2d9-5b0a-4f3e-9c8d-2a6b1f0e4d37");
  });

  it("returns null for anything that is not a token", () => {
    expect(token_subject(null)).toBeNull();
    expect(token_subject(undefined)).toBeNull();
    expect(token_subject("")).toBeNull();
    expect(token_subject("not-a-token")).toBeNull();
    expect(token_subject("a.!!!.c")).toBeNull();
    expect(token_subject(make_token({ sub: 42 }))).toBeNull();
    expect(token_subject(make_token({ iat: 1 }))).toBeNull();
  });
});
