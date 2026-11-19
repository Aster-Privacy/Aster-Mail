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
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => false,
}));

vi.mock("@/lib/image_proxy", () => ({
  get_image_proxy_url: () => undefined,
}));

import { sanitize_html } from "./html_sanitizer";
import { SECURE_VIEW_SANITIZE_OPTIONS } from "./secure_view_sanitize_options";

import { format_body } from "@/utils/print_email";

const LAYOUT_PROPERTIES = new Set([
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "z-index",
  "transform",
  "width",
  "max-width",
  "height",
  "max-height",
  "overflow",
  "visibility",
  "opacity",
  "float",
]);

const OFF_PAGE_PX = 500;

const SKIPPED_TAGS = new Set(["style", "meta", "link", "title", "head"]);

type Declarations = Map<string, string>;

interface RenderedElement {
  tag: string;
  layout: string;
  hidden: boolean;
  text: string;
}

function read_declarations(element: Element): Declarations {
  const declarations: Declarations = new Map();

  for (const part of (element.getAttribute("style") ?? "").split(";")) {
    const colon = part.indexOf(":");

    if (colon === -1) continue;

    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (property) declarations.set(property, value);
  }

  return declarations;
}

function px_value(value: string | undefined): number | null {
  const match = /^(-?\d*\.?\d+)(px)?$/.exec(
    (value ?? "").replace(/\s*!important$/, ""),
  );

  return match ? parseFloat(match[1]) : null;
}

function offset_px(value: string | undefined): number | null {
  const match = /^(-?\d*\.?\d+)(px|%)?$/.exec(keyword(value));

  if (!match) return null;

  return match[2] === "%" ? parseFloat(match[1]) * 6 : parseFloat(match[1]);
}

function keyword(value: string | undefined): string {
  return (value ?? "").replace(/\s*!important$/, "");
}

function hides_itself(declarations: Declarations): boolean {
  if (keyword(declarations.get("display")) === "none") return true;
  if (keyword(declarations.get("visibility")) === "hidden") return true;
  if (px_value(declarations.get("opacity")) === 0) return true;

  const clips = keyword(declarations.get("overflow")) === "hidden";
  const zero_height =
    px_value(declarations.get("max-height")) === 0 ||
    px_value(declarations.get("height")) === 0;

  if (clips && zero_height) return true;

  const position = keyword(declarations.get("position"));

  if (position === "static" || position === "") return false;

  return ["top", "left", "right", "bottom"].some((side) => {
    const offset = offset_px(declarations.get(side));

    return offset !== null && offset <= -OFF_PAGE_PX;
  });
}

function layout_signature(declarations: Declarations): string {
  return Array.from(declarations.entries())
    .filter(([property]) => LAYOUT_PROPERTIES.has(property))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function render_elements(html: string): RenderedElement[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rendered: RenderedElement[] = [];
  const hidden_elements = new Set<Element>();

  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();

    if (SKIPPED_TAGS.has(tag)) continue;

    const declarations = read_declarations(element);
    const parent_hidden =
      element.parentElement !== null &&
      hidden_elements.has(element.parentElement);
    const hidden = parent_hidden || hides_itself(declarations);

    if (hidden) hidden_elements.add(element);

    rendered.push({
      tag,
      layout: layout_signature(declarations),
      hidden,
      text: Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    });
  }

  return rendered;
}

function normal_view(html: string): string {
  return sanitize_html(html, {
    external_content_mode: "never",
    sandbox_mode: true,
  }).html;
}

function secure_view(html: string): string {
  return sanitize_html(html, SECURE_VIEW_SANITIZE_OPTIONS).html;
}

function print_view(html: string): string {
  return format_body(html, "never");
}

function visible_text(elements: RenderedElement[]): string {
  return elements
    .filter((element) => !element.hidden)
    .map((element) => element.text)
    .filter(Boolean)
    .join(" | ");
}

const PREHEADER_TEXT = "Preview line shown only in the inbox list";

const EMAIL_CORPUS: Record<string, string> = {
  newsletter_table: `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;width:100%">
      <tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="600" style="width:600px;max-width:600px;margin:0 auto;background:#ffffff">
          <tr><td style="padding:32px 40px;font-family:Arial,sans-serif;font-size:16px;line-height:24px">
            <h1 style="margin:0 0 16px;font-size:28px">Weekly digest</h1>
            <p style="margin:0 0 12px">Here is what happened this week.</p>
            <a href="https://example.com/read" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#ffffff;text-decoration:none;border-radius:4px">Read more</a>
          </td></tr>
        </table>
      </td></tr>
    </table>`,
  preheader_display_none: `
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff">${PREHEADER_TEXT}</div>
    <p style="margin:0">Body copy</p>`,
  preheader_max_height_zero: `
    <span style="color:transparent;max-height:0;max-width:0;opacity:0;overflow:hidden;font-size:0">${PREHEADER_TEXT}</span>
    <p style="margin:0">Body copy</p>`,
  preheader_negative_left: `
    <div style="position:absolute;left:-9999px;top:-9999px">${PREHEADER_TEXT}</div>
    <p style="margin:0">Body copy</p>`,
  preheader_negative_top_important: `
    <span style="position: absolute !important; top: -10000px !important; width: 1px; height: 1px; overflow: hidden">${PREHEADER_TEXT}</span>
    <p style="margin:0">Body copy</p>`,
  preheader_fixed_offscreen: `
    <div style="position:fixed;left:-5000px;width:1px;overflow:hidden">${PREHEADER_TEXT}</div>
    <p style="margin:0">Body copy</p>`,
  preheader_percent_offset: `
    <div style="position:absolute;left:-100%">${PREHEADER_TEXT}</div>
    <p style="margin:0">Body copy</p>`,
  negative_margin_hero: `
    <table role="presentation" width="600" style="width:600px;margin:0 auto">
      <tr><td><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="600" height="240" alt="Hero" style="display:block;width:600px"></td></tr>
      <tr><td style="padding:0 24px">
        <div style="margin-top:-60px;position:relative;background:#ffffff;padding:24px;border-radius:8px">Card that overlaps the hero</div>
      </td></tr>
    </table>`,
  negative_margin_columns: `
    <div style="margin:0 -12px">
      <div style="float:left;width:50%;padding:0 12px;box-sizing:border-box">Left column</div>
      <div style="float:left;width:50%;padding:0 12px;box-sizing:border-box;margin-left:-1px">Right column</div>
    </div>`,
  absolute_badges: `
    <div style="position:relative;width:280px;height:180px;background:#eeeeee">
      <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Product" width="280" height="180" style="display:block">
      <span style="position:absolute;top:8px;left:8px;background:#d93025;color:#ffffff;padding:2px 6px;z-index:2">Sale</span>
      <span style="position:absolute;top:-8px;right:-8px;width:24px;height:24px;border-radius:12px;background:#1a73e8;color:#ffffff">3</span>
      <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.5);color:#ffffff;padding:8px">Caption</div>
    </div>`,
  esp_inline_template: `
    <center style="width:100%;table-layout:fixed;background-color:#ececec">
      <div style="max-width:600px;margin:0 auto">
        <table align="center" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;width:100%;max-width:600px">
          <tr><td valign="top" style="padding-top:9px;padding-bottom:9px;letter-spacing:-0.2px;text-indent:0">
            <h2 style="display:block;margin:0;padding:0;color:#202020;font-size:22px;font-style:normal;font-weight:bold;line-height:125%;letter-spacing:normal;text-align:left">Your order shipped</h2>
            <p style="margin:10px 0;padding:0;mso-line-height-rule:exactly;-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;color:#202020;font-size:16px;line-height:150%">Tracking number 1Z999.</p>
          </td></tr>
        </table>
      </div>
    </center>`,
  media_query_columns: `
    <style>
      @media only screen and (max-width: 480px) {
        .column { width: 100% !important; display: block !important; }
      }
    </style>
    <table role="presentation" width="600" style="width:600px">
      <tr>
        <td class="column" width="300" style="width:300px;vertical-align:top">First column</td>
        <td class="column" width="300" style="width:300px;vertical-align:top">Second column</td>
      </tr>
    </table>`,
};

const PREHEADER_CASES = Object.keys(EMAIL_CORPUS).filter((key) =>
  key.startsWith("preheader_"),
);

function render_all(html: string) {
  return {
    normal: render_elements(normal_view(html)),
    secure: render_elements(secure_view(html)),
    print: render_elements(print_view(html)),
  };
}

describe("real-world email layouts across the normal view, secure view, and print", () => {
  for (const [name, html] of Object.entries(EMAIL_CORPUS)) {
    it(`${name} keeps the same visible layout in every view`, () => {
      const { normal, secure, print } = render_all(html);

      const visible_layout = (elements: RenderedElement[]) =>
        elements.map((element) =>
          element.hidden
            ? `${element.tag} hidden`
            : `${element.tag} ${element.layout}`,
        );

      expect(visible_layout(secure)).toEqual(visible_layout(normal));
      expect(visible_layout(print)).toEqual(visible_layout(normal));
      expect(visible_text(secure)).toBe(visible_text(normal));
      expect(visible_text(print)).toBe(visible_text(normal));
    });
  }

  for (const name of PREHEADER_CASES) {
    it(`${name} stays hidden in every view`, () => {
      const { normal, secure, print } = render_all(EMAIL_CORPUS[name]);

      for (const elements of [normal, secure, print]) {
        expect(visible_text(elements)).not.toContain(PREHEADER_TEXT);
        expect(visible_text(elements)).toContain("Body copy");
      }
    });
  }
});
