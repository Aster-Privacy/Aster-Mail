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
// GNU Affero General Public License for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionModal } from "@aster/ui";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use_external_sources", () => ({
  use_external_sources: () => ({
    options: [{ value: "acct-1", label: "work@example.com" }],
    label_for: (value: string) => value,
  }),
}));

const { SourceValueDropdown } = await import("./source_value_dropdown");

let container: HTMLDivElement;
let root: Root;

function Harness({
  on_close,
  on_change,
}: {
  on_close: () => void;
  on_change: (values: string[]) => void;
}) {
  const [open, set_open] = useState(true);

  return (
    <MotionModal is_open reduce_motion on_close={on_close}>
      <span data-testid="menu-state">{open ? "open" : "closed"}</span>
      <SourceValueDropdown
        on_change={on_change}
        on_open={() => set_open(true)}
        on_open_change={set_open}
        open={open}
        values={[]}
      />
    </MotionModal>
  );
}

function press_escape() {
  const target = document.activeElement ?? document.body;

  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("SourceValueDropdown inside a modal", () => {
  it("closes only the menu on Escape and leaves the editor open", async () => {
    const on_close = vi.fn();

    await act(async () => {
      root.render(<Harness on_change={vi.fn()} on_close={on_close} />);
    });
    await act(async () => {});
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    await act(async () => {
      press_escape();
    });
    await act(async () => {});

    expect(
      document.querySelector('[data-testid="menu-state"]')!.textContent,
    ).toBe("closed");
    expect(on_close).not.toHaveBeenCalled();

    await act(async () => {
      press_escape();
    });
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("keeps the menu open after a pick so more sources can be added", async () => {
    const on_change = vi.fn();

    await act(async () => {
      root.render(<Harness on_change={on_change} on_close={vi.fn()} />);
    });
    await act(async () => {});

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-source-value="acct-1"]')!
        .click();
    });

    expect(on_change).toHaveBeenCalledWith(["acct-1"]);
    expect(
      document.querySelector('[data-testid="menu-state"]')!.textContent,
    ).toBe("open");
  });
});
