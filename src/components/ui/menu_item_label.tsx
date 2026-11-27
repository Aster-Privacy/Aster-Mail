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
import * as React from "react";

function sync_overflow_title(event: React.PointerEvent<HTMLSpanElement>): void {
  const label = event.currentTarget;

  if (label.scrollWidth > label.clientWidth) {
    label.title = label.textContent ?? "";
  } else {
    label.removeAttribute("title");
  }
}

export function MenuItemLabel({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span className="min-w-0 truncate" onPointerEnter={sync_overflow_title}>
      {children}
    </span>
  );
}

function is_text_node(node: React.ReactNode): node is string | number {
  return typeof node === "string" || typeof node === "number";
}

function is_fragment(
  node: React.ReactNode,
): node is React.ReactElement<{ children?: React.ReactNode }> {
  return React.isValidElement(node) && node.type === React.Fragment;
}

export function with_menu_item_labels(
  children: React.ReactNode,
): React.ReactNode {
  const nodes = React.Children.toArray(children);

  if (!nodes.some((node) => is_text_node(node) || is_fragment(node))) {
    return children;
  }

  const output: React.ReactNode[] = [];
  let text_run: Array<string | number> = [];

  const flush_text_run = (): void => {
    if (text_run.join("").trim() !== "") {
      output.push(
        <MenuItemLabel key={`menu_item_label_${output.length}`}>
          {text_run}
        </MenuItemLabel>,
      );
    }
    text_run = [];
  };

  for (const node of nodes) {
    if (is_text_node(node)) {
      text_run.push(node);
    } else if (is_fragment(node)) {
      flush_text_run();
      output.push(
        <React.Fragment key={node.key}>
          {with_menu_item_labels(node.props.children)}
        </React.Fragment>,
      );
    } else {
      flush_text_run();
      output.push(node);
    }
  }
  flush_text_run();

  return output;
}
