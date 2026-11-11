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
import { afterEach, describe, expect, it, vi } from "vitest";

const latch = vi.hoisted(() => ({ erased: false }));

vi.mock("@/lib/device_erase_latch", () => ({
  device_traces_erased: () => latch.erased,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { use_unsaved_changes_guard } =
  await import("./use_unsaved_changes_guard");

const mounted: Array<{ unmount: () => void }> = [];

async function mount_guard(is_dirty: boolean): Promise<void> {
  const Harness = () => {
    use_unsaved_changes_guard(is_dirty);

    return null;
  };
  const root = createRoot(document.createElement("div"));

  mounted.push(root);
  await act(async () => {
    root.render(createElement(Harness));
  });
}

function fire_beforeunload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });

  window.dispatchEvent(event);

  return event.defaultPrevented;
}

describe("unsaved changes guard", () => {
  afterEach(async () => {
    latch.erased = false;
    while (mounted.length > 0) {
      const root = mounted.pop()!;

      await act(async () => {
        root.unmount();
      });
    }
  });

  it("asks before leaving only while there are unsaved changes", async () => {
    await mount_guard(false);
    expect(fire_beforeunload()).toBe(false);

    await mount_guard(true);
    expect(fire_beforeunload()).toBe(true);
  });

  it("lets the tab leave without asking once this device was erased", async () => {
    await mount_guard(true);
    latch.erased = true;

    expect(fire_beforeunload()).toBe(false);
  });
});
