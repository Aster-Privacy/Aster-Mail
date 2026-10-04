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

import { TrackingProtectionShield } from "@/components/email/tracking_protection_shield";
import { MobileExternalContentBanner } from "@/pages/mobile/mobile_detail_banners";
import { I18nProvider, use_i18n } from "@/lib/i18n/context";
import { get_translations_async } from "@/lib/i18n/translations";
import {
  report_tracking_pixel_markers,
  use_tracking_pixels_highlighted,
} from "@/stores/tracking_pixel_highlight_store";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { block_external_content: true } }),
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

function HighlightProbe() {
  return (
    <span data-testid="highlight-probe">
      {use_tracking_pixels_highlighted() ? "on" : "off"}
    </span>
  );
}

function highlight_state(): string | null {
  return document.querySelector("[data-testid='highlight-probe']")!.textContent;
}

function render(node: React.ReactNode, language: LanguageCode = "en") {
  act(() => {
    root.render(
      <I18nProvider default_language={language}>{node}</I18nProvider>,
    );
  });
}

function domain_rows(): string[] {
  return Array.from(
    document.querySelectorAll(
      "[data-testid='tracking-pixel-domains'] [data-domain]",
    ),
  ).map((row) => row.textContent ?? "");
}

function no_remote_loads() {
  const list = document.querySelector(
    "[data-testid='tracking-pixel-domains']",
  )!;

  expect(list.querySelectorAll("img, a, iframe, link, source")).toHaveLength(0);
  expect(document.body.innerHTML).not.toContain("/o/1.gif");
  expect(fetch_spy).not.toHaveBeenCalled();
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

describe("subject tracking protection shield", () => {
  it("lists each tracking pixel domain once with its count", () => {
    render(<TrackingProtectionShield report={report(THREE_PIXELS)} />);

    const trigger = container.querySelector("button")!;

    expect(trigger.textContent).toBe("3");
    expect(domain_rows()).toEqual([]);
    act(() => {
      trigger.click();
    });

    expect(domain_rows()).toEqual([
      "open.mailmetrics.examplex2",
      "t.beacon.example",
    ]);
    no_remote_loads();
  });
});

describe("highlighting pixels in the message body", () => {
  const owner = Symbol("test_markers");

  afterEach(() => {
    act(() => report_tracking_pixel_markers(owner, 0));
  });

  function shield(blocked = report(THREE_PIXELS)) {
    render(
      <>
        <TrackingProtectionShield report={blocked} />
        <HighlightProbe />
      </>,
    );

    return container.querySelector("button")!;
  }

  function status_text(): string | null {
    const status = document.querySelector(
      "[data-testid='tracking-pixel-highlight-note']",
    );

    return status ? status.textContent : null;
  }

  it("is off until the shield is used", () => {
    shield();

    expect(highlight_state()).toBe("off");
  });

  it("highlights while the subject shield is hovered and stops when the pointer leaves", () => {
    const trigger = shield();

    act(() => {
      trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    expect(highlight_state()).toBe("on");
    act(() => {
      trigger.dispatchEvent(
        new PointerEvent("pointerout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });
    expect(highlight_state()).toBe("off");
  });

  it("highlights while the shield has keyboard focus", () => {
    const trigger = shield();
    const matches = trigger.matches.bind(trigger);

    vi.spyOn(trigger, "matches").mockImplementation((selector: string) =>
      selector === ":focus-visible" ? true : matches(selector),
    );
    act(() => trigger.focus());
    expect(highlight_state()).toBe("on");
    act(() => trigger.blur());
    expect(highlight_state()).toBe("off");
  });

  it("keeps the highlight while the popover is open and says how many are marked", () => {
    const trigger = shield();

    act(() => {
      trigger.click();
    });
    expect(highlight_state()).toBe("on");
    const status = document.querySelector(
      "[data-testid='tracking-pixel-highlight-note']",
    )!;

    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("");
    act(() => report_tracking_pixel_markers(owner, 2));
    expect(status_text()).toBe("Highlighted in the message: 2");
  });

  it("opens the popover beside the shield so it leaves the top of the message visible", () => {
    const trigger = shield();

    act(() => {
      trigger.click();
    });

    const content = document.querySelector(
      "[data-radix-popper-content-wrapper] > *",
    )!;

    expect(content.getAttribute("data-side")).toBe("left");
  });

  it("does not highlight from the shield when only links were cleaned", () => {
    const trigger = shield({
      ...report([], []),
      cleaned_links: [
        {
          original_url: "https://shop.example/?utm_source=mail",
          cleaned_url: "https://shop.example/",
          params_removed: ["utm_source"],
        },
      ],
    });

    act(() => {
      trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      trigger.click();
    });
    expect(highlight_state()).toBe("off");
  });

  it("highlights on mobile only while the tracker list is expanded", () => {
    act(() => report_tracking_pixel_markers(owner, 3));
    render(
      <>
        <MobileBanner blocked={report(THREE_PIXELS)} />
        <HighlightProbe />
      </>,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      "[data-testid='tracking-pixel-indicator']",
    )!;

    expect(highlight_state()).toBe("off");
    expect(status_text()).toBeNull();
    act(() => toggle.click());
    expect(highlight_state()).toBe("on");
    expect(status_text()).toBe("Highlighted in the message: 3");
    act(() => toggle.click());
    expect(highlight_state()).toBe("off");
    expect(status_text()).toBeNull();
  });

  it("does not highlight when no tracking pixels were blocked", () => {
    render(
      <>
        <MobileBanner blocked={report([])} />
        <HighlightProbe />
      </>,
    );

    expect(
      container.querySelector("[data-testid='tracking-pixel-indicator']"),
    ).toBeNull();
    expect(highlight_state()).toBe("off");
  });
});

describe("mobile blocked content banner", () => {
  function indicator(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      "[data-testid='tracking-pixel-indicator']",
    );

    if (!button) throw new Error("tracking pixel indicator not found");

    return button;
  }

  it("counts tracking pixels apart from blocked images", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);

    expect(container.textContent).toContain(
      "External content blocked (2 images)",
    );
    expect(indicator().textContent).toBe("3 tracking pixels blocked");
  });

  it("uses the singular for one pixel and drops the sentence when only pixels were blocked", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS.slice(0, 1), [])} />);

    expect(indicator().textContent).toBe("1 tracking pixel blocked");
    expect(container.textContent).not.toContain("External content blocked");
  });

  it("translates the count with European Portuguese plural forms", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />, "pt");
    expect(indicator().textContent).toBe("3 píxeis de rastreio bloqueados");

    render(<MobileBanner blocked={report(THREE_PIXELS.slice(0, 1))} />, "pt");
    expect(indicator().textContent).toBe("1 píxel de rastreio bloqueado");
  });

  it("expands inline into the domain list without loading anything", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);

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
    no_remote_loads();
  });
});
