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
export interface BillingSegmentedOption<T extends string> {
  id: T;
  label: string;
}

interface BillingSegmentedProps<T extends string> {
  options: BillingSegmentedOption<T>[];
  value: T;
  on_change: (value: T) => void;
  aria_label: string;
}

export function BillingSegmented<T extends string>({
  options,
  value,
  on_change,
  aria_label,
}: BillingSegmentedProps<T>) {
  return (
    <div className="flex justify-center">
      <div
        aria-label={aria_label}
        className="inline-flex items-center gap-1 rounded-full border border-edge-secondary bg-surf-secondary p-[5px]"
        role="tablist"
      >
        {options.map((option) => {
          const is_active = option.id === value;

          return (
            <button
              key={option.id}
              aria-selected={is_active}
              className="rounded-full px-[18px] py-[8px] text-[13px] font-medium transition-colors"
              role="tab"
              style={{
                backgroundColor: is_active
                  ? "var(--accent-blue)"
                  : "transparent",
                color: is_active ? "#ffffff" : "var(--text-tertiary)",
              }}
              type="button"
              onClick={() => on_change(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
