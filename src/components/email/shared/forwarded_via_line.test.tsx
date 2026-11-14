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

import { ForwardedViaLine } from "./forwarded_via_line";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.address ? `${key}:${params.address}` : key,
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactElement): HTMLDivElement {
  const host = document.createElement("div");

  document.body.appendChild(host);
  container = host;
  const created = createRoot(host);

  root = created;
  act(() => {
    created.render(element);
  });

  return host;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe("ForwardedViaLine", () => {
  it("shows the forwarding address for a forwarded message", () => {
    const el = render(
      <ForwardedViaLine
        sender={{
          sender_email: "shop@addy.io",
          display_sender_email: "jane@example.com",
        }}
      />,
    );

    expect(el.textContent).toBe("mail.forwarded_via:shop@addy.io");
  });

  it("renders nothing for a direct message", () => {
    const el = render(
      <ForwardedViaLine sender={{ sender_email: "jane@example.com" }} />,
    );

    expect(el.textContent).toBe("");
  });

  it("renders markup in the address as text", () => {
    const el = render(
      <ForwardedViaLine
        sender={{
          sender_email: "<img src=x>@addy.io",
          display_sender_email: "jane@example.com",
        }}
      />,
    );

    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x>@addy.io");
  });
});
