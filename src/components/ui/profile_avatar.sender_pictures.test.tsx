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

const favicon_calls = vi.hoisted(() => [] as Array<[string, boolean]>);

vi.mock("@/hooks/use_favicon_src", () => ({
  use_favicon_src: (domain: string, enabled = true) => {
    favicon_calls.push([domain, enabled]);

    return enabled ? `blob:local/favicon/${domain}` : "data:pending";
  },
  use_favicon_tone: () => null,
  store_favicon_if_api_url: () => undefined,
}));

vi.mock("@/hooks/use_contact_photo", () => ({
  use_contact_photo: () => null,
}));

const { ProfileAvatar } = await import("./profile_avatar");
const { SenderLogoBoundary } = await import("@/contexts/sender_logo_context");
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
  favicon_calls.length = 0;
});

function api_requests(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => src.includes("/api/"));
}

describe("sender pictures setting", () => {
  it("loads the sender domain logo when the setting is on", () => {
    const container = render(
      <ProfileAvatar use_domain_logo email="news@shop.example" name="Shop" />,
    );

    expect(favicon_requests(container)).toHaveLength(1);
    expect(api_requests(container)).toEqual([]);
  });

  it("requests no domain logo in any view when the setting is off", () => {
    prefs.value = { low_network_mode: false, show_profile_pictures: false };

    const container = render(
      <ProfileAvatar use_domain_logo email="news@shop.example" name="Shop" />,
    );

    expect(favicon_requests(container)).toEqual([]);
    expect(favicon_calls.every(([, enabled]) => !enabled)).toBe(true);
  });

  it("requests no contact favicon when the setting is off", () => {
    prefs.value = { low_network_mode: false, show_profile_pictures: false };

    const container = render(
      <ContactAvatar email="news@shop.example" name="Shop" size_px={32} />,
    );

    expect(favicon_requests(container)).toEqual([]);
    expect(favicon_calls.every(([, enabled]) => !enabled)).toBe(true);
  });

  it("loads the contact favicon when the setting is on", () => {
    const container = render(
      <ContactAvatar email="news@shop.example" name="Shop" size_px={32} />,
    );

    expect(favicon_requests(container)).toHaveLength(1);
    expect(api_requests(container)).toEqual([]);
  });
});

describe("sender logos inside spam", () => {
  it("requests no domain logo inside a blocked boundary", () => {
    const container = render(
      <SenderLogoBoundary allowed={false}>
        <ProfileAvatar use_domain_logo email="news@shop.example" name="Shop" />
      </SenderLogoBoundary>,
    );

    expect(favicon_requests(container)).toEqual([]);
    expect(favicon_calls.every(([, enabled]) => !enabled)).toBe(true);
  });

  it("keeps blocking when a nested boundary allows logos", () => {
    const container = render(
      <SenderLogoBoundary allowed={false}>
        <SenderLogoBoundary allowed>
          <ProfileAvatar
            use_domain_logo
            email="news@shop.example"
            name="Shop"
          />
        </SenderLogoBoundary>
      </SenderLogoBoundary>,
    );

    expect(favicon_requests(container)).toEqual([]);
    expect(favicon_calls.every(([, enabled]) => !enabled)).toBe(true);
  });

  it("loads the domain logo inside an allowed boundary", () => {
    const container = render(
      <SenderLogoBoundary allowed>
        <ProfileAvatar use_domain_logo email="news@shop.example" name="Shop" />
      </SenderLogoBoundary>,
    );

    expect(favicon_requests(container)).toHaveLength(1);
  });
});

describe("contact favicons inside spam", () => {
  it("requests no contact favicon inside a blocked boundary", () => {
    const container = render(
      <SenderLogoBoundary allowed={false}>
        <ContactAvatar email="news@shop.example" name="Shop" size_px={32} />
      </SenderLogoBoundary>,
    );

    expect(favicon_requests(container)).toEqual([]);
    expect(favicon_calls.every(([, enabled]) => !enabled)).toBe(true);
  });
});
