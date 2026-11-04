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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import { SpecialOfferSuccessModal } from "./special_offer_success_modal";

let container: HTMLDivElement;
let root: Root;

async function render_modal(plan_code: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(
      <SpecialOfferSuccessModal
        is_open
        on_close={() => undefined}
        plan_code={plan_code}
      />,
    );
  });
}

describe("SpecialOfferSuccessModal", () => {
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("names the purchased plan for Star", async () => {
    await render_modal("star");

    expect(document.body.textContent).toContain(
      "settings.special_offer_success_title_plan",
    );
  });

  it("keeps the Nova title for Nova", async () => {
    await render_modal("nova");

    expect(document.body.textContent).toContain(
      "settings.special_offer_success_title",
    );
    expect(document.body.textContent).not.toContain(
      "settings.special_offer_success_title_plan",
    );
  });

  it("lists features for Family", async () => {
    await render_modal("family");

    expect(
      document.body.querySelectorAll(".special_offer_feature").length,
    ).toBeGreaterThan(0);
  });
});
