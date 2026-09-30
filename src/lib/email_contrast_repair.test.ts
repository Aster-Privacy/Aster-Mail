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

import { contrast_ratio, hex_to_hsl } from "@/lib/email_ink";
import {
  BORDER_MIN_CONTRAST,
  LINK_HOVER_VAR,
  LINK_VISITED_VAR,
  composite_over,
  contrast_threshold_for,
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
  const resolve = (element: Element): fake_style_input => {
    const own = (element as HTMLElement).dataset ?? {};
    const inherited = (): string | undefined => {
      let node: Element | null = element;

      while (node) {
        const value = (node as HTMLElement).dataset?.color;

        if (value) return value;
        node = node.parentElement;
      }

      return defaults.color;
    };

    return {
      color: own.color ?? inherited(),
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
