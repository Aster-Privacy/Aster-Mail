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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: unknown;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children as never}</button>,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: null }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/hooks/use_attachment_previews", () => ({
  use_attachment_previews: () => new Map(),
}));

const { EmptyState } = await import("./inbox_email_list");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("EmptyState load error variant", () => {
  it("shows a connection error and retry button instead of no-messages", () => {
    const on_retry = vi.fn();
    const el = render(
      <EmptyState
        current_view="all"
        user_email="user@example.com"
        has_load_error
        on_retry={on_retry}
      />,
    );

    expect(el.textContent).toContain("errors.connection_failed");
    expect(el.textContent).not.toContain("mail.no_messages");

    const button = el.querySelector("button")!;

    expect(button.textContent).toBe("common.retry");
    act(() => {
      button.click();
    });
    expect(on_retry).toHaveBeenCalledTimes(1);
  });

  it("still shows the normal empty state when there is no error", () => {
    const el = render(
      <EmptyState
        current_view="all"
        user_email="user@example.com"
      />,
    );

    expect(el.textContent).toContain("mail.no_messages");
    expect(el.textContent).not.toContain("errors.connection_failed");
  });
});
