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

const SELECTABLE_TARGETS = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[data-selectable]",
  "code",
  "pre",
  "kbd",
  "samp",
  ".font-mono",
  ".select-text",
  ".select-all",
  "[role='alert']",
].join(",");

const GUARDED_SURFACES = [
  "button",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[role='listbox']",
  "[role='tablist']",
  "label",
  "summary",
  "nav",
  "header",
  "aside",
  ".aster_btn",
].join(",");

const CONTROL_SURFACES = [
  "button",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='slider']",
  "[role='menu']",
  "[role='menubar']",
  "[role='listbox']",
  "[role='tablist']",
  "[role='toolbar']",
  "summary",
  "label",
  ".aster_btn",
  ".select-none",
  "[data-compose-mode-header]",
].join(",");

function is_document_root(element: Element | null): boolean {
  if (!element) return true;

  return (
    element === element.ownerDocument.body ||
    element === element.ownerDocument.documentElement
  );
}

function is_layer_locked(doc: Document): boolean {
  return doc.body?.style.pointerEvents === "none";
}

function element_of(node: EventTarget | Node | null): Element | null {
  if (!node) return null;
  if (node instanceof Element) return node;
  if (node instanceof Node) return node.parentElement;

  return null;
}

export function is_control_surface(element: Element | null): boolean {
  if (!element) return false;
  if (element.closest(SELECTABLE_TARGETS)) return false;
  if (element instanceof HTMLElement && element.isContentEditable) {
    return false;
  }

  return element.closest(CONTROL_SURFACES) !== null;
}

export function should_block_multi_click_selection(event: MouseEvent): boolean {
  if (event.button !== 0) return false;

  const target = event.target;

  if (!(target instanceof Element)) return false;

  if (is_document_root(target)) {
    return event.detail >= 2 || is_layer_locked(target.ownerDocument);
  }

  if (event.shiftKey && is_control_surface(target)) return true;
  if (event.detail < 2) return false;
  if (target.closest(SELECTABLE_TARGETS)) return false;

  return (
    target.closest(GUARDED_SURFACES) !== null || is_control_surface(target)
  );
}

export function should_block_select_start(event: Event): boolean {
  return is_control_surface(element_of(event.target));
}

function handle_mouse_down(event: MouseEvent): void {
  if (should_block_multi_click_selection(event)) {
    event.preventDefault();
  }
}

function handle_select_start(event: Event): void {
  if (should_block_select_start(event)) {
    event.preventDefault();
  }
}

export const READING_PANE_SELECTOR = "[data-reading-pane]";
export const MESSAGE_FRAME_SELECTOR = "iframe[data-message-frame]";
export const LIST_SURFACE_SELECTOR = "[data-list-column]";

const NATIVE_SELECT_ALL_TARGETS = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[contenteditable='plaintext-only']",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='combobox']",
  "[data-compose-editor]",
  "[data-compose-window]",
  "[data-selectable-region]",
].join(",");

let last_context: Element | null = null;
const last_frame_by_pane = new WeakMap<Element, HTMLIFrameElement>();

export function note_message_frame_activity(frame: HTMLIFrameElement): void {
  last_context = frame;
  const pane = frame.closest(READING_PANE_SELECTOR);

  if (pane) last_frame_by_pane.set(pane, frame);
}

function note_context(target: EventTarget | null): void {
  const element = element_of(target);

  if (!element || is_document_root(element)) return;
  last_context = element;

  const pane = element.closest(READING_PANE_SELECTOR);

  if (!pane) return;
  const frame = frame_for_context(element, pane);

  if (frame) last_frame_by_pane.set(pane, frame);
}

export function get_selection_context(
  doc: Document = document,
): Element | null {
  const active = doc.activeElement;

  if (active && !is_document_root(active)) return active;
  if (last_context && last_context.isConnected) return last_context;

  return null;
}

export function is_list_selection_context(doc: Document = document): boolean {
  const context = get_selection_context(doc);

  return !!context?.closest(LIST_SURFACE_SELECTOR);
}

function frames_in(root: Element): HTMLIFrameElement[] {
  return Array.from(
    root.querySelectorAll<HTMLIFrameElement>(MESSAGE_FRAME_SELECTOR),
  ).filter((frame) => !!frame.contentDocument?.body);
}

function frame_for_context(
  context: Element,
  pane: Element,
): HTMLIFrameElement | null {
  if (
    context instanceof HTMLIFrameElement &&
    context.matches(MESSAGE_FRAME_SELECTOR)
  ) {
    return context;
  }

  let node: Element | null = context;

  while (node && node !== pane) {
    const frames = frames_in(node);

    if (frames.length === 1) return frames[0];
    if (frames.length > 1) return null;
    node = node.parentElement;
  }

  return null;
}

function pane_for_context(
  context: Element | null,
  doc: Document,
): Element | null {
  const from_context = context?.closest(READING_PANE_SELECTOR);

  if (from_context) return from_context;

  const panes = Array.from(doc.querySelectorAll(READING_PANE_SELECTOR));

  return panes.length > 0 ? panes[panes.length - 1] : null;
}

export function find_active_message_frame(
  doc: Document = document,
): HTMLIFrameElement | null {
  const context = get_selection_context(doc);
  const pane = pane_for_context(context, doc);

  if (!pane) return null;

  const from_context = context ? frame_for_context(context, pane) : null;

  if (from_context) return from_context;

  const remembered = last_frame_by_pane.get(pane);

  if (remembered && remembered.isConnected && pane.contains(remembered)) {
    return remembered;
  }

  const frames = frames_in(pane);

  return frames.length > 0 ? frames[frames.length - 1] : null;
}

export function select_message_frame_body(frame: HTMLIFrameElement): boolean {
  const frame_doc = frame.contentDocument;
  const body = frame_doc?.body;
  const selection = frame_doc?.getSelection();

  if (!frame_doc || !body || !selection) return false;

  frame.ownerDocument.getSelection()?.removeAllRanges();
  try {
    frame.contentWindow?.focus();
  } catch {
    frame.focus();
  }

  const range = frame_doc.createRange();

  range.selectNodeContents(body);
  selection.removeAllRanges();
  selection.addRange(range);
  note_message_frame_activity(frame);

  return true;
}

export function is_select_all_key(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "a" || event.key === "A")
  );
}

export function should_keep_native_select_all(
  event: KeyboardEvent,
  doc: Document = document,
): boolean {
  const target = element_of(event.target);
  const context =
    target && !is_document_root(target) ? target : get_selection_context(doc);

  if (!context) return false;
  if (context.closest(NATIVE_SELECT_ALL_TARGETS)) return true;
  if (context instanceof HTMLElement && context.isContentEditable) return true;
  if (context.closest(LIST_SURFACE_SELECTOR)) return true;

  const layer = context.closest(
    "[role='dialog'], [role='alertdialog'], [role='menu']",
  );

  return (
    !!layer &&
    !layer.querySelector(READING_PANE_SELECTOR) &&
    !layer.closest(READING_PANE_SELECTOR)
  );
}

export function handle_message_select_all(
  event: KeyboardEvent,
  doc: Document = document,
): boolean {
  if (event.defaultPrevented || !is_select_all_key(event)) return false;
  if (!doc.querySelector(READING_PANE_SELECTOR)) return false;
  if (should_keep_native_select_all(event, doc)) return false;

  const frame = find_active_message_frame(doc);

  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.repeat || !frame) return true;
  select_message_frame_body(frame);

  return true;
}

function handle_key_down(event: KeyboardEvent): void {
  handle_message_select_all(event);
}

function handle_context_event(event: Event): void {
  note_context(event.target);
}

let installed = false;

export function start_multi_click_selection_guard(): () => void {
  if (installed || typeof document === "undefined") return () => {};

  installed = true;
  document.addEventListener("mousedown", handle_mouse_down, true);
  document.addEventListener("selectstart", handle_select_start, true);
  document.addEventListener("pointerdown", handle_context_event, true);
  document.addEventListener("focusin", handle_context_event, true);
  document.addEventListener("keydown", handle_key_down, true);

  return () => {
    document.removeEventListener("mousedown", handle_mouse_down, true);
    document.removeEventListener("selectstart", handle_select_start, true);
    document.removeEventListener("pointerdown", handle_context_event, true);
    document.removeEventListener("focusin", handle_context_event, true);
    document.removeEventListener("keydown", handle_key_down, true);
    installed = false;
    last_context = null;
  };
}
