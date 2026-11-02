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
import { describe, it, expect, afterEach } from "vitest";

import { hold_import_unload_guard } from "./unload_guard";

function fire_beforeunload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });

  window.dispatchEvent(event);

  return event.defaultPrevented;
}

describe("import unload guard", () => {
  const releases: Array<() => void> = [];

  afterEach(() => {
    while (releases.length > 0) releases.pop()!();
  });

  it("warns before leaving only while an import holds the guard", () => {
    expect(fire_beforeunload()).toBe(false);

    const release = hold_import_unload_guard();

    releases.push(release);
    expect(fire_beforeunload()).toBe(true);

    release();
    expect(fire_beforeunload()).toBe(false);
  });

  it("stays armed until every import has released it", () => {
    const first = hold_import_unload_guard();
    const second = hold_import_unload_guard();

    releases.push(second);
    first();
    first();
    expect(fire_beforeunload()).toBe(true);

    second();
    expect(fire_beforeunload()).toBe(false);
  });
});
