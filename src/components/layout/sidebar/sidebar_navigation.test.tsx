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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  is_current_location,
  should_skip_navigation,
  use_sidebar_navigate,
} from "./sidebar_navigation";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const INBOX = { pathname: "/inbox", search: "", hash: "" };

describe("is_current_location", () => {
  it("matches the path the sidebar is already showing", () => {
    expect(is_current_location(INBOX, "/inbox")).toBe(true);
    expect(
      is_current_location(
        { pathname: "/folder/a%20b", search: "", hash: "" },
        `/folder/${encodeURIComponent("a b")}`,
      ),
    ).toBe(true);
  });

  it("treats an open email, query, or route state as a different place", () => {
    expect(is_current_location({ ...INBOX, hash: "#abc" }, "/inbox")).toBe(
      false,
    );
    expect(is_current_location({ ...INBOX, search: "?q=x" }, "/inbox")).toBe(
      false,
    );
    expect(
      is_current_location({ ...INBOX, state: { search_query: "x" } }, "/inbox"),
    ).toBe(false);
    expect(is_current_location(INBOX, "/sent")).toBe(false);
  });
});

describe("should_skip_navigation", () => {
  it("skips a repeat of the navigation that is still pending", () => {
    expect(should_skip_navigation(INBOX, "/sent", "/sent")).toBe(true);
    expect(should_skip_navigation(INBOX, "/sent", "/inbox")).toBe(false);
  });
});

describe("use_sidebar_navigate", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(location: typeof INBOX, navigate: (path: string) => void) {
    const handle: { current: ((path: string) => void) | null } = {
      current: null,
    };

    function Probe() {
      handle.current = use_sidebar_navigate(navigate, location);

      return null;
    }

    act(() => root.render(createElement(Probe)));

    return handle;
  }

  it("does nothing when the active folder is clicked again", () => {
    const navigate = vi.fn();
    const handle = mount(INBOX, navigate);

    act(() => {
      for (let i = 0; i < 10; i += 1) handle.current?.("/inbox");
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates once when another folder is spam clicked", () => {
    const navigate = vi.fn();
    const handle = mount(INBOX, navigate);

    act(() => {
      for (let i = 0; i < 10; i += 1) handle.current?.("/sent");
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/sent");
  });

  it("navigates back to the active folder when an email is open", () => {
    const navigate = vi.fn();
    const handle = mount({ ...INBOX, hash: "#abc" }, navigate);

    act(() => handle.current?.("/inbox"));

    expect(navigate).toHaveBeenCalledWith("/inbox");
  });
});
