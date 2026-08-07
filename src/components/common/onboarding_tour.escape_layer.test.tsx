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
import type { ButtonHTMLAttributes } from "react";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OnboardingTour } from "@/components/common/onboarding_tour";
import { use_escape_layer } from "@/lib/overlay_layer_stack";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const skip_onboarding = vi.fn(async () => {});
const advance_to_step = vi.fn(async () => {});
const complete_onboarding = vi.fn(async () => {});

vi.mock("@/hooks/use_onboarding", () => ({
  use_onboarding: () => ({
    state: { current_step: 0 },
    is_completed: false,
    is_skipped: false,
    is_loading: false,
    should_show_onboarding: true,
    advance_to_step,
    complete_step: vi.fn(async () => {}),
    skip_onboarding,
    complete_onboarding,
    refresh: vi.fn(async () => {}),
  }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light" }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

function TopLayer({ on_close }: { on_close: () => void }) {
  use_escape_layer(true, on_close, "test_modal");

  return null;
}

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("onboarding tour layer participation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    skip_onboarding.mockClear();
    advance_to_step.mockClear();
    complete_onboarding.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("skips the tour on escape when it is the only layer", () => {
    act(() => {
      root.render(<OnboardingTour />);
    });

    act(() => press("Escape"));

    expect(skip_onboarding).toHaveBeenCalledTimes(1);
  });

  it("does not skip the tour when a modal is open above it", () => {
    const close_modal = vi.fn();

    act(() => {
      root.render(
        <>
          <OnboardingTour />
          <TopLayer on_close={close_modal} />
        </>,
      );
    });

    act(() => press("Escape"));

    expect(close_modal).toHaveBeenCalledTimes(1);
    expect(skip_onboarding).not.toHaveBeenCalled();
  });

  it("does not advance steps when a modal is open above it", () => {
    act(() => {
      root.render(
        <>
          <OnboardingTour />
          <TopLayer on_close={() => {}} />
        </>,
      );
    });

    act(() => press("ArrowRight"));

    expect(advance_to_step).not.toHaveBeenCalled();
  });

  it("advances steps on arrow keys when it is the top layer", () => {
    act(() => {
      root.render(<OnboardingTour />);
    });

    act(() => press("ArrowRight"));

    expect(advance_to_step).toHaveBeenCalledWith(1);
  });
});
