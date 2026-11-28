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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({ redirects: [] as string[] }));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => null,
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    accounts: [
      { id: "a", user: { id: "a", email: "a@example.test" } },
      { id: "b", user: { id: "b", email: "b@example.test" } },
    ],
  }),
}));
vi.mock("@/lib/hard_redirect", () => ({
  hard_redirect: (path: string) => h.redirects.push(path),
}));

import { AccountChooser } from "./account_chooser";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("AccountChooser", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render_chooser = () => {
    act(() => {
      root.render(<AccountChooser />);
    });
  };

  const click_option = (index: number) => {
    const options = container.querySelectorAll<HTMLElement>(
      '[data-testid="account_chooser_option"]',
    );

    act(() => {
      options[index].click();
    });
  };

  beforeEach(() => {
    h.redirects.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens the chosen account on the link-device page with its code", () => {
    window.history.replaceState(null, "", "/u/9/link-device?x=1#v=ABCD");
    render_chooser();

    click_option(1);

    expect(h.redirects).toEqual(["/u/1/link-device?x=1#v=ABCD"]);
  });

  it("opens the chosen account at its inbox from other pages", () => {
    window.history.replaceState(null, "", "/u/9/settings");
    render_chooser();

    click_option(0);

    expect(h.redirects).toEqual(["/u/0/"]);
  });
});
