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
import type { CancelStep } from "@/components/settings/billing/cancel_impact_step";

export interface CancelFlowOptions {
  has_save_offer: boolean;
  has_plan_offer: boolean;
  can_pause: boolean;
}

export function retention_step_for(
  options: CancelFlowOptions,
): CancelStep | null {
  if (options.has_save_offer) return "save";
  if (options.has_plan_offer) return "offer";
  if (options.can_pause) return "pause";

  return null;
}

export function has_retention_options(options: CancelFlowOptions): boolean {
  return retention_step_for(options) !== null;
}

export function step_before_confirm(
  options: CancelFlowOptions,
  came_from: CancelStep,
): CancelStep {
  if (came_from === "reason") return "reason";

  return retention_step_for(options) ?? "reason";
}
