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
import { repair_comment_markup } from "./html_sanitizer_utils";
const MAX_CSS_LENGTH = 400_000;
const MAX_STYLE_RULES = 4_000;
const INLINE_STYLE_RANK = Number.MAX_SAFE_INTEGER;

interface DeclarationRank {
  important: boolean;
  specificity: number;
  order: number;
}

function beats(candidate: DeclarationRank, current: DeclarationRank): boolean {
  if (candidate.important !== current.important) return candidate.important;
  if (candidate.specificity !== current.specificity)
    return candidate.specificity > current.specificity;

  return candidate.order >= current.order;
}

function parse_css_rules(css_text: string): CSSRule[] {
  try {
    const sheet = new CSSStyleSheet();

    sheet.replaceSync(css_text);

    return Array.from(sheet.cssRules);
  } catch {
    void 0;
  }

  try {
    const inert_doc = document.implementation.createHTMLDocument("");
    const style_el = inert_doc.createElement("style");

    style_el.appendChild(inert_doc.createTextNode(css_text));
    inert_doc.head.appendChild(style_el);

    return style_el.sheet ? Array.from(style_el.sheet.cssRules) : [];
  } catch {
    return [];
  }
}

function collect_style_rules(rules: CSSRule[]): CSSStyleRule[] {
  const style_rules: CSSStyleRule[] = [];

  for (const rule of rules) {
    if ("selectorText" in rule && "style" in rule) {
      style_rules.push(rule as CSSStyleRule);
    }
  }

  return style_rules;
}

function compute_specificity(selector: string): number {
  const cleaned = selector
    .replace(/::[a-zA-Z-]+(\([^)]*\))?/g, " ")
    .replace(/:not\(/gi, "(");
  const ids = (cleaned.match(/#[a-zA-Z0-9_-]+/g) || []).length;
  const classes = (
    cleaned.match(/\.[a-zA-Z0-9_-]+|\[[^\]]*\]|:[a-zA-Z-]+(\([^)]*\))?/g) || []
  ).length;
  const stripped = cleaned
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/:[a-zA-Z-]+(\([^)]*\))?/g, " ")
    .replace(/[#.][a-zA-Z0-9_-]+/g, " ");
  const types = (stripped.match(/[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;

  return ids * 1_000_000 + classes * 1_000 + types;
}

function snapshot_inline_styles(
  doc: Document,
): Map<Element, Map<string, DeclarationRank>> {
  const winners = new Map<Element, Map<string, DeclarationRank>>();

  for (const el of Array.from(doc.querySelectorAll("[style]"))) {
    const style = (el as HTMLElement).style;

    if (!style) continue;

    const props = new Map<string, DeclarationRank>();

    for (let i = 0; i < style.length; i++) {
      const prop = style.item(i);

      props.set(prop, {
        important: style.getPropertyPriority(prop) === "important",
        specificity: INLINE_STYLE_RANK,
        order: INLINE_STYLE_RANK,
      });
    }

    winners.set(el, props);
  }

  return winners;
}

function apply_declarations(
  el: HTMLElement,
  declarations: CSSStyleDeclaration,
  specificity: number,
  order: number,
  winners: Map<Element, Map<string, DeclarationRank>>,
): void {
  let props = winners.get(el);

  if (!props) {
    props = new Map();
    winners.set(el, props);
  }

  for (let i = 0; i < declarations.length; i++) {
    const prop = declarations.item(i);
    const priority = declarations.getPropertyPriority(prop);
    const candidate: DeclarationRank = {
      important: priority === "important",
      specificity,
      order,
    };
    const current = props.get(prop);

    if (current && !beats(candidate, current)) continue;

    try {
      el.style.setProperty(prop, declarations.getPropertyValue(prop), priority);
      props.set(prop, candidate);
    } catch {
      continue;
    }
  }
}

function apply_stylesheet_to_document(doc: Document, css_text: string): void {
  const style_rules = collect_style_rules(parse_css_rules(css_text));

  if (style_rules.length === 0 || style_rules.length > MAX_STYLE_RULES) return;

  const winners = snapshot_inline_styles(doc);

  style_rules.forEach((rule, order) => {
    for (const raw_selector of rule.selectorText.split(",")) {
      const selector = raw_selector.trim();

      if (!selector) continue;

      let matched: Element[];

      try {
        matched = Array.from(doc.querySelectorAll(selector));
      } catch {
        continue;
      }

      if (matched.length === 0) continue;

      const specificity = compute_specificity(selector);

      for (const el of matched) {
        if (!("style" in el)) continue;

        apply_declarations(
          el as HTMLElement,
          rule.style,
          specificity,
          order,
          winners,
        );
      }
    }
  });
}

function is_safe_presentational_value(value: string): boolean {
  return value.length <= 64 && !/[;:(){}<>\\"'`]/.test(value);
}

function wrap_body_content(doc: Document): string {
  const body = doc.body;

  if (!body) return "";

  const style_parts: string[] = [];
  const html_style = doc.documentElement?.getAttribute("style");

  if (html_style) style_parts.push(html_style.replace(/;\s*$/, ""));

  const bgcolor = body.getAttribute("bgcolor");

  if (bgcolor && is_safe_presentational_value(bgcolor)) {
    style_parts.push(`background-color: ${bgcolor}`);
  }

  const text_color = body.getAttribute("text");

  if (text_color && is_safe_presentational_value(text_color)) {
    style_parts.push(`color: ${text_color}`);
  }

  const body_style = body.getAttribute("style");

  if (body_style) style_parts.push(body_style.replace(/;\s*$/, ""));

  const combined = style_parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("; ");

  if (!combined) return body.innerHTML;

  const wrapper = doc.createElement("div");

  wrapper.setAttribute("style", combined);

  while (body.firstChild) wrapper.appendChild(body.firstChild);

  body.appendChild(wrapper);

  return body.innerHTML;
}

export function inline_email_css(html: string): string {
  if (!html || typeof html !== "string") return "";

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(
      repair_comment_markup(html),
      "text/html",
    );
  } catch {
    return "";
  }

  if (!doc.body) return "";

  const css_text = Array.from(doc.querySelectorAll("style"))
    .map((el) => el.textContent || "")
    .join("\n");

  doc
    .querySelectorAll("script, style, link, meta, title, base, noscript, template")
    .forEach((el) => el.remove());

  if (css_text.trim().length > 0 && css_text.length <= MAX_CSS_LENGTH) {
    try {
      apply_stylesheet_to_document(doc, css_text);
    } catch {
      void 0;
    }
  }

  return wrap_body_content(doc);
}
