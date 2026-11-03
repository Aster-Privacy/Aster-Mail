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
import type { ReactElement } from "react";
import type { LogoLook } from "@/lib/logo_tone";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const favicon_look = vi.fn<(domain: string) => LogoLook | null>();

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { low_network_mode: false, show_profile_pictures: true },
  }),
}));

vi.mock("@/contexts/sender_logo_context", () => ({
  use_sender_logos_allowed: () => true,
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_favicon_src", () => ({
  use_favicon_src: (domain: string, enabled = true) =>
    enabled && domain ? `blob:local/favicon/${domain}` : "data:pending",
  use_favicon_look: (domain: string) => favicon_look(domain),
  store_favicon_if_api_url: () => undefined,
}));

const { ContactAvatar } = await import("./contact_avatar");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; container: HTMLDivElement } | null = null;

function render(element: ReactElement): HTMLElement {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });
  mounted = { root, container };

  return container.firstElementChild as HTMLElement;
}

describe("ContactAvatar logo fill", () => {
  beforeEach(() => {
    favicon_look.mockReset();
    favicon_look.mockImplementation((domain) =>
      domain === "achriom.com" ? { tone: "none", fill: 125 } : null,
    );
  });

  afterEach(() => {
    if (!mounted) return;
    const { root, container } = mounted;

    act(() => {
      root.unmount();
    });
    container.remove();
    mounted = null;
  });

  it("scales a padded logo tile to the edge of the circle", () => {
    const avatar = render(
      <ContactAvatar
        className="mt-1"
        email="hello@mail.achriom.com"
        name="Achriom"
        size_px={40}
      />,
    );

    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "blob:local/favicon/achriom.com",
    );
    expect(avatar.classList.contains("sender_logo_fill_125")).toBe(true);
    expect(avatar.classList.contains("mt-1")).toBe(true);
  });

  it("does not scale a contact photo", () => {
    const avatar = render(
      <ContactAvatar
        avatar_url="https://example.com/photo.png"
        email="hello@mail.achriom.com"
        name="Achriom"
        size_px={40}
      />,
    );

    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/photo.png",
    );
    expect(avatar.className).not.toMatch(/sender_logo_/);
  });

  it("does not scale a logo that already reaches the edge", () => {
    favicon_look.mockReturnValue({ tone: "none", fill: 100 });

    const avatar = render(
      <ContactAvatar email="hello@pt.pt" name="PT" size_px={40} />,
    );

    expect(avatar.querySelector("img")).not.toBeNull();
    expect(avatar.className).not.toMatch(/sender_logo_/);
  });
});
