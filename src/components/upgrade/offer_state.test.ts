/*
 * Aster Communications Inc.
 *
 * Copyright (c) 2026 Aster Communications Inc.
 *
 * This file is part of this project.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  dismiss_offer,
  is_offer_dismissed,
  offer_discount_percent,
  offer_is_live,
  read_dismissed_offers,
  should_show_offer,
} from "./offer_state";

const now = Date.parse("2026-09-02T12:00:00Z");

const offer = {
  code: "WINBACK20",
  discount_label: "20% off for your first 3 months",
  expires_at: "2026-09-09T12:00:00Z",
};

beforeEach(() => {
  localStorage.clear();
});

describe("offer_discount_percent", () => {
  it("reads the percentage out of a server label", () => {
    expect(offer_discount_percent("20% off for your first 3 months")).toBe(20);
    expect(offer_discount_percent("Save 50 % today")).toBe(50);
  });

  it("returns null when there is no usable percentage", () => {
    expect(offer_discount_percent(null)).toBeNull();
    expect(offer_discount_percent("")).toBeNull();
    expect(offer_discount_percent("Two months free")).toBeNull();
    expect(offer_discount_percent("0% off")).toBeNull();
  });
});

describe("offer_is_live", () => {
  it("accepts an offer that has not expired", () => {
    expect(offer_is_live(offer, now)).toBe(true);
  });

  it("rejects a missing, expired, or unparsable offer", () => {
    expect(offer_is_live(null, now)).toBe(false);
    expect(
      offer_is_live({ ...offer, expires_at: "2026-08-01T00:00:00Z" }, now),
    ).toBe(false);
    expect(offer_is_live({ ...offer, expires_at: "soon" }, now)).toBe(false);
    expect(offer_is_live({ ...offer, code: "" }, now)).toBe(false);
  });
});

describe("dismiss_offer", () => {
  it("remembers a dismissed code without duplicating it", () => {
    dismiss_offer(offer.code);
    dismiss_offer(offer.code);

    expect(read_dismissed_offers()).toEqual([offer.code]);
    expect(is_offer_dismissed(offer.code)).toBe(true);
    expect(is_offer_dismissed("OTHER")).toBe(false);
  });

  it("keeps at most twenty codes, newest first", () => {
    for (let index = 0; index < 25; index += 1) dismiss_offer(`CODE${index}`);

    const stored = read_dismissed_offers();

    expect(stored).toHaveLength(20);
    expect(stored[0]).toBe("CODE24");
  });

  it("ignores stored values that are not a list of codes", () => {
    localStorage.setItem("aster_dismissed_offers", "{}");
    expect(read_dismissed_offers()).toEqual([]);

    localStorage.setItem("aster_dismissed_offers", "not json");
    expect(read_dismissed_offers()).toEqual([]);
  });
});

describe("should_show_offer", () => {
  it("shows a live offer that has not been dismissed", () => {
    expect(should_show_offer(offer, now)).toBe(true);
  });

  it("hides an offer once it is dismissed", () => {
    dismiss_offer(offer.code);
    expect(should_show_offer(offer, now)).toBe(false);
  });
});
