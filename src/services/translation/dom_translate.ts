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
import { direction_for, type LanguageCode } from "./engine_types";

export const TRANSLATED_MARKER_ATTR = "data-aster-translated";

const EXCLUDED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "PRE",
  "CODE",
  "KBD",
  "SAMP",
  "VAR",
  "TT",
]);

const EXCLUDED_SELECTOR = [
  ".aster-quoted-content",
  ".aster-quote-toggle",
  ".aster-forwarded-collapse",
  ".remote-content-banner",
  "[translate='no']",
  ".notranslate",
].join(",");

const MIN_TRANSLATABLE_LENGTH = 2;

const NON_LINGUISTIC = /^[\s\d\p{P}\p{S}]*$/u;

const originals = new WeakMap<Text, string>();
const translations_by_node = new WeakMap<Text, string>();

function is_excluded(node: Text): boolean {
  let element = node.parentElement;

  while (element) {
    if (EXCLUDED_TAGS.has(element.tagName)) return true;

    if (element.getAttribute("translate") === "no") return true;

    element = element.parentElement;
  }

  return false;
}

function is_translatable_text(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length < MIN_TRANSLATABLE_LENGTH) return false;

  return !NON_LINGUISTIC.test(trimmed);
}

export function collect_translatable_nodes(root: HTMLElement): Text[] {
  const doc = root.ownerDocument;

  if (!doc) return [];

  const excluded_roots = new Set<Element>(
    Array.from(root.querySelectorAll(EXCLUDED_SELECTOR)),
  );

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  for (
    let current = walker.nextNode();
    current !== null;
    current = walker.nextNode()
  ) {
    const node = current as Text;

    if (!is_translatable_text(node.data)) continue;
    if (is_excluded(node)) continue;

    let inside_excluded = false;

    for (
      let element = node.parentElement;
      element && element !== root;
      element = element.parentElement
    ) {
      if (excluded_roots.has(element)) {
        inside_excluded = true;
        break;
      }
    }

    if (inside_excluded) continue;

    nodes.push(node);
  }

  return nodes;
}

export function read_node_text(nodes: readonly Text[]): string[] {
  return nodes.map((node) => originals.get(node) ?? node.data);
}

export function apply_translations(
  nodes: readonly Text[],
  translations: readonly string[],
): number {
  if (nodes.length !== translations.length) return 0;

  let swapped = 0;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const translated = translations[index];

    if (!translated || !translated.trim()) continue;

    const original = originals.get(node) ?? node.data;

    if (translated === original) continue;

    if (!originals.has(node)) originals.set(node, node.data);

    translations_by_node.set(node, translated);
    node.textContent = translated;
    swapped += 1;
  }

  return swapped;
}

export function restore_originals(root: HTMLElement): number {
  const doc = root.ownerDocument;

  if (!doc) return 0;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let restored = 0;

  for (
    let current = walker.nextNode();
    current !== null;
    current = walker.nextNode()
  ) {
    const node = current as Text;
    const original = originals.get(node);

    if (original === undefined) continue;

    if (node.data !== original) {
      node.textContent = original;
      restored += 1;
    }
  }

  clear_translation_state(root);

  return restored;
}

export function restore_translated(root: HTMLElement): number {
  const doc = root.ownerDocument;

  if (!doc) return 0;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let restored = 0;

  for (
    let current = walker.nextNode();
    current !== null;
    current = walker.nextNode()
  ) {
    const node = current as Text;
    const translated = translations_by_node.get(node);

    if (translated === undefined) continue;

    if (node.data !== translated) {
      node.textContent = translated;
      restored += 1;
    }
  }

  return restored;
}

const PREVIOUS_DIR_ATTR = "data-aster-previous-dir";
const PREVIOUS_LANG_ATTR = "data-aster-previous-lang";

function stash_attribute(root: HTMLElement, name: string, stash: string): void {
  if (root.hasAttribute(stash)) return;

  root.setAttribute(stash, root.getAttribute(name) ?? "");
}

function unstash_attribute(
  root: HTMLElement,
  name: string,
  stash: string,
): void {
  if (!root.hasAttribute(stash)) return;

  const previous = root.getAttribute(stash) ?? "";

  if (previous) {
    root.setAttribute(name, previous);
  } else {
    root.removeAttribute(name);
  }

  root.removeAttribute(stash);
}

export function mark_translated(
  root: HTMLElement,
  language: LanguageCode,
): void {
  stash_attribute(root, "dir", PREVIOUS_DIR_ATTR);
  stash_attribute(root, "lang", PREVIOUS_LANG_ATTR);

  root.setAttribute(TRANSLATED_MARKER_ATTR, language);
  root.setAttribute("dir", direction_for(language));
  root.setAttribute("lang", language);
}

export function clear_translation_state(root: HTMLElement): void {
  root.removeAttribute(TRANSLATED_MARKER_ATTR);

  unstash_attribute(root, "dir", PREVIOUS_DIR_ATTR);
  unstash_attribute(root, "lang", PREVIOUS_LANG_ATTR);
}

export function translated_language(root: HTMLElement): string | null {
  return root.getAttribute(TRANSLATED_MARKER_ATTR);
}
