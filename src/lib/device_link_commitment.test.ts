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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capture_link_commitment,
  clear_link_commitment,
  format_fingerprint_input,
  link_device_url,
  normalize_fingerprint,
  read_link_commitment,
} from "./device_link_commitment";

const FINGERPRINT = "9B16 AF79 0A6A E2F2 55D3";
const KEY = "aster_link_device_commitment";

describe("device link commitment", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes typed codes and rejects malformed ones", () => {
    expect(normalize_fingerprint("9b16-af79 0a6a e2f255d3")).toBe(FINGERPRINT);
    expect(normalize_fingerprint("9B16 AF79 0A6A E2F2")).toBeNull();
    expect(normalize_fingerprint("9B16 AF79 0A6A E2F2 55DZ")).toBeNull();
    expect(normalize_fingerprint("")).toBeNull();
    expect(normalize_fingerprint(null)).toBeNull();
    expect(format_fingerprint_input("9b16af790a")).toBe("9B16 AF79 0A");
  });

  it("builds a link that carries the code in the fragment only", () => {
    expect(link_device_url("https://x.test/link-device", FINGERPRINT)).toBe(
      "https://x.test/link-device#v=9B16AF790A6AE2F255D3",
    );
    expect(() => link_device_url("https://x.test/link-device", "")).toThrow();
  });

  it("captures the code from the link and removes it from the address", () => {
    window.history.replaceState(
      null,
      "",
      "/u/1/link-device?a=1#v=9B16AF790A6AE2F255D3",
    );

    capture_link_commitment();

    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?a=1");
    expect(read_link_commitment()).toBe(FINGERPRINT);

    clear_link_commitment();

    expect(read_link_commitment()).toBeNull();
  });

  it("ignores a malformed code and other pages", () => {
    window.history.replaceState(null, "", "/link-device#v=1234");
    capture_link_commitment();
    expect(read_link_commitment()).toBeNull();
    expect(window.location.hash).toBe("");

    window.history.replaceState(null, "", "/inbox#v=9B16AF790A6AE2F255D3");
    capture_link_commitment();
    expect(read_link_commitment()).toBeNull();
    expect(window.location.hash).toBe("#v=9B16AF790A6AE2F255D3");
  });

  it("drops a stored code that is stale or malformed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    window.history.replaceState(null, "", "/link-device#v=9B16AF790A6AE2F255D3");
    capture_link_commitment();
    vi.setSystemTime(new Date("2026-01-01T00:31:00Z"));

    expect(read_link_commitment()).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    window.sessionStorage.setItem(KEY, "{");
    expect(read_link_commitment()).toBeNull();
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ fingerprint: "nope", stored_at: Date.now() }),
    );
    expect(read_link_commitment()).toBeNull();
  });
});
