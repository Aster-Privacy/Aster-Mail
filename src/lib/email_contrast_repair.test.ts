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
import { describe, it, expect } from "vitest";

import {
  contrast_ratio,
  hex_to_hsl,
  relative_luminance,
} from "@/lib/email_ink";
import {
  BORDER_MIN_CONTRAST,
  HIDDEN_LINK_ALPHA,
  LINK_HOVER_VAR,
  LINK_INK_ATTRIBUTE,
  LINK_INK_HOVER_VAR,
  LINK_INK_LAYER,
  LINK_INK_LAYER_ATTRIBUTE,
  LINK_INK_LAYER_CSS,
  LINK_INK_VAR,
  LINK_INK_VISITED_VAR,
  LINK_VISITED_VAR,
  MEASURING_ATTRIBUTE,
  composite_over,
  contrast_threshold_for,
  is_neutral_ink,
  parse_css_color,
  repair_email_contrast,
  rgba_to_hex,
} from "@/lib/email_contrast_repair";

const THEME_SURFACES = ["#121212", "#0b1120", "#1a1625", "#141d14", "#ffffff"];

interface fake_style_input {
  color?: string;
  background_color?: string;
  background_image?: string;
  font_size?: string;
  font_weight?: string;
  border_style?: string;
  border_width?: string;
  border_color?: string;
}

function build_document(): Document {
  return document.implementation.createHTMLDocument("test");
}

function fake_view(defaults: fake_style_input = {}): Window {
  const color_of = (element: Element | null): string | undefined => {
    if (!element) return defaults.color;

    const node = element as HTMLElement;
    const in_layer =
      node.hasAttribute?.(LINK_INK_ATTRIBUTE) &&
      !!node.ownerDocument.head?.querySelector(
        `style[${LINK_INK_LAYER_ATTRIBUTE}]`,
      );

    if (node.dataset?.hovercolor && !node.hasAttribute(MEASURING_ATTRIBUTE)) {
      return in_layer
        ? node.style.getPropertyValue(LINK_INK_HOVER_VAR)
        : node.dataset.hovercolor;
    }

    if (in_layer) return node.style.getPropertyValue(LINK_INK_VAR);

    const inline = node.style?.getPropertyValue("color") || undefined;
    const inline_important =
      node.style?.getPropertyPriority("color") === "important";

    if (node.dataset?.colorimportant !== undefined && !inline_important) {
      return node.dataset.color ?? color_of(node.parentElement);
    }

    return inline ?? node.dataset?.color ?? color_of(node.parentElement);
  };

  const resolve = (element: Element): fake_style_input => {
    const own = (element as HTMLElement).dataset ?? {};

    return {
      color: color_of(element),
      background_color: own.bg ?? "rgba(0, 0, 0, 0)",
      background_image: own.bgimage ?? "none",
      font_size: own.size ?? defaults.font_size ?? "16px",
      font_weight: own.weight ?? defaults.font_weight ?? "400",
      border_style: own.borderstyle ?? "none",
      border_width: own.borderwidth ?? "0px",
      border_color: own.bordercolor ?? "rgba(0, 0, 0, 0)",
    };
  };

  const style_for = (element: Element): CSSStyleDeclaration => {
    const resolved = resolve(element);
    const map: Record<string, string> = {
      color: resolved.color ?? "rgb(0, 0, 0)",
      "background-color": resolved.background_color ?? "rgba(0, 0, 0, 0)",
      "background-image": resolved.background_image ?? "none",
      "font-size": resolved.font_size ?? "16px",
      "font-weight": resolved.font_weight ?? "400",
    };

    for (const side of ["top", "right", "bottom", "left"]) {
      map[`border-${side}-style`] = resolved.border_style ?? "none";
      map[`border-${side}-width`] = resolved.border_width ?? "0px";
      map[`border-${side}-color`] = resolved.border_color ?? "rgba(0, 0, 0, 0)";
    }

    return {
      getPropertyValue: (name: string) => map[name] ?? "",
    } as unknown as CSSStyleDeclaration;
  };

  return {
    getComputedStyle: (element: Element) => style_for(element),
  } as unknown as Window;
}

describe("parse_css_color", () => {
  it("parses the shapes a computed style can return", () => {
    expect(parse_css_color("#abc")).toEqual({
      r: 170,
      g: 187,
      b: 204,
      a: 1,
    });
    expect(parse_css_color("rgb(255, 0, 0)")).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
    expect(parse_css_color("rgba(0, 0, 0, 0)")?.a).toBe(0);
    expect(parse_css_color("rgb(255 0 0 / 0.5)")?.a).toBe(0.5);
    expect(parse_css_color("hsl(240, 100%, 50%)")).toEqual({
      r: 0,
      g: 0,
      b: 255,
      a: 1,
    });
    expect(parse_css_color("white")).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
    expect(parse_css_color("color(display-p3 1 0 0)")).toBeNull();
  });

  it("parses the srgb color() form computed styles give color-mix()", () => {
    const card = parse_css_color("color(srgb 0.121706 0.121706 0.121706)");

    expect(card && rgba_to_hex(card)).toBe("#1f1f1f");
    expect(card?.a).toBe(1);
    expect(parse_css_color("color(srgb 1 0 0 / 0.5)")?.a).toBe(0.5);
    expect(parse_css_color("color(srgb 1 none 0)")).toBeNull();
    expect(parse_css_color("color(srgb 1 1 1 / none)")).toBeNull();
  });

  it("rejects a huge malformed srgb value in linear time", () => {
    const hostile = `color(srgb${" ".repeat(200000)}x`;
    const started = performance.now();

    expect(parse_css_color(hostile)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("composites alpha over a backdrop", () => {
    const over = composite_over(
      { r: 255, g: 255, b: 255, a: 0.5 },
      { r: 0, g: 0, b: 0, a: 1 },
    );

    expect(rgba_to_hex(over)).toBe("#808080");
  });
});

describe("contrast_threshold_for", () => {
  it("uses the large-text threshold only for large or large-bold text", () => {
    expect(contrast_threshold_for(16, 400)).toBe(4.5);
    expect(contrast_threshold_for(24, 400)).toBe(3);
    expect(contrast_threshold_for(19, 700)).toBe(3);
    expect(contrast_threshold_for(19, 400)).toBe(4.5);
  });
});

describe("repair_email_contrast", () => {
  it("leaves an already compliant color byte-identical", () => {
    for (const surface of THEME_SURFACES) {
      const doc = build_document();

      doc.body.innerHTML =
        '<p data-color="rgb(229, 229, 229)" id="ok">readable</p>';

      const compliant =
        contrast_ratio("#e5e5e5", surface) >= 4.5
          ? "rgb(229, 229, 229)"
          : "rgb(17, 24, 39)";

      doc.body.innerHTML = `<p data-color="${compliant}" id="ok">readable</p>`;

      const target = doc.getElementById("ok")!;
      const before = target.getAttribute("style");
      const stats = repair_email_contrast(doc, {
        surface,
        view: fake_view(),
      });

      expect(target.getAttribute("style")).toBe(before);
      expect(stats.text_repaired).toBe(0);
    }
  });

  it("repairs a failing color by lightness only", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<h1 data-color="rgb(11, 61, 145)" data-size="14px" id="brand">Brand</h1>';

    const target = doc.getElementById("brand")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const repaired = target.style.getPropertyValue("color");

    expect(repaired).not.toBe("");
    expect(target.style.getPropertyPriority("color")).toBe("important");

    const source_hsl = hex_to_hsl("#0b3d91");
    const repaired_hsl = hex_to_hsl(repaired);

    expect(Math.abs(repaired_hsl.h - source_hsl.h)).toBeLessThan(1);
    expect(Math.abs(repaired_hsl.s - source_hsl.s)).toBeLessThan(0.02);
    expect(repaired_hsl.l).toBeGreaterThan(source_hsl.l);
    expect(contrast_ratio(repaired, "#121212")).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the large-text threshold for a big heading", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<h1 data-color="rgb(11, 61, 145)" data-size="32px" id="big">Brand</h1>';

    const target = doc.getElementById("big")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const repaired = target.style.getPropertyValue("color");

    expect(contrast_ratio(repaired, "#121212")).toBeGreaterThanOrEqual(3);
    expect(contrast_ratio(repaired, "#121212")).toBeLessThan(4.5);
  });

  it("resolves the background of a nested colored container", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-bg="rgb(255, 244, 204)" id="callout">' +
      '<span data-color="rgb(255, 255, 255)" id="warn">warning</span>' +
      "</div>";

    const warn = doc.getElementById("warn")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const repaired = warn.style.getPropertyValue("color");

    expect(repaired).not.toBe("");
    expect(contrast_ratio(repaired, "#fff4cc")).toBeGreaterThanOrEqual(4.5);
  });

  it("composites a translucent container over its parent", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-bg="rgb(0, 0, 0)" id="outer">' +
      '<div data-bg="rgba(255, 255, 255, 0.5)" id="inner">' +
      '<span data-color="rgb(200, 200, 200)" id="text">hi</span>' +
      "</div></div>";

    const text = doc.getElementById("text")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const repaired = text.style.getPropertyValue("color");

    expect(contrast_ratio(repaired, "#808080")).toBeGreaterThanOrEqual(4.5);
  });

  it("repairs an inheriting element that has no explicit color", () => {
    const doc = build_document();

    doc.body.innerHTML = '<div><p id="inherit">inherited body ink</p></div>';

    const target = doc.getElementById("inherit")!;

    repair_email_contrast(doc, {
      surface: "#121212",
      view: fake_view({ color: "rgb(51, 51, 51)" }),
    });

    const repaired = target.style.getPropertyValue("color");

    expect(repaired).not.toBe("");
    expect(contrast_ratio(repaired, "#121212")).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to the app surface when a background image blocks resolution", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-bgimage="linear-gradient(red, blue)" id="hero">' +
      '<span data-color="rgb(20, 20, 20)" id="hero_text">hi</span>' +
      "</div>";

    const target = doc.getElementById("hero_text")!;

    repair_email_contrast(doc, { surface: "#0b1120", view: fake_view() });

    const repaired = target.style.getPropertyValue("color");

    expect(contrast_ratio(repaired, "#0b1120")).toBeGreaterThanOrEqual(4.5);
  });

  it("repairs a link and derives its hover and visited inks", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://example.test" data-color="rgb(0, 0, 139)" id="link">Open</a>';

    const link = doc.getElementById("link")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const ink = link.style.getPropertyValue("color");
    const hover = link.style.getPropertyValue(LINK_HOVER_VAR);
    const visited = link.style.getPropertyValue(LINK_VISITED_VAR);

    expect(contrast_ratio(ink, "#121212")).toBeGreaterThanOrEqual(4.5);
    expect(link.style.getPropertyPriority("color")).toBe("");
    expect(hover).not.toBe("");
    expect(hover).not.toBe(ink);
    expect(contrast_ratio(hover, "#121212")).toBeGreaterThanOrEqual(4.5);
    expect(visited).not.toBe("");
    expect(visited).not.toBe(ink);
    expect(contrast_ratio(visited, "#121212")).toBeGreaterThanOrEqual(4.5);

    const ink_hsl = hex_to_hsl(ink);
    const hover_hsl = hex_to_hsl(hover);

    expect(Math.abs(hover_hsl.h - ink_hsl.h)).toBeLessThan(1);
  });

  it("gives a compliant link a hover without touching its color", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://example.test" data-color="rgb(96, 165, 250)" id="link">Open</a>';

    const link = doc.getElementById("link")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    expect(link.style.getPropertyValue("color")).toBe("");
    expect(link.style.getPropertyValue(LINK_HOVER_VAR)).not.toBe("");
    expect(link.style.getPropertyValue(LINK_VISITED_VAR)).not.toBe("");
  });

  it("leaves a background-styled button link alone", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://example.test" data-bg="rgb(59, 90, 232)" data-color="rgb(255, 255, 255)" id="cta">Go</a>';

    const cta = doc.getElementById("cta")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    expect(cta.getAttribute("style")).toBeNull();
  });

  it("lifts an invisible border without touching backgrounds", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div id="rule" data-borderstyle="solid" data-borderwidth="1px" data-bordercolor="rgb(20, 20, 20)"></div>';

    const rule = doc.getElementById("rule")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const border = rule.style.getPropertyValue("border-color");

    expect(border).not.toBe("");
    expect(contrast_ratio(border, "#121212")).toBeGreaterThanOrEqual(
      BORDER_MIN_CONTRAST,
    );
    expect(rule.style.getPropertyValue("background-color")).toBe("");
    expect(rule.style.getPropertyValue("background-image")).toBe("");
  });

  it("keeps a visible border byte-identical", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div id="rule" data-borderstyle="solid" data-borderwidth="1px" data-bordercolor="rgb(120, 120, 120)"></div>';

    const rule = doc.getElementById("rule")!;

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    expect(rule.getAttribute("style")).toBeNull();
  });

  it("bails out above the element limit", () => {
    const doc = build_document();

    doc.body.innerHTML = '<p data-color="rgb(20, 20, 20)" id="p">hi</p>';

    const stats = repair_email_contrast(doc, {
      surface: "#121212",
      view: fake_view(),
      max_elements: 1,
    });

    expect(stats.skipped_over_limit).toBe(true);
    expect(doc.getElementById("p")!.getAttribute("style")).toBeNull();
  });

  it("keeps a link readable on every theme surface", () => {
    for (const surface of THEME_SURFACES) {
      const doc = build_document();

      doc.body.innerHTML =
        '<a href="https://example.test" data-color="rgb(26, 13, 171)" id="link">Open</a>';

      const link = doc.getElementById("link")!;

      repair_email_contrast(doc, { surface, view: fake_view() });

      const ink = link.style.getPropertyValue("color") || "#1a0dab";
      const hover = link.style.getPropertyValue(LINK_HOVER_VAR);
      const visited = link.style.getPropertyValue(LINK_VISITED_VAR);

      expect(contrast_ratio(ink, surface)).toBeGreaterThanOrEqual(4.4);
      expect(contrast_ratio(hover, surface)).toBeGreaterThanOrEqual(4.4);
      expect(contrast_ratio(visited, surface)).toBeGreaterThanOrEqual(4.4);
      expect(visited).not.toBe(ink);
    }
  });

  it("writes only ink properties across a full auto dark document", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<h1 data-color="rgb(11, 61, 145)" data-size="28px" id="head">Brand</h1>' +
      '<p data-color="rgb(197, 48, 48)" id="warn">Payment failed</p>' +
      '<p data-color="rgb(21, 128, 61)" id="ok">Payment received</p>' +
      '<div data-bg="rgb(255, 244, 204)" id="callout">' +
      '<span data-color="rgb(120, 53, 15)" id="callout_text">heads up</span>' +
      "</div>" +
      '<table><tr><td data-color="rgb(51, 51, 51)" id="cell">cell</td></tr></table>' +
      '<a href="https://example.test" data-color="rgb(26, 13, 171)" id="link">Open</a>' +
      '<div id="rule" data-borderstyle="solid" data-borderwidth="1px" data-bordercolor="rgb(20, 20, 20)"></div>';

    const structure_before = doc.body.innerHTML;
    const allowed = new Set([
      "color",
      "border-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      LINK_HOVER_VAR,
      LINK_VISITED_VAR,
      LINK_INK_VAR,
      LINK_INK_HOVER_VAR,
      LINK_INK_VISITED_VAR,
      "transition",
    ]);

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    const written = new Set<string>();

    doc.querySelectorAll<HTMLElement>("body, body *").forEach((element) => {
      for (let index = 0; index < element.style.length; index += 1) {
        written.add(element.style.item(index));
      }
    });

    expect(written.size).toBeGreaterThan(0);
    for (const property of written) expect(allowed.has(property)).toBe(true);

    const stripped = doc.body.cloneNode(true) as HTMLElement;

    stripped
      .querySelectorAll("[style]")
      .forEach((element) => element.removeAttribute("style"));
    stripped
      .querySelectorAll(`[${LINK_INK_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(LINK_INK_ATTRIBUTE));

    expect(stripped.innerHTML).toBe(structure_before);
  });

  it("repairs the colors an author actually ships without touching the passing ones", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgb(51, 51, 51)" id="body_ink">body</p>' +
      '<p data-color="rgb(197, 48, 48)" id="danger">danger</p>' +
      '<p data-color="rgb(21, 128, 61)" id="success">success</p>' +
      '<p data-color="rgb(11, 61, 145)" id="brand">brand</p>' +
      '<p data-color="rgb(212, 212, 212)" id="passes">passes</p>';

    repair_email_contrast(doc, { surface: "#121212", view: fake_view() });

    for (const id of ["body_ink", "danger", "success", "brand"]) {
      const element = doc.getElementById(id)!;
      const repaired = element.style.getPropertyValue("color");

      expect(contrast_ratio(repaired, "#121212")).toBeGreaterThanOrEqual(4.5);
    }

    expect(doc.getElementById("passes")!.getAttribute("style")).toBeNull();

    const danger_hsl = hex_to_hsl(
      doc.getElementById("danger")!.style.getPropertyValue("color"),
    );
    const success_hsl = hex_to_hsl(
      doc.getElementById("success")!.style.getPropertyValue("color"),
    );

    expect(Math.abs(danger_hsl.h - hex_to_hsl("#c53030").h)).toBeLessThan(1);
    expect(Math.abs(danger_hsl.s - hex_to_hsl("#c53030").s)).toBeLessThan(0.02);
    expect(Math.abs(success_hsl.h - hex_to_hsl("#15803d").h)).toBeLessThan(1);
    expect(Math.abs(success_hsl.s - hex_to_hsl("#15803d").s)).toBeLessThan(
      0.02,
    );
  });

  it("repairs against every theme surface", () => {
    for (const surface of THEME_SURFACES) {
      const doc = build_document();

      doc.body.innerHTML =
        '<p data-color="rgb(128, 128, 128)" id="mid">mid grey</p>';

      const target = doc.getElementById("mid")!;

      repair_email_contrast(doc, { surface, view: fake_view() });

      const repaired = target.style.getPropertyValue("color") || "#808080";

      expect(contrast_ratio(repaired, surface)).toBeGreaterThanOrEqual(4.4);
    }
  });
});

describe("repair_email_contrast in dark mode newsletters", () => {
  const CARD = "#1f1f1f";
  const THEME_INK = "#f5f5f5";

  function is_grey(hex: string): boolean {
    const parsed = parse_css_color(hex)!;

    return parsed.r === parsed.g && parsed.g === parsed.b;
  }

  it("reads black with a colour cast as neutral text, not as a brand colour", () => {
    expect(hex_to_hsl("#222000").s).toBeCloseTo(1, 6);
    expect(is_neutral_ink("#222000")).toBe(true);
    expect(is_neutral_ink("#1e293b")).toBe(true);
    expect(is_neutral_ink("#666666")).toBe(true);
    expect(is_neutral_ink("#000033")).toBe(true);
    expect(is_neutral_ink("#330000")).toBe(true);
    expect(is_neutral_ink("#0f766e")).toBe(false);
    expect(is_neutral_ink("#134e4a")).toBe(false);
    expect(is_neutral_ink("#0b3d91")).toBe(false);
    expect(is_neutral_ink("#000080")).toBe(false);
    expect(is_neutral_ink("#e4111c")).toBe(false);
    expect(is_neutral_ink("#e89c00")).toBe(false);
  });

  it("turns near black olive body text into light neutral text", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgb(34, 32, 0)" id="body">Council approves the bridge</p>';

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const repaired = doc
      .getElementById("body")!
      .style.getPropertyValue("color");

    expect(is_grey(repaired)).toBe(true);
    expect(repaired).toBe(THEME_INK);
    expect(contrast_ratio(repaired, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the order of a grey hierarchy instead of flattening it", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgb(34, 34, 34)" id="primary">headline</p>' +
      '<p data-color="rgb(85, 85, 85)" id="secondary">standfirst</p>' +
      '<p data-color="rgb(102, 102, 102)" id="caption">caption</p>';

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const [primary, secondary, caption] = [
      "primary",
      "secondary",
      "caption",
    ].map((id) => doc.getElementById(id)!.style.getPropertyValue("color"));

    for (const ink of [primary, secondary, caption]) {
      expect(contrast_ratio(ink, CARD)).toBeGreaterThanOrEqual(4.5);
    }
    expect(relative_luminance(primary)).toBeGreaterThan(
      relative_luminance(secondary),
    );
    expect(relative_luminance(secondary)).toBeGreaterThan(
      relative_luminance(caption),
    );
  });

  it("keeps translucent greys in the order they had on the light page", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgba(0, 0, 0, 0.87)" id="primary">title</p>' +
      '<p data-color="rgba(0, 0, 0, 0.54)" id="secondary">summary</p>' +
      '<p data-color="rgba(0, 0, 0, 0.38)" id="hint">hint</p>';

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const [primary, secondary, hint] = ["primary", "secondary", "hint"].map(
      (id) => doc.getElementById(id)!.style.getPropertyValue("color"),
    );

    for (const ink of [primary, secondary, hint]) {
      expect(contrast_ratio(ink, CARD)).toBeGreaterThanOrEqual(4.5);
    }
    expect(relative_luminance(primary)).toBeGreaterThan(
      relative_luminance(secondary),
    );
    expect(relative_luminance(secondary)).toBeGreaterThanOrEqual(
      relative_luminance(hint),
    );
  });

  it("treats a faint tint over the canvas as the canvas", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<blockquote data-bg="rgba(0, 0, 0, 0.04)">' +
      '<p data-color="rgb(51, 51, 51)" id="quoted">quoted reply</p>' +
      "</blockquote>";

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const repaired = doc
      .getElementById("quoted")!
      .style.getPropertyValue("color");

    expect(contrast_ratio(repaired, CARD)).toBeGreaterThan(10);
  });

  it("still lightens a red brand colour along its own hue", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgb(214, 32, 39)" id="kicker">OPINION</p>';

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const repaired = doc
      .getElementById("kicker")!
      .style.getPropertyValue("color");

    expect(contrast_ratio(repaired, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(
      Math.abs(hex_to_hsl(repaired).h - hex_to_hsl("#d62027").h),
    ).toBeLessThan(1);
    expect(
      Math.abs(hex_to_hsl(repaired).s - hex_to_hsl("#d62027").s),
    ).toBeLessThan(0.02);
  });

  it("lands a headline link repair that an important author rule overrides", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-color="rgb(34, 32, 0)">' +
      '<a href="https://news.example/bridge" data-colorimportant="" id="headline">Council approves the bridge</a>' +
      "</div>";

    const view = fake_view();
    const headline = doc.getElementById("headline")!;

    repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view });

    const painted = view.getComputedStyle(headline).getPropertyValue("color");

    expect(headline.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(true);
    expect(headline.style.getPropertyPriority("color")).toBe("");
    expect(contrast_ratio(painted, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the hover and visited inks of a link it insists on", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-color="rgb(34, 32, 0)">' +
      '<a href="https://news.example/bridge" data-colorimportant="" id="headline">Council approves the bridge</a>' +
      "</div>";

    const headline = doc.getElementById("headline")!;

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const layer = doc.head.firstElementChild!;
    const css = layer.textContent ?? "";
    const link = `a[${LINK_INK_ATTRIBUTE}]`;

    expect(layer.tagName).toBe("STYLE");
    expect(layer.hasAttribute(LINK_INK_LAYER_ATTRIBUTE)).toBe(true);
    expect(css).toMatch(/^@layer [\w-]+ \{/);
    expect(css).toContain(
      `${link} { color: var(${LINK_INK_VAR}) !important; transition: none !important; }`,
    );
    expect(css).toContain(
      `${link}:visited { color: var(${LINK_INK_VISITED_VAR}, var(${LINK_INK_VAR})) !important; }`,
    );
    expect(css).toContain(
      `${link}:hover { color: var(${LINK_INK_HOVER_VAR}, var(${LINK_INK_VAR})) !important; }`,
    );
    expect(headline.style.getPropertyValue(LINK_INK_VAR)).toBe(THEME_INK);
    expect(headline.style.getPropertyPriority(LINK_INK_VAR)).toBe("important");
    expect(headline.style.getPropertyValue(LINK_HOVER_VAR)).not.toBe("");
    expect(headline.style.getPropertyValue(LINK_VISITED_VAR)).not.toBe("");
    expect(headline.style.getPropertyValue(LINK_INK_HOVER_VAR)).toBe(
      headline.style.getPropertyValue(LINK_HOVER_VAR),
    );
    expect(headline.style.getPropertyPriority(LINK_INK_HOVER_VAR)).toBe(
      "important",
    );
    expect(headline.style.getPropertyValue(LINK_INK_VISITED_VAR)).toBe(
      headline.style.getPropertyValue(LINK_VISITED_VAR),
    );
    expect(headline.style.getPropertyPriority(LINK_INK_VISITED_VAR)).toBe(
      "important",
    );
    expect(headline.style.getPropertyPriority("color")).toBe("");
  });

  it("gives the link ink layer a name an email cannot guess", () => {
    expect(LINK_INK_LAYER_CSS).toMatch(/^@layer aster-ink-[a-z0-9]{4,} \{/);
  });

  it("gives the properties the layer reads the layer's random suffix", () => {
    const suffix = LINK_INK_LAYER.slice("aster-ink-".length);
    const read = LINK_INK_LAYER_CSS.match(/var\(--[\w-]+/g) ?? [];

    expect(LINK_INK_LAYER).toMatch(/^aster-ink-[a-z0-9]{4,}$/);
    expect(LINK_INK_LAYER_CSS.startsWith(`@layer ${LINK_INK_LAYER} {`)).toBe(
      true,
    );
    expect([LINK_INK_VAR, LINK_INK_HOVER_VAR, LINK_INK_VISITED_VAR]).toEqual([
      `--aster-link-ink-${suffix}`,
      `--aster-link-hover-${suffix}`,
      `--aster-link-visited-${suffix}`,
    ]);
    expect(read.length).toBeGreaterThan(0);
    for (const reference of read) {
      expect([
        LINK_INK_VAR,
        LINK_INK_HOVER_VAR,
        LINK_INK_VISITED_VAR,
      ]).toContain(reference.slice("var(".length));
    }
  });

  it("never asks the animation API, whose cost grows with every animation", () => {
    const prototypes = [HTMLElement.prototype, Document.prototype];
    const saved = prototypes.map((prototype) =>
      Object.getOwnPropertyDescriptor(prototype, "getAnimations"),
    );
    let calls = 0;

    for (const prototype of prototypes) {
      Object.defineProperty(prototype, "getAnimations", {
        configurable: true,
        value: () => {
          calls += 1;
          throw new Error("the repair must not ask for animations");
        },
      });
    }

    try {
      const doc = build_document();

      doc.body.innerHTML =
        '<div data-color="rgb(34, 32, 0)">' +
        '<a href="https://news.example/a" data-colorimportant="" id="headline">Headline</a>' +
        "</div>" +
        '<a href="https://news.example/b" data-color="rgb(34, 34, 34)" id="plain">Plain link</a>';

      expect(() =>
        repair_email_contrast(doc, {
          surface: CARD,
          ink: THEME_INK,
          view: fake_view(),
        }),
      ).not.toThrow();
      expect(calls).toBe(0);
      expect(
        doc.getElementById("headline")!.hasAttribute(LINK_INK_ATTRIBUTE),
      ).toBe(true);
      expect(
        doc.getElementById("plain")!.hasAttribute(LINK_INK_ATTRIBUTE),
      ).toBe(true);
    } finally {
      prototypes.forEach((prototype, index) => {
        const descriptor = saved[index];

        if (descriptor) {
          Object.defineProperty(prototype, "getAnimations", descriptor);
        } else {
          delete (prototype as unknown as Record<string, unknown>)
            .getAnimations;
        }
      });
    }
  });

  it("measures a link under the pointer in its resting ink", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://news.example/under" data-color="rgb(34, 34, 34)" data-hovercolor="rgb(197, 218, 250)" id="under">under the pointer</a>';

    const view = fake_view();
    const under = doc.getElementById("under")!;
    const select_all = doc.querySelectorAll.bind(doc);

    doc.querySelectorAll = ((selector: string) =>
      selector === "a:hover"
        ? [under]
        : select_all(selector)) as typeof doc.querySelectorAll;

    repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view });

    expect(under.hasAttribute(MEASURING_ATTRIBUTE)).toBe(false);
    expect(under.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(true);

    delete under.dataset.hovercolor;

    expect(
      contrast_ratio(
        view.getComputedStyle(under).getPropertyValue("color"),
        CARD,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a link the author hid with a transparent colour hidden", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgb(34, 32, 0)">Visible text</p>' +
      '<a href="https://news.example/trap" data-color="rgba(0, 0, 0, 0)" data-colorimportant="" id="trap">hidden link</a>';

    const view = fake_view();
    const trap = doc.getElementById("trap")!;

    repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view });

    expect(trap.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(false);
    expect(
      doc.head.querySelector(`style[${LINK_INK_LAYER_ATTRIBUTE}]`),
    ).toBeNull();
    expect(
      parse_css_color(view.getComputedStyle(trap).getPropertyValue("color"))?.a,
    ).toBe(0);
  });

  it("keeps a link hidden with a nearly transparent colour hidden", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<p data-color="rgb(34, 32, 0)">Visible text</p>' +
      '<a href="https://news.example/rule" data-color="rgba(0, 0, 0, 0.05)" data-colorimportant="" id="rule">hidden by a rule</a>' +
      '<a href="https://news.example/inline" style="color: rgba(0, 0, 0, 0.05)" id="inline">hidden inline</a>' +
      '<a href="https://news.example/faint" data-color="rgba(0, 0, 0, 0.38)" id="faint">faint but meant to be read</a>';

    const view = fake_view();

    repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view });

    for (const id of ["rule", "inline"]) {
      const link = doc.getElementById(id)!;
      const painted = parse_css_color(
        view.getComputedStyle(link).getPropertyValue("color"),
      );

      expect(painted?.a).toBeLessThan(HIDDEN_LINK_ALPHA);
      expect(link.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(false);
      expect(link.style.getPropertyValue(LINK_INK_VAR)).toBe("");
    }

    const faint = doc.getElementById("faint")!;

    expect(faint.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(true);
    expect(
      contrast_ratio(
        view.getComputedStyle(faint).getPropertyValue("color"),
        CARD,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("reads each element once and nothing after its first write", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-color="rgb(34, 32, 0)">' +
      '<a href="https://news.example/a" data-colorimportant="" id="headline">Headline</a>' +
      "</div>" +
      '<a href="https://news.example/b" data-color="rgb(34, 34, 34)">Plain link</a>' +
      '<p data-color="rgb(102, 102, 102)">Caption</p>' +
      '<a href="https://news.example/c" data-color="rgb(34, 34, 34)" data-hovercolor="rgb(197, 218, 250)" id="under">Under the pointer</a>';

    const scanned = doc.querySelectorAll("body, body *").length;
    const under = doc.getElementById("under")!;
    const select_all = doc.querySelectorAll.bind(doc);
    const base = fake_view();
    const observer = new MutationObserver(() => {});
    let reads = 0;
    let read_after_write = false;

    doc.querySelectorAll = ((selector: string) =>
      selector === "a:hover"
        ? [under]
        : select_all(selector)) as typeof doc.querySelectorAll;
    observer.observe(doc, { attributes: true, childList: true, subtree: true });

    const view = {
      getComputedStyle: (element: Element) => {
        reads += 1;
        if (
          observer
            .takeRecords()
            .some((record) => record.attributeName !== MEASURING_ATTRIBUTE)
        ) {
          read_after_write = true;
        }

        return base.getComputedStyle(element);
      },
    } as unknown as Window;

    repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view });

    const writes = observer.takeRecords();

    observer.disconnect();

    expect(read_after_write).toBe(false);
    expect(reads).toBe(scanned);
    expect(
      writes.some((record) => record.attributeName === LINK_INK_ATTRIBUTE),
    ).toBe(true);
    expect(
      doc.getElementById("headline")!.hasAttribute(LINK_INK_ATTRIBUTE),
    ).toBe(true);
  });

  it("hands every link it repairs on the canvas to the layer", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-color="rgb(34, 32, 0)">' +
      '<a href="https://news.example/a" data-colorimportant="" id="headline">Headline</a>' +
      "</div>" +
      '<a href="https://news.example/b" data-color="rgb(34, 34, 34)" id="plain">Plain link</a>' +
      '<a href="https://news.example/c" data-color="rgb(214, 32, 39)" id="brand">Brand link</a>' +
      '<a href="https://news.example/d" data-color="rgb(96, 165, 250)" id="readable">Readable link</a>' +
      '<table><tr><td data-bg="rgb(255, 255, 255)">' +
      '<a href="https://news.example/e" data-color="rgb(204, 204, 204)" id="on_card">Link on a white card</a>' +
      "</td></tr></table>" +
      '<a href="https://news.example/f" data-bg="rgb(59, 90, 232)" data-color="rgb(255, 255, 255)" id="button">Button</a>';

    const view = fake_view();

    repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view });

    for (const id of ["headline", "plain", "brand"]) {
      const link = doc.getElementById(id)!;
      const ink = link.style.getPropertyValue("color");

      expect(link.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(true);
      expect(link.style.getPropertyValue(LINK_INK_VAR)).toBe(ink);
      expect(link.style.getPropertyValue(LINK_INK_HOVER_VAR)).toBe(
        link.style.getPropertyValue(LINK_HOVER_VAR),
      );
      expect(link.style.getPropertyValue(LINK_INK_VISITED_VAR)).toBe(
        link.style.getPropertyValue(LINK_VISITED_VAR),
      );
      for (const name of [
        LINK_INK_VAR,
        LINK_INK_HOVER_VAR,
        LINK_INK_VISITED_VAR,
      ]) {
        expect(link.style.getPropertyPriority(name)).toBe("important");
      }
      expect(
        contrast_ratio(
          view.getComputedStyle(link).getPropertyValue("color"),
          CARD,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }

    for (const id of ["readable", "on_card", "button"]) {
      const link = doc.getElementById(id)!;

      expect(link.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(false);
      expect(link.style.getPropertyValue(LINK_INK_VAR)).toBe("");
    }
    expect(
      doc.getElementById("on_card")!.style.getPropertyValue("color"),
    ).not.toBe("");
    expect(
      doc.querySelectorAll(`style[${LINK_INK_LAYER_ATTRIBUTE}]`),
    ).toHaveLength(1);
  });

  it("stops every link it hands to the layer from transitioning", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://news.example/slow" data-color="rgb(34, 34, 34)" style="transition: color 100000s linear !important" id="slow">Slow fade</a>' +
      '<a href="https://news.example/plain" data-color="rgb(34, 34, 34)" id="plain">Plain link</a>';

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    for (const id of ["slow", "plain"]) {
      const link = doc.getElementById(id)!;

      expect(link.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(true);
      expect(link.style.getPropertyValue("transition")).toBe("none");
      expect(link.style.getPropertyPriority("transition")).toBe("important");
    }
  });

  it("takes the measuring mark off even when a read throws", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://news.example/under" data-color="rgb(34, 34, 34)" id="under">under the pointer</a>' +
      '<p data-color="rgb(34, 34, 34)" id="broken">text the frame lost</p>';

    const under = doc.getElementById("under")!;
    const broken = doc.getElementById("broken")!;
    const select_all = doc.querySelectorAll.bind(doc);
    const base = fake_view();
    const view = {
      getComputedStyle: (element: Element) => {
        if (element === broken) throw new Error("the frame went away");

        return base.getComputedStyle(element);
      },
    } as unknown as Window;

    doc.querySelectorAll = ((selector: string) =>
      selector === "a:hover"
        ? [under]
        : select_all(selector)) as typeof doc.querySelectorAll;

    expect(() =>
      repair_email_contrast(doc, { surface: CARD, ink: THEME_INK, view }),
    ).toThrow("the frame went away");
    expect(under.hasAttribute(MEASURING_ATTRIBUTE)).toBe(false);
    expect(under.getAttribute("style")).toBeNull();
  });

  it("writes a link repair as a plain inline colour", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<a href="https://news.example/port" data-color="rgb(220, 52, 36)" id="link">read the report</a>';

    const link = doc.getElementById("link")!;

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    expect(
      contrast_ratio(link.style.getPropertyValue("color"), CARD),
    ).toBeGreaterThanOrEqual(4.5);
    expect(link.style.getPropertyPriority("color")).toBe("");
  });

  it("does not insist on a repair over a button the author painted", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<table><tr><td data-bg="rgb(233, 157, 0)">' +
      '<a href="https://news.example/subscribe" data-color="rgb(255, 255, 255)" data-colorimportant="" id="cta">Subscribe</a>' +
      "</td></tr></table>";

    const cta = doc.getElementById("cta")!;

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    expect(cta.style.getPropertyPriority("color")).toBe("");
    expect(cta.hasAttribute(LINK_INK_ATTRIBUTE)).toBe(false);
  });

  it("keeps grey text on an author background at the plain threshold", () => {
    const doc = build_document();

    doc.body.innerHTML =
      '<div data-bg="rgb(34, 32, 0)">' +
      '<p data-color="rgb(102, 102, 102)" id="band">Most read</p>' +
      "</div>";

    repair_email_contrast(doc, {
      surface: CARD,
      ink: THEME_INK,
      view: fake_view(),
    });

    const repaired = doc
      .getElementById("band")!
      .style.getPropertyValue("color");
    const ratio = contrast_ratio(repaired, "#222000");

    expect(is_grey(repaired)).toBe(true);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(5);
  });
});
