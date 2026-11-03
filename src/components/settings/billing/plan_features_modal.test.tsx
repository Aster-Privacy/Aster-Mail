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
import type { ReactNode } from "react";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PlanFeaturesModal } from "./plan_features_modal";

import { en } from "@/lib/i18n/translations/en";

const lookup = (key: string): string =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      en,
    ) as string;

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      lookup(key).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
        params && name in params ? String(params[name]) : match,
      ),
  }),
}));

vi.mock("@/components/settings/billing/plan_comparison_table", () => ({
  PlanComparisonTable: () => <div data-testid="comparison" />,
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

describe("PlanFeaturesModal title", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render_title = (props: {
    plan_name?: string;
    feature_lines?: { label: ReactNode }[];
  }): string => {
    act(() => {
      root.render(<PlanFeaturesModal is_open on_close={() => {}} {...props} />);
    });

    return container.querySelector("h2")?.textContent ?? "";
  };

  it("names the comparison when no plan is given", () => {
    const title = render_title({});

    expect(title).toBe(en.settings.compare_plans);
    expect(title).not.toContain("{");
  });

  it("fills the plan name into the comparison title", () => {
    const title = render_title({ plan_name: "Nova" });

    expect(title).toContain("Nova");
    expect(title).not.toContain("{");
  });

  it("uses the plan name over a feature list", () => {
    expect(
      render_title({ plan_name: "Nova", feature_lines: [{ label: "x" }] }),
    ).toBe("Nova");
  });

  it("never shows a raw placeholder with a feature list and no plan", () => {
    expect(render_title({ feature_lines: [{ label: "x" }] })).not.toContain(
      "{",
    );
  });
});
