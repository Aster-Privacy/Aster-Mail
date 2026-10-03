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
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { LanguageCode } from "@/lib/i18n/types";

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ExternalContentBanner } from "@/components/email/external_content_banner";
import { MobileExternalContentBanner } from "@/pages/mobile/mobile_detail_banners";
import { I18nProvider, use_i18n } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/external_link_context", () => ({
  use_external_link: () => ({ handle_external_link: vi.fn() }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

function report(
  pixels: string[],
  images = ["https://cdn.shop.example/a.jpg", "https://cdn.shop.example/b.jpg"],
): ExternalContentReport {
  return {
    has_remote_images: images.length > 0 || pixels.length > 0,
    has_remote_fonts: false,
    has_remote_css: false,
    has_tracking_pixels: pixels.length > 0,
    blocked_count: images.length + pixels.length,
    blocked_items: [
      ...images.map((url) => ({ url, type: "image" as const })),
      ...pixels.map((url) => ({ url, type: "tracking_pixel" as const })),
    ],
    cleaned_links: [],
  };
}

const THREE_PIXELS = [
  "https://open.mailmetrics.example/o/1.gif",
  "https://t.beacon.example/open?id=9",
  "https://open.mailmetrics.example/o/2.gif",
];

let container: HTMLDivElement;
let root: Root;
let fetch_spy: ReturnType<typeof vi.fn>;

function MobileBanner({ blocked }: { blocked: ExternalContentReport }) {
  const { t } = use_i18n();

  return (
    <MobileExternalContentBanner on_load={() => {}} report={blocked} t={t} />
  );
}

function render(
  blocked: ExternalContentReport,
  language: LanguageCode = "en",
  mobile = false,
) {
  act(() => {
    root.render(
      <I18nProvider default_language={language}>
        {mobile ? (
          <MobileBanner blocked={blocked} />
        ) : (
          <ExternalContentBanner
            blocked_content={blocked}
            on_dismiss={() => {}}
            on_load={() => {}}
          />
        )}
      </I18nProvider>,
    );
  });
}

function indicator(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    "[data-testid='tracking-pixel-indicator']",
  );

  if (!button) throw new Error("tracking pixel indicator not found");

  return button;
}

function domain_rows(): string[] {
  return Array.from(
    document.querySelectorAll(
      "[data-testid='tracking-pixel-domains'] [data-domain]",
    ),
  ).map((row) => row.textContent ?? "");
}

beforeAll(async () => {
  await get_translations_async("pt");
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetch_spy = vi.fn();
  vi.stubGlobal("fetch", fetch_spy);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("blocked content banner tracking pixels", () => {
  it("counts tracking pixels apart from blocked images", () => {
    render(report(THREE_PIXELS));

    expect(container.textContent).toContain(
      "External content blocked (2 images)",
    );
    expect(indicator().textContent).toBe("3 tracking pixels blocked");
    expect(container.textContent).not.toContain("(2 images, tracking pixels)");
  });

  it("uses the singular for one pixel and drops the sentence when only pixels were blocked", () => {
    render(report(THREE_PIXELS.slice(0, 1), []));

    expect(indicator().textContent).toBe("1 tracking pixel blocked");
    expect(container.textContent).not.toContain("External content blocked");
  });

  it("translates the count with European Portuguese plural forms", () => {
    render(report(THREE_PIXELS), "pt");
    expect(indicator().textContent).toBe("3 píxeis de rastreio bloqueados");

    render(report(THREE_PIXELS.slice(0, 1)), "pt");
    expect(indicator().textContent).toBe("1 píxel de rastreio bloqueado");
  });

  it("lists each pixel domain once with its count without loading anything", () => {
    render(report(THREE_PIXELS));

    expect(domain_rows()).toEqual([]);
    act(() => {
      indicator().click();
    });

    expect(domain_rows()).toEqual([
      "open.mailmetrics.examplex2",
      "t.beacon.example",
    ]);
    expect(document.body.textContent).toContain("Tracking pixels by domain");
    const list = document.querySelector(
      "[data-testid='tracking-pixel-domains']",
    )!;

    expect(list.querySelectorAll("img, a, iframe, link, source")).toHaveLength(
      0,
    );
    expect(document.body.innerHTML).not.toContain("/o/1.gif");
    expect(fetch_spy).not.toHaveBeenCalled();
  });

  it("expands the mobile banner into the same domain list", () => {
    render(report(THREE_PIXELS), "en", true);

    expect(container.textContent).toContain(
      "External content blocked (2 images)",
    );
    expect(indicator().getAttribute("aria-expanded")).toBe("false");
    expect(domain_rows()).toEqual([]);

    act(() => {
      indicator().click();
    });

    expect(indicator().getAttribute("aria-expanded")).toBe("true");
    expect(domain_rows()).toEqual([
      "open.mailmetrics.examplex2",
      "t.beacon.example",
    ]);
    expect(fetch_spy).not.toHaveBeenCalled();
  });
});
