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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const contact_photo = vi.fn<(email: string | null | undefined) => string | null>();

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { low_network_mode: false } }),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_favicon_src", () => ({
  use_favicon_src: () => "",
  use_favicon_tone: () => null,
  store_favicon_if_api_url: () => undefined,
}));

vi.mock("@/hooks/use_contact_photo", () => ({
  use_contact_photo: (email: string | null | undefined) => contact_photo(email),
}));

const { ProfileAvatar } = await import("./profile_avatar");

const PHOTO = "data:image/png;base64,AAAA";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; container: HTMLDivElement } | null = null;

function render(element: ReactElement): { container: HTMLDivElement } {
  const container = document.createElement("div");

  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });
  mounted = { root, container };

  return { container };
}

function image_sources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).map(
    (img) => img.getAttribute("src") ?? "",
  );
}

describe("ProfileAvatar contact photos", () => {
  beforeEach(() => {
    contact_photo.mockReset();
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

  it("shows the saved contact photo instead of the domain logo", () => {
    contact_photo.mockReturnValue(PHOTO);

    const { container } = render(
      <ProfileAvatar use_domain_logo email="friend@example.com" name="Friend" />,
    );

    expect(image_sources(container)).toEqual([PHOTO]);
  });

  it("prefers the contact photo over a profile picture", () => {
    contact_photo.mockReturnValue(PHOTO);

    const { container } = render(
      <ProfileAvatar
        email="friend@astermail.org"
        image_url="https://example.com/profile.png"
        name="Friend"
      />,
    );

    expect(image_sources(container)).toEqual([PHOTO]);
  });

  it("falls back to the profile picture when there is no contact photo", () => {
    contact_photo.mockReturnValue(null);

    const { container } = render(
      <ProfileAvatar
        email="friend@example.com"
        image_url="https://example.com/profile.png"
        name="Friend"
      />,
    );

    expect(image_sources(container)).toEqual([
      "https://example.com/profile.png",
    ]);
  });

  it("keeps the Aster logo for authenticated system senders", () => {
    contact_photo.mockImplementation((email) => (email ? PHOTO : null));

    const { container } = render(
      <ProfileAvatar
        sender_authenticated
        email="noreply@astermail.org"
        name="Aster"
      />,
    );

    expect(contact_photo).toHaveBeenCalledWith(null);
    expect(image_sources(container)).not.toContain(PHOTO);
  });
});
