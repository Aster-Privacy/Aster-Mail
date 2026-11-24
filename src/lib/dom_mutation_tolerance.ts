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
export type ForeignMutationKind =
  | "remove_detached"
  | "remove_wrapped"
  | "insert_detached_ref"
  | "insert_wrapped_ref";

export type ForeignMutationHandler = (kind: ForeignMutationKind) => void;

const TOLERANCE_MARKER = Symbol.for("aster.dom_mutation_tolerance");

type TolerantPrototype = Node & { [TOLERANCE_MARKER]?: true };

function nearest_child_of(parent: Node, node: Node): Node | null {
  let current: Node | null = node;

  while (current && current.parentNode !== parent) {
    current = current.parentNode;
  }

  return current;
}

function is_wrapped_inside(parent: Node, node: Node): boolean {
  return node.parentNode !== null && node !== parent && parent.contains(node);
}

export function install_dom_mutation_tolerance(
  on_foreign_mutation: ForeignMutationHandler,
): (() => void) | null {
  if (typeof Node === "undefined" || !Node.prototype) return null;

  const proto = Node.prototype as TolerantPrototype;

  if (proto[TOLERANCE_MARKER]) return null;

  const original_remove_child = proto.removeChild;
  const original_insert_before = proto.insertBefore;

  proto.removeChild = function tolerant_remove_child<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child && child.parentNode !== this) {
      if (child.parentNode === null) {
        on_foreign_mutation("remove_detached");

        return child;
      }
      if (is_wrapped_inside(this, child)) {
        on_foreign_mutation("remove_wrapped");

        return original_remove_child.call(child.parentNode, child) as T;
      }
    }

    return original_remove_child.call(this, child) as T;
  };

  proto.insertBefore = function tolerant_insert_before<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this) {
      if (reference.parentNode === null) {
        on_foreign_mutation("insert_detached_ref");

        return original_insert_before.call(this, node, null) as T;
      }
      if (is_wrapped_inside(this, reference)) {
        on_foreign_mutation("insert_wrapped_ref");

        return original_insert_before.call(
          this,
          node,
          nearest_child_of(this, reference),
        ) as T;
      }
    }

    return original_insert_before.call(this, node, reference) as T;
  };

  Object.defineProperty(proto, TOLERANCE_MARKER, {
    value: true,
    configurable: true,
  });

  return () => {
    proto.removeChild = original_remove_child;
    proto.insertBefore = original_insert_before;
    delete proto[TOLERANCE_MARKER];
  };
}
