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
import { describe, it, expect, afterEach } from "vitest";

import { build_forced_dark_mode_css } from "@/lib/email_body_styles";
import { sanitize_html } from "@/lib/html_sanitizer";

const OPTIONS = {
  external_content_mode: "never" as const,
  sandbox_mode: true,
};

const NEUTRALIZE_RULE = "background-color: transparent !important;";

const ATTRIBUTE_CLAUSE = /(:not\()?\[([\w-]+)(?:\*="([^"]*)"(\s+i)?)?\]/g;

function span_selector(): string | null {
  const css = build_forced_dark_mode_css();
  const start = css.indexOf("div:not(");
  const end = css.lastIndexOf("{", css.indexOf(NEUTRALIZE_RULE, start));
  const selector = css
    .slice(start, end)
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("span"));

  return selector ?? null;
}

function matches_attribute(
  element: Element,
  name: string,
  needle: string | undefined,
  ignore_case: boolean,
): boolean {
  const value = element.getAttribute(name);

  if (value === null) return false;
  if (needle === undefined) return true;

  return ignore_case
    ? value.toLowerCase().includes(needle.toLowerCase())
    : value.includes(needle);
}

const mounted: HTMLElement[] = [];

function render(html: string): HTMLElement {
  const root = document.createElement("div");

  root.innerHTML = sanitize_html(html, OPTIONS).html;
  document.body.appendChild(root);
  mounted.push(root);

  return root;
}

function is_cleared(root: HTMLElement, query: string): boolean {
  const element = root.querySelector(query);

  if (!element) throw new Error(`${query} not found`);

  const selector = span_selector();

  if (!selector || element.tagName.toLowerCase() !== "span") return false;

  for (const clause of selector.matchAll(ATTRIBUTE_CLAUSE)) {
    const hit = matches_attribute(element, clause[2], clause[3], !!clause[4]);

    if (clause[1] ? hit : !hit) return false;
  }

  return true;
}

function outlook_paragraph(inner: string): string {
  return (
    '<div class="WordSection1"><p class="MsoNormal">' +
    '<span style="color:#17375E;mso-style-textfill-fill-color:#17375E;mso-style-textfill-fill-alpha:100.0%">' +
    `Your team won the <b>"Best Garden" </b>${inner} at the <b>Spring Fair</b>.` +
    "</span></p></div>"
  );
}

afterEach(() => {
  mounted.splice(0).forEach((root) => root.remove());
});

describe("forced dark mode on inline span backgrounds", () => {
  it("clears an Outlook white span inside coloured text", () => {
    const root = render(
      outlook_paragraph(
        '<span class="word" style="background:white">award </span>',
      ),
    );

    expect(is_cleared(root, "span.word")).toBe(true);
  });

  it("clears a span with a white hex background colour", () => {
    const root = render(
      outlook_paragraph(
        '<span class="word" style="background-color:#ffffff">award</span>',
      ),
    );

    expect(is_cleared(root, "span.word")).toBe(true);
  });

  it("clears near white and light grey spans", () => {
    const root = render(
      outlook_paragraph(
        '<span class="near" style="background:#FEFEFE">award</span>' +
          '<span class="rgb" style="background-color:rgb(255, 255, 255)">award</span>' +
          '<span class="short" style="background:#fff">award</span>' +
          '<span class="grey" style="background-color:#f2f2f2">award</span>',
      ),
    );

    expect(is_cleared(root, "span.near")).toBe(true);
    expect(is_cleared(root, "span.rgb")).toBe(true);
    expect(is_cleared(root, "span.short")).toBe(true);
    expect(is_cleared(root, "span.grey")).toBe(true);
  });

  it("keeps coloured marker highlights", () => {
    const root = render(
      outlook_paragraph(
        '<span class="yellow" style="background:yellow;mso-highlight:yellow">award</span>' +
          '<span class="green" style="background:lime;mso-highlight:lime">award</span>' +
          '<span class="pink" style="background-color:#ffc0cb">award</span>',
      ),
    );

    expect(is_cleared(root, "span.yellow")).toBe(false);
    expect(is_cleared(root, "span.green")).toBe(false);
    expect(is_cleared(root, "span.pink")).toBe(false);
  });

  it("keeps a branded button background", () => {
    const root = render(
      '<p><a class="button" href="https://example.com/rsvp" style="background:#1a73e8;color:#ffffff;padding:8px 16px">' +
        '<span class="label" style="background:#1a73e8;color:#ffffff">RSVP now</span></a></p>' +
        '<p><span class="badge" style="background-color:#0b5394;color:#ffffff">New</span></p>',
    );

    expect(is_cleared(root, "span.label")).toBe(false);
    expect(is_cleared(root, "span.badge")).toBe(false);
  });

  it("keeps a span that paints a background image", () => {
    const root = render(
      '<p><span class="art" style="background:#ffffff url(cid:art@example.com) no-repeat">Autumn</span></p>',
    );

    expect(is_cleared(root, "span.art")).toBe(false);
  });
});
