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
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const prefs = vi.hoisted(() => ({
  value: { low_network_mode: false, show_profile_pictures: true },
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: prefs.value }),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_favicon_src", () => ({
  use_favicon_src: () => "",
  store_favicon_if_api_url: () => undefined,
}));

vi.mock("@/hooks/use_contact_photo", () => ({
  use_contact_photo: () => null,
}));

const { ProfileAvatar } = await import("./profile_avatar");
const { ContactAvatar } =
  await import("@/components/common/contacts/contact_avatar");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; container: HTMLDivElement } | null = null;

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });
  mounted = { root, container };

  return container;
}

function favicon_requests(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => src.includes("/favicon/"));
}

afterEach(() => {
  if (mounted) {
    const { root, container } = mounted;

    act(() => {
      root.unmount();
    });
    container.remove();
    mounted = null;
  }
  prefs.value = { low_network_mode: false, show_profile_pictures: true };
});

describe("sender pictures setting", () => {
  it("loads the sender domain logo when the setting is on", () => {
    const container = render(
      <ProfileAvatar use_domain_logo email="news@shop.example" name="Shop" />,
    );

    expect(favicon_requests(container)).toHaveLength(1);
  });

  it("requests no domain logo in any view when the setting is off", () => {
    prefs.value = { low_network_mode: false, show_profile_pictures: false };

    const container = render(
      <ProfileAvatar use_domain_logo email="news@shop.example" name="Shop" />,
    );

    expect(favicon_requests(container)).toEqual([]);
  });

  it("requests no contact favicon when the setting is off", () => {
    prefs.value = { low_network_mode: false, show_profile_pictures: false };

    const container = render(
      <ContactAvatar email="news@shop.example" name="Shop" size_px={32} />,
    );

    expect(favicon_requests(container)).toEqual([]);
  });

  it("loads the contact favicon when the setting is on", () => {
    const container = render(
      <ContactAvatar email="news@shop.example" name="Shop" size_px={32} />,
    );

    expect(favicon_requests(container)).toHaveLength(1);
  });
});
