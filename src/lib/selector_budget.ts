//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
const MAX_SELECTOR_LENGTH = 512;
const MAX_SELECTOR_STEPS = 16;
const SELECTOR_GAP_CODES = new Set([9, 10, 12, 13, 32, 43, 62, 126]);

export interface SelectorBudget {
  take: () => boolean;
}

function count_selector_steps(selector: string): number {
  let steps = 0;
  let in_gap = true;

  for (let index = 0; index < selector.length; index += 1) {
    const is_gap = SELECTOR_GAP_CODES.has(selector.charCodeAt(index));

    if (!is_gap && in_gap) steps += 1;
    in_gap = is_gap;
  }

  return steps;
}

export function is_affordable_selector(selector: string): boolean {
  if (selector.length > MAX_SELECTOR_LENGTH) return false;
  if (selector.toLowerCase().includes(":has(")) return false;

  return count_selector_steps(selector) <= MAX_SELECTOR_STEPS;
}

export function create_selector_budget(
  max_selectors: number,
  time_budget_ms: number,
): SelectorBudget {
  const deadline = performance.now() + time_budget_ms;
  let used = 0;

  return {
    take: () => {
      if (used >= max_selectors || performance.now() > deadline) return false;
      used += 1;

      return true;
    },
  };
}
