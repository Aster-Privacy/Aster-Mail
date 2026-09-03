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
import { CheckIcon } from "@heroicons/react/20/solid";

export interface BillingTermOption<T extends string> {
  id: T;
  label: string;
  note?: string | null;
  badge?: string | null;
}

interface BillingTermSelectorProps<T extends string> {
  value: T;
  options: BillingTermOption<T>[];
  label?: string | null;
  disabled?: boolean;
  on_change: (id: T) => void;
}

export function BillingTermSelector<T extends string>({
  value,
  options,
  label = null,
  disabled = false,
  on_change,
}: BillingTermSelectorProps<T>) {
  return (
    <div className="w-full">
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
          {label}
        </p>
      )}

      <div
        className="rounded-[18px] border border-edge-secondary bg-surf-secondary p-1.5"
        role="radiogroup"
      >
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
          }}
        >
          {options.map((option) => {
            const active = option.id === value;

            return (
              <button
                key={option.id}
                aria-checked={active}
                className={`relative flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-start transition-all focus:outline-none disabled:opacity-60 ${
                  active
                    ? "plan_galaxy shadow-sm"
                    : "border-transparent bg-transparent hover:bg-surf-tertiary"
                }`}
                disabled={disabled}
                role="radio"
                type="button"
                onClick={() => on_change(option.id)}
              >
                <span
                  aria-hidden="true"
                  className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border transition-colors"
                  style={{
                    borderColor: active
                      ? "var(--accent-blue)"
                      : "var(--border-secondary)",
                    backgroundColor: active
                      ? "var(--accent-blue)"
                      : "transparent",
                  }}
                >
                  {active && (
                    <CheckIcon
                      className="h-3 w-3"
                      style={{ color: "var(--accent-fg, #ffffff)" }}
                    />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13px] font-semibold ${
                      active ? "plan_galaxy_text_primary" : "text-txt-primary"
                    }`}
                  >
                    {option.label}
                  </span>
                  {option.note && (
                    <span
                      className={`mt-0.5 block text-[11px] leading-snug ${
                        active ? "plan_galaxy_text_muted" : "text-txt-muted"
                      }`}
                    >
                      {option.note}
                    </span>
                  )}
                </span>

                {option.badge && (
                  <span className="plan_galaxy_badge flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                    {option.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
