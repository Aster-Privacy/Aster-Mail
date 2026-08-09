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
import { describe, expect, it, vi } from "vitest";

import { dispatch_activated_link } from "./desktop_link_bridge";

function capture(event_name: string): { details: unknown[] } {
  const details: unknown[] = [];

  window.addEventListener(event_name, (event) => {
    details.push((event as CustomEvent).detail);
  });

  return { details };
}

describe("dispatch_activated_link", () => {
  it("forwards an https url as an external link", () => {
    const external = capture("aster-external-link");

    dispatch_activated_link("https://example.com/path?q=1");

    expect(external.details).toEqual([{ url: "https://example.com/path?q=1" }]);
  });

  it("forwards a mailto url as an external link", () => {
    const external = capture("aster-external-link");

    dispatch_activated_link("mailto:someone@example.com");

    expect(external.details).toEqual([{ url: "mailto:someone@example.com" }]);
  });

  it("routes an allowlisted aster url to the internal handler", () => {
    const internal = capture("aster-internal-link");
    const external = capture("aster-external-link");

    dispatch_activated_link("aster:settings/security");

    expect(internal.details).toEqual([{ path: "settings/security" }]);
    expect(external.details).toEqual([]);
  });

  it("drops an aster url outside the allowlist", () => {
    const internal = capture("aster-internal-link");
    const external = capture("aster-external-link");

    dispatch_activated_link("aster:../../etc/passwd");

    expect(internal.details).toEqual([]);
    expect(external.details).toEqual([]);
  });

  it("ignores an empty payload", () => {
    const external = capture("aster-external-link");
    const listener = vi.fn();

    window.addEventListener("aster-internal-link", listener);
    dispatch_activated_link("");

    expect(external.details).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });
});
