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
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("AccountChooser", () => {
  beforeEach(() => {
    h.redirects.length = 0;
  });

  it("opens the chosen account on the link-device page with its code", () => {
    window.history.replaceState(null, "", "/u/9/link-device?x=1#v=ABCD");
    render(<AccountChooser />);

    fireEvent.click(screen.getAllByTestId("account_chooser_option")[1]);

    expect(h.redirects).toEqual(["/u/1/link-device?x=1#v=ABCD"]);
  });

  it("opens the chosen account at its inbox from other pages", () => {
    window.history.replaceState(null, "", "/u/9/settings");
    render(<AccountChooser />);

    fireEvent.click(screen.getAllByTestId("account_chooser_option")[0]);

    expect(h.redirects).toEqual(["/u/0/"]);
  });
});
