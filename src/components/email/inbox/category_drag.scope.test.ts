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
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  EMAIL_DRAG_MIME,
  EMAIL_SCOPE_DRAG_MIME,
  is_scope_drag_active,
  loaded_selection_snapshot,
  register_scope_drag_handler,
  run_scope_drop,
  scope_drag_count,
} from "./category_drag";
import { build_selection_snapshot } from "./selection_snapshot";

const make_transfer = (types: string[]): DataTransfer =>
  ({ types }) as unknown as DataTransfer;

let unregister: (() => void) | null = null;

afterEach(() => {
  unregister?.();
  unregister = null;
});

const register = (active: boolean, run = vi.fn()) => {
  unregister = register_scope_drag_handler({
    is_active: () => active,
    count: () => 300,
    selection_snapshot: () =>
      build_selection_snapshot([
        { id: "a", is_selected: true },
        { id: "b", is_selected: true, grouped_email_ids: ["b", "b2"] },
        { id: "c", is_selected: false },
      ]),
    run,
  });

  return run;
};

describe("scope drag", () => {
  it("reports nothing when no handler is registered", () => {
    expect(is_scope_drag_active()).toBe(false);
    expect(scope_drag_count()).toBe(0);
    expect(loaded_selection_snapshot()).toBeNull();
  });

  it("routes a select-all drop to the scope handler", () => {
    const run = register(true);
    const handled = run_scope_drop(
      make_transfer([EMAIL_DRAG_MIME, EMAIL_SCOPE_DRAG_MIME]),
      { kind: "folder", token: "f1", name: "Work" },
    );

    expect(handled).toBe(true);
    expect(run).toHaveBeenCalledWith({
      kind: "folder",
      token: "f1",
      name: "Work",
    });
    expect(scope_drag_count()).toBe(300);
  });

  it("leaves a normal drag to the id-based drop", () => {
    const run = register(true);
    const handled = run_scope_drop(make_transfer([EMAIL_DRAG_MIME]), {
      kind: "tag",
      token: "t1",
      name: "Label",
    });

    expect(handled).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("ignores a stale scope drag after select-all ends", () => {
    const run = register(false);
    const handled = run_scope_drop(
      make_transfer([EMAIL_DRAG_MIME, EMAIL_SCOPE_DRAG_MIME]),
      { kind: "category", category: "promotions" },
    );

    expect(handled).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("builds the drag snapshot from every loaded selected row", () => {
    register(true);
    const snapshot = loaded_selection_snapshot();

    expect(snapshot?.ids).toEqual(["a", "b"]);
    expect(snapshot?.grouped_ids).toEqual(["a", "b", "b2"]);
  });

  it("stops routing once unregistered", () => {
    const run = register(true);

    unregister?.();
    unregister = null;

    expect(
      run_scope_drop(make_transfer([EMAIL_SCOPE_DRAG_MIME]), {
        kind: "folder",
        token: "f1",
        name: "Work",
      }),
    ).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
