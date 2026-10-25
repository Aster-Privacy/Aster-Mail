//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  fallback: null as string | null,
  listeners: new Set<() => void>(),
  show_toast: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: {
    take_unsupported_method_fallback: () => {
      const value = h.fallback;

      h.fallback = null;

      return value;
    },
    subscribe: (listener: () => void) => {
      h.listeners.add(listener);

      return () => h.listeners.delete(listener);
    },
  },
}));

import { ConnectionFallbackNotice } from "./connection_fallback_notice";

describe("ConnectionFallbackNotice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    h.fallback = null;
    h.listeners.clear();
    h.show_toast.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("tells the user once when Tor was switched to direct before mount", () => {
    h.fallback = "tor";

    act(() => root.render(<ConnectionFallbackNotice />));

    expect(h.show_toast).toHaveBeenCalledTimes(1);
    expect(h.show_toast).toHaveBeenCalledWith(
      "settings.connection.tor_unavailable_fallback",
      "warning",
      expect.any(Number),
    );

    act(() => h.listeners.forEach((listener) => listener()));

    expect(h.show_toast).toHaveBeenCalledTimes(1);
  });

  it("tells the user when the fallback happens after mount", () => {
    act(() => root.render(<ConnectionFallbackNotice />));

    expect(h.show_toast).not.toHaveBeenCalled();

    h.fallback = "tor_snowflake";
    act(() => h.listeners.forEach((listener) => listener()));

    expect(h.show_toast).toHaveBeenCalledTimes(1);
  });

  it("stays silent when nothing was switched", () => {
    act(() => root.render(<ConnectionFallbackNotice />));
    act(() => h.listeners.forEach((listener) => listener()));

    expect(h.show_toast).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("stays silent for a non-Tor fallback", () => {
    h.fallback = "cdn_relay";

    act(() => root.render(<ConnectionFallbackNotice />));

    expect(h.show_toast).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", () => {
    act(() => root.render(<ConnectionFallbackNotice />));
    act(() => root.unmount());

    expect(h.listeners.size).toBe(0);
    root = createRoot(container);
  });
});
