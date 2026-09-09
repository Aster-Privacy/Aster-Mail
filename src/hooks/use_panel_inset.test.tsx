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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import { use_panel_inset } from "./use_panel_inset";

function Panel({ is_open, width }: { is_open: boolean; width: number }) {
  const panel_ref = useRef<HTMLDivElement | null>(null);

  use_panel_inset(is_open, panel_ref);

  return (
    <div
      ref={(node) => {
        if (node) {
          node.getBoundingClientRect = () => ({ width }) as DOMRect;
        }
        panel_ref.current = node;
      }}
    />
  );
}

function Rail({
  contacts_open,
  security_open,
}: {
  contacts_open: boolean;
  security_open: boolean;
}) {
  return (
    <>
      <Panel is_open={contacts_open} width={320} />
      <Panel is_open={security_open} width={272} />
    </>
  );
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const read_inset = () =>
  document.documentElement.style.getPropertyValue("--quick_panel_inset");

describe("use_panel_inset", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_rail = async (
    contacts_open: boolean,
    security_open: boolean,
  ) => {
    await act(async () => {
      root.render(
        <Rail contacts_open={contacts_open} security_open={security_open} />,
      );
    });
  };

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
    document.documentElement.style.removeProperty("--quick_panel_inset");
  });

  it("stays at zero while both panels are closed", async () => {
    await render_rail(false, false);

    expect(read_inset()).toBe("0px");
  });

  it("reports the width of the open panel", async () => {
    await render_rail(true, false);

    expect(read_inset()).toBe("320px");
  });

  it("hands the inset over when the later panel opens", async () => {
    await render_rail(true, false);
    await render_rail(false, true);

    expect(read_inset()).toBe("272px");
  });

  it("hands the inset back when the earlier panel opens", async () => {
    await render_rail(false, true);
    await render_rail(true, false);

    expect(read_inset()).toBe("320px");
  });

  it("clears the inset once every panel closes", async () => {
    await render_rail(false, true);
    await render_rail(false, false);

    expect(read_inset()).toBe("0px");
  });
});
