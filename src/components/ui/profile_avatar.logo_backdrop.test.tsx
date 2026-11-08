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
import type { LogoFill, LogoTone } from "@/lib/logo_tone";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const contact_photo =
  vi.fn<(email: string | null | undefined) => string | null>();
const favicon_tone = vi.fn<(domain: string) => LogoTone | null>();
const favicon_fill = vi.fn<(domain: string) => LogoFill>();

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
  use_favicon_src: (domain: string) => `blob:local/favicon/${domain}`,
  use_favicon_look: (domain: string) => {
    const tone = favicon_tone(domain);

    return tone === null ? null : { tone, fill: favicon_fill(domain) };
  },
  store_favicon_if_api_url: () => undefined,
}));

vi.mock("@/hooks/use_contact_photo", () => ({
  use_contact_photo: (email: string | null | undefined) => contact_photo(email),
}));

const { ProfileAvatar } = await import("./profile_avatar");

const PHOTO = "data:image/png;base64,AAAA";
const LIGHT_BACKDROP = "rgb(1, 2, 3)";
const DARK_BACKDROP = "rgb(4, 5, 6)";

function logo_backdrop_rules(): string {
  const css = readFileSync(
    resolve(__dirname, "../../styles/globals.css"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  return Array.from(
    css.matchAll(
      /^[^{}\n]*\.sender_logo_(?:dark|light|fill_\d+)[^{}]*\{[^}]*\}/gm,
    ),
    (match) => match[0],
  )
    .join("\n")
    .replace("var(--avatar-logo-light-bg)", LIGHT_BACKDROP)
    .replace("var(--avatar-logo-dark-bg)", DARK_BACKDROP);
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; container: HTMLDivElement } | null = null;
let style: HTMLStyleElement | null = null;

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

function render_logo(tone: LogoTone | null): HTMLElement {
  favicon_tone.mockImplementation((domain) =>
    domain === "pt.pt" ? tone : null,
  );

  return render(
    <ProfileAvatar use_domain_logo email="request@pt.pt" name=".PT" />,
  );
}

function unmount(): void {
  if (!mounted) return;
  const { root, container } = mounted;

  act(() => {
    root.unmount();
  });
  container.remove();
  mounted = null;
}

function backdrop_in(
  theme: "light" | "dark",
  tone: LogoTone | null,
): { class_name: string; backdrop: string } {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const avatar = render_logo(tone);
  const result = {
    class_name: avatar.className,
    backdrop: getComputedStyle(avatar).backgroundColor,
  };

  unmount();

  return result;
}

describe("ProfileAvatar logo backdrop", () => {
  beforeEach(() => {
    contact_photo.mockReset();
    contact_photo.mockReturnValue(null);
    favicon_tone.mockReset();
    favicon_tone.mockReturnValue(null);
    favicon_fill.mockReset();
    favicon_fill.mockReturnValue(100);
    style = document.createElement("style");
    style.textContent = logo_backdrop_rules();
    document.head.appendChild(style);
  });

  afterEach(() => {
    style?.remove();
    style = null;
    document.documentElement.classList.remove("dark");
    unmount();
  });

  it("puts a light backdrop behind a dark transparent logo only in the dark theme", () => {
    const avatar = render_logo("dark");

    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "blob:local/favicon/pt.pt",
    );
    unmount();

    const dark = backdrop_in("dark", "dark");
    const light = backdrop_in("light", "dark");

    expect(dark.class_name).toContain("sender_logo_dark");
    expect(dark.backdrop).toBe(LIGHT_BACKDROP);
    expect(light.class_name).toContain("sender_logo_dark");
    expect([LIGHT_BACKDROP, DARK_BACKDROP]).not.toContain(light.backdrop);
  });

  it("puts a dark backdrop behind a light transparent logo only in the light theme", () => {
    const light = backdrop_in("light", "light");
    const dark = backdrop_in("dark", "light");

    expect(light.class_name).toContain("sender_logo_light");
    expect(light.backdrop).toBe(DARK_BACKDROP);
    expect(dark.class_name).toContain("sender_logo_light");
    expect([LIGHT_BACKDROP, DARK_BACKDROP]).not.toContain(dark.backdrop);
  });

  it("keeps the caller's class next to the tone class", () => {
    favicon_tone.mockReturnValue("dark");

    const avatar = render(
      <ProfileAvatar
        use_domain_logo
        className="mt-1"
        email="request@pt.pt"
        name=".PT"
      />,
    );

    expect(avatar.classList.contains("sender_logo_dark")).toBe(true);
    expect(avatar.classList.contains("mt-1")).toBe(true);
  });

  it("leaves opaque, unreadable and not yet analysed logos alone", () => {
    for (const tone of ["none", null] as const) {
      for (const theme of ["light", "dark"] as const) {
        const result = backdrop_in(theme, tone);

        expect(result.class_name).not.toMatch(/sender_logo_/);
        expect([LIGHT_BACKDROP, DARK_BACKDROP]).not.toContain(result.backdrop);
      }
    }
  });

  it("does not mark saved contact photos", () => {
    contact_photo.mockReturnValue(PHOTO);
    favicon_tone.mockReturnValue("dark");

    const avatar = render(
      <ProfileAvatar
        use_domain_logo
        email="friend@example.com"
        name="Friend"
      />,
    );

    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(PHOTO);
    expect(avatar.className).not.toMatch(/sender_logo_/);
  });

  it("does not mark profile pictures", () => {
    favicon_tone.mockReturnValue("dark");

    const avatar = render(
      <ProfileAvatar
        use_domain_logo
        email="friend@example.com"
        image_url="https://example.com/profile.png"
        name="Friend"
      />,
    );

    expect(avatar.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/profile.png",
    );
    expect(avatar.className).not.toMatch(/sender_logo_/);
  });

  it("does not mark initials", () => {
    favicon_tone.mockReturnValue("dark");

    const avatar = render(
      <ProfileAvatar email="friend@example.com" name="Friend" />,
    );

    expect(avatar.querySelector("img")).toBeNull();
    expect(avatar.textContent).toBe("F");
    expect(avatar.className).not.toMatch(/sender_logo_/);
  });

  it("does not mark the Aster logo", () => {
    favicon_tone.mockReturnValue("dark");

    const avatar = render(
      <ProfileAvatar
        sender_authenticated
        use_domain_logo
        email="noreply@astermail.org"
        name="Aster"
      />,
    );

    expect(avatar.querySelector("img")).not.toBeNull();
    expect(avatar.className).not.toMatch(/sender_logo_/);
  });

  it("scales a padded opaque tile to fill the circle with no backdrop in either theme", () => {
    favicon_fill.mockReturnValue(120);

    for (const theme of ["light", "dark"] as const) {
      document.documentElement.classList.toggle("dark", theme === "dark");
      const avatar = render_logo("none");
      const image = avatar.querySelector("img") as HTMLImageElement;

      expect(avatar.classList.contains("sender_logo_fill_120")).toBe(true);
      expect(avatar.className).not.toMatch(/sender_logo_(?:dark|light)/);
      expect(getComputedStyle(image).transform).toBe("scale(1.2)");
      expect(getComputedStyle(image).padding).toBe("");
      expect([LIGHT_BACKDROP, DARK_BACKDROP]).not.toContain(
        getComputedStyle(avatar).backgroundColor,
      );
      unmount();
    }
  });

  it("has a scale rule for every fill step the analysis can return", async () => {
    const { LOGO_FILL_STEPS } = await import("@/lib/logo_tone");
    const rules = logo_backdrop_rules();

    for (const step of LOGO_FILL_STEPS.filter((value) => value > 100)) {
      expect(rules).toContain(
        `.sender_logo_fill_${step} > img {\n  transform: scale(${step / 100});`,
      );
    }
  });

  it("does not scale an edge-to-edge logo", () => {
    const avatar = render_logo("none");

    expect(avatar.className).not.toMatch(/sender_logo_/);
    expect(
      getComputedStyle(avatar.querySelector("img") as HTMLImageElement)
        .transform,
    ).toBe("");
  });
});
