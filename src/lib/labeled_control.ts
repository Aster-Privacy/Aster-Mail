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
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

function is_toggle_element(node: ReactNode): node is ReactElement {
  if (!isValidElement(node)) return false;

  const props = node.props as Record<string, unknown>;

  if (!("checked" in props)) return false;

  return !("aria-label" in props) && !("aria-labelledby" in props);
}

export function label_toggle_child(
  child: ReactNode,
  label_id: string,
): ReactNode {
  if (!is_toggle_element(child)) return child;

  return cloneElement(child, { "aria-labelledby": label_id });
}

export function label_toggle_children(
  children: ReactNode,
  label_id: string,
): ReactNode {
  return Children.map(children, (child) => label_toggle_child(child, label_id));
}

export function label_toggle_children_with_text(
  children: ReactNode,
  label: string,
): ReactNode {
  return Children.map(children, (child) => {
    if (!is_toggle_element(child)) return child;

    return cloneElement(child, { "aria-label": label });
  });
}
