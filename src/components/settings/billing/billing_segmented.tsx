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
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );

  return (
    <div
      aria-label={aria_label}
      className="relative grid w-full rounded-xl bg-surf-tertiary p-1"
      role="tablist"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-1 top-1 rounded-lg bg-surf-primary shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => {
        const is_active = option.id === value;

        return (
          <button
            key={option.id}
            aria-selected={is_active}
            className={`relative z-10 h-9 rounded-lg text-sm font-medium transition-colors ${
              is_active
                ? "text-txt-primary"
                : "text-txt-muted hover:text-txt-secondary"
            }`}
            role="tab"
            type="button"
            onClick={() => on_change(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
