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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  close_upgrade_modal,
  get_upgrade_snapshot,
  use_upgrade_prompt_events,
} from "./upgrade_store";

function Listener() {
  use_upgrade_prompt_events();

  return null;
}

let container: HTMLDivElement;
let root: Root;

function mount() {
  act(() => root.render(<Listener />));
}

function calls_hook_in(file: string, component: string): boolean {
  const path = join(process.cwd(), "src", file);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const target = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === component,
  );

  return (
    !!target?.body &&
    target.body.statements.some(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        statement.expression.expression.getText(source) ===
          "use_upgrade_prompt_events",
    )
  );
}

beforeEach(() => {
  close_upgrade_modal();
  window.history.pushState({}, "", "/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  close_upgrade_modal();
});

describe("upgrade prompt events", () => {
  it("opens the plan limit prompt when the server reports a plan limit", () => {
    mount();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("aster:plan-limit-hit", {
          detail: { resource: "aliases", message: "limit" },
        }),
      );
    });

    const state = get_upgrade_snapshot();

    expect(state.is_open).toBe(true);
    expect(state.reason).toBe("plan_limit");
    expect(state.server_message).toBe("limit");
  });

  it("opens the storage prompt when the server reports a full mailbox", () => {
    mount();

    act(() => {
      window.dispatchEvent(new CustomEvent("aster:storage-full"));
    });

    expect(get_upgrade_snapshot().reason).toBe("storage_full");
    expect(get_upgrade_snapshot().is_open).toBe(true);
  });

  it("stops listening once unmounted", () => {
    mount();
    act(() => root.unmount());
    root = createRoot(container);

    window.dispatchEvent(new CustomEvent("aster:plan-limit-hit"));

    expect(get_upgrade_snapshot().is_open).toBe(false);
  });

  it.each([
    ["App.tsx", "App"],
    ["mobile_app.tsx", "MobileApp"],
  ])("%s listens for upgrade prompts", (file, component) => {
    expect(calls_hook_in(file, component)).toBe(true);
  });
});
