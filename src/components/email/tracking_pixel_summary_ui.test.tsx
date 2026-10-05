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
  "https://open.mailmetrics.example/o/1.gif?uid=reader-7f3a91&list=weekly",
  "https://t.beacon.example/open?id=9&email=reader%40mail.example",
  "https://open.mailmetrics.example/o/2.gif?uid=reader-7f3a91",
];

const PIXEL_URL_FRAGMENTS = [
  "/o/1.gif",
  "/open",
  "uid=",
  "reader-7f3a91",
  "reader%40mail.example",
  "https://",
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

function render(node: React.ReactNode, language: LanguageCode = "en") {
  act(() => {
    root.render(
      <I18nProvider default_language={language}>{node}</I18nProvider>,
    );
  });
}

function domain_rows(): [string, string][] {
  return Array.from(
    document.querySelectorAll(
      "[data-testid='tracking-pixel-domains'] [data-domain]",
    ),
  ).map((row) => [
    row.getAttribute("data-domain") ?? "",
    row.querySelector("[data-testid='tracking-pixel-domain-count']")
      ?.textContent ?? "",
  ]);
}

function domain_row_names(): string[] {
  return Array.from(
    document.querySelectorAll(
      "[data-testid='tracking-pixel-domains'] [data-domain]",
    ),
  ).map((row) => row.textContent ?? "");
}

function list_is_inert() {
  const list = document.querySelector(
    "[data-testid='tracking-pixel-domains']",
  )!;

  expect(
    list.querySelectorAll(
      "img, a, iframe, link, source, svg image, [href], [src], [role='link']",
    ),
  ).toHaveLength(0);
  for (const fragment of PIXEL_URL_FRAGMENTS) {
    expect(document.body.innerHTML).not.toContain(fragment);
  }
  expect(fetch_spy).not.toHaveBeenCalled();
}

function press(target: Element) {
  const init = { bubbles: true, cancelable: true, button: 0 };

  act(() => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", { ...init, pointerType: "mouse" }),
    );
    target.dispatchEvent(new MouseEvent("mousedown", init));
    target.dispatchEvent(
      new PointerEvent("pointerup", { ...init, pointerType: "mouse" }),
    );
    target.dispatchEvent(new MouseEvent("mouseup", init));
    target.dispatchEvent(new MouseEvent("click", init));
  });
}

function press_escape() {
  const target = document.activeElement ?? document.body;

  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function wait_until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

function tracker_dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[role='dialog']");
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
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
});

describe("subject tracking protection shield", () => {
  function shield(): HTMLButtonElement {
    render(<TrackingProtectionShield report={report(THREE_PIXELS)} />);

    return container.querySelector("button")!;
  }

  it("opens the tracker list from the count with each hostname once and its count", async () => {
    const trigger = shield();

    expect(trigger.textContent).toBe("3");
    expect(trigger.getAttribute("aria-label")).toBe(
      "Tracking Protection: 3 blocked",
    );
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(domain_rows()).toEqual([]);

    press(trigger);
    await settle();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const dialog = tracker_dialog()!;
    const title = document.getElementById(
      dialog.getAttribute("aria-labelledby") ?? "",
    );

    expect(title?.textContent).toBe("Tracking Protection");
    expect(domain_rows()).toEqual([
      ["open.mailmetrics.example", "x2"],
      ["t.beacon.example", "x1"],
    ]);
    expect(domain_row_names()).toEqual([
      "open.mailmetrics.examplex22 tracking pixels",
      "t.beacon.examplex11 tracking pixel",
    ]);
    list_is_inert();
  });

  it("closes the tracker list on Escape", async () => {
    const trigger = shield();

    press(trigger);
    await settle();
    expect(tracker_dialog()).not.toBeNull();

    press_escape();
    await settle();

    expect(tracker_dialog()).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the tracker list on a press outside it", async () => {
    const outside = document.createElement("button");

    document.body.appendChild(outside);
    const trigger = shield();

    press(trigger);
    await settle();
    expect(tracker_dialog()).not.toBeNull();

    press(outside);
    await settle();

    expect(tracker_dialog()).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("has no message highlight status in the list", async () => {
    press(shield());
    await settle();

    expect(
      document.querySelector("[data-testid='tracking-pixel-highlight-note']"),
    ).toBeNull();
    expect(document.body.textContent).not.toContain("Highlighted");
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

  async function open_sheet() {
    act(() => {
      indicator().click();
    });
    await settle();
    expect(tracker_dialog()).not.toBeNull();
  }

  it("counts tracking pixels apart from blocked images", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);

    expect(container.textContent).toContain(
      "External content blocked (2 images)",
    );
    expect(indicator().textContent).toBe("3 tracking pixels");
  });

  it("uses the singular for one pixel and drops the sentence when only pixels were blocked", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS.slice(0, 1), [])} />);

    expect(indicator().textContent).toBe("1 tracking pixel");
    expect(container.textContent).not.toContain("External content blocked");
  });

  it("translates the count with European Portuguese plural forms", () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />, "pt");
    expect(indicator().textContent).toBe("3 píxeis de rastreio");

    render(<MobileBanner blocked={report(THREE_PIXELS.slice(0, 1))} />, "pt");
    expect(indicator().textContent).toBe("1 píxel de rastreio");
  });

  it("opens the tracker list in a sheet from the count", async () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);

    expect(indicator().getAttribute("aria-haspopup")).toBe("dialog");
    expect(indicator().getAttribute("aria-expanded")).toBe("false");
    expect(domain_rows()).toEqual([]);

    await open_sheet();

    expect(indicator().getAttribute("aria-expanded")).toBe("true");
    expect(tracker_dialog()!.getAttribute("aria-label")).toBe(
      "Tracking Protection",
    );
    expect(domain_rows()).toEqual([
      ["open.mailmetrics.example", "x2"],
      ["t.beacon.example", "x1"],
    ]);
    list_is_inert();
  });

  it("closes the sheet on Escape", async () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);
    await open_sheet();

    press_escape();
    await wait_until(() => tracker_dialog() === null);

    expect(tracker_dialog()).toBeNull();
    expect(indicator().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the sheet on a press outside it", async () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);
    await open_sheet();

    const backdrop = tracker_dialog()!.previousElementSibling!;

    press(backdrop);
    await wait_until(() => tracker_dialog() === null);

    expect(tracker_dialog()).toBeNull();
    expect(indicator().getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the sheet from its close button", async () => {
    render(<MobileBanner blocked={report(THREE_PIXELS)} />);
    await open_sheet();

    const close = Array.from(
      tracker_dialog()!.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Close")!;

    act(() => close.click());
    await wait_until(() => tracker_dialog() === null);

    expect(tracker_dialog()).toBeNull();
  });
});
