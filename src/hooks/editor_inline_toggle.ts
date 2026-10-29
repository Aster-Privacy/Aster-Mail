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
export type InlineToggleCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough";

interface ForceOffSpec {
  tags: string[];
  property: string;
  value: string;
}

const FORCE_OFF_SPECS: Partial<Record<InlineToggleCommand, ForceOffSpec>> = {
  bold: { tags: ["b", "strong"], property: "font-weight", value: "normal" },
  italic: { tags: ["i", "em"], property: "font-style", value: "normal" },
};

export function is_inline_toggle_command(
  command: string,
): command is InlineToggleCommand {
  return (
    command === "bold" ||
    command === "italic" ||
    command === "underline" ||
    command === "strikeThrough"
  );
}

function query_command_state(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function unwrap_elements(root: ParentNode, tags: string[]) {
  root.querySelectorAll(tags.join(",")).forEach((element) => {
    element.replaceWith(...Array.from(element.childNodes));
  });
}

function place_selection(selection: Selection, range: Range) {
  selection.removeAllRanges();
  selection.addRange(range);
}

function force_inline_off(
  editor: HTMLElement,
  selection: Selection,
  spec: ForceOffSpec,
): boolean {
  const range = selection.getRangeAt(0);

  if (!editor.contains(range.commonAncestorContainer)) return false;

  const wrapper = document.createElement("span");

  wrapper.style.setProperty(spec.property, spec.value);

  if (range.collapsed) {
    const filler = document.createTextNode("​");

    wrapper.appendChild(filler);
    range.insertNode(wrapper);

    const caret = document.createRange();

    caret.setStart(filler, 1);
    caret.collapse(true);
    place_selection(selection, caret);

    return true;
  }

  const fragment = range.extractContents();

  unwrap_elements(fragment, spec.tags);
  fragment.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    element.style.removeProperty(spec.property);
  });
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);

  const selected = document.createRange();

  selected.selectNodeContents(wrapper);
  place_selection(selection, selected);

  return true;
}

export function toggle_inline_format(
  editor: HTMLElement,
  command: InlineToggleCommand,
): boolean {
  const was_active = query_command_state(command);

  document.execCommand(command, false);

  if (!was_active || query_command_state(command) !== was_active) return true;

  const spec = FORCE_OFF_SPECS[command];
  const selection = window.getSelection();

  if (!spec || !selection || selection.rangeCount === 0) return false;

  return force_inline_off(editor, selection, spec);
}
