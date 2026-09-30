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
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import {
  MobileToolbar,
  DEFAULT_TOOLBAR,
  MAX_TOOLBAR_ACTIONS,
} from "./mobile_detail_toolbar";

function render_toolbar(props: Partial<Parameters<typeof MobileToolbar>[0]>) {
  const host = document.createElement("div");

  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <MobileToolbar
        is_starred={false}
        on_archive={() => {}}
        on_delete={() => {}}
        on_mark_read={() => {}}
        on_more={() => {}}
        on_print={() => {}}
        on_spam={() => {}}
        on_star={() => {}}
        {...props}
      />,
    );
  });

  const labels = Array.from(host.querySelectorAll("button")).map((b) =>
    b.getAttribute("aria-label"),
  );

  act(() => root.unmount());
  host.remove();

  return labels;
}

describe("mobile detail toolbar", () => {
  it("shows the same four actions the other clients default to", () => {
    const labels = render_toolbar({});

    expect(DEFAULT_TOOLBAR).toEqual(["mark_read", "trash", "archive", "star"]);
    expect(labels).toEqual([
      "mail.mark_read",
      "mail.move_to_trash",
      "mail.archive",
      "mail.star",
      "common.more_actions",
    ]);
  });

  it("never renders more than the shared slot count", () => {
    const labels = render_toolbar({
      actions: ["mark_read", "trash", "archive", "star", "spam", "print"],
    });

    expect(labels).toHaveLength(MAX_TOOLBAR_ACTIONS + 1);
  });

  it("offers to mark an already-read message unread", () => {
    const labels = render_toolbar({ actions: ["mark_read"], is_read: true });

    expect(labels[0]).toBe("mail.mark_unread");
  });

  it("turns the archive button into a move to inbox inside the archive", () => {
    const labels = render_toolbar({ actions: ["archive"], is_archived: true });

    expect(labels[0]).toBe("mail.move_to_inbox");
  });
});
