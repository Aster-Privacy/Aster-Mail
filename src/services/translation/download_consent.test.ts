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
import { beforeEach, describe, expect, it } from "vitest";

import {
  clear_pack_consent,
  grant_route_consent,
  revoke_pack_consent,
  route_consent_granted,
  route_packs,
} from "./download_consent";

beforeEach(() => {
  clear_pack_consent();
});

describe("route_packs", () => {
  it("names a single pack for a route that touches English", () => {
    expect(route_packs("de", "en")).toEqual(["deen"]);
    expect(route_packs("en", "ja")).toEqual(["enja"]);
  });

  it("names both packs for a route that pivots through English", () => {
    expect(route_packs("de", "fr")).toEqual(["deen", "enfr"]);
  });
});

describe("route consent", () => {
  it("withholds consent until it is granted", () => {
    expect(route_consent_granted("de", "en")).toBe(false);

    grant_route_consent("de", "en");

    expect(route_consent_granted("de", "en")).toBe(true);
  });

  it("keeps consent scoped to the packs a route needs", () => {
    grant_route_consent("de", "en");

    expect(route_consent_granted("de", "fr")).toBe(false);

    grant_route_consent("en", "fr");

    expect(route_consent_granted("de", "fr")).toBe(true);
  });

  it("asks again once a pack is removed", () => {
    grant_route_consent("de", "fr");
    revoke_pack_consent("enfr");

    expect(route_consent_granted("de", "fr")).toBe(false);
    expect(route_consent_granted("de", "en")).toBe(true);
  });

  it("asks again for everything once consent is cleared", () => {
    grant_route_consent("de", "fr");
    clear_pack_consent();

    expect(route_consent_granted("de", "en")).toBe(false);
  });
});
