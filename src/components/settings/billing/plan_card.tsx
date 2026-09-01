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
import { XCircleIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

export interface PlanFeature {
  label: string;
  on: boolean;
}

function render_feature_label(label: string) {
  const match = label.match(/^(Unlimited|\d[\d.,]*(?:\s?[GMT]B)?)\s+(.*)$/i);

  if (!match) return label;

  return (
    <>
      <strong className="font-semibold text-txt-primary">{match[1]}</strong>{" "}
      {match[2]}
    </>
  );
}

export interface PlanCardProps {
  name: string;
  description?: string | null;
  price_label: string;
  period_label: string;
  anchor_label?: string | null;
  save_label?: string | null;
  billed_note?: string | null;
  badge?: string | null;
  featured: boolean;
  is_current: boolean;
  cta_label: string;
  cta_disabled: boolean;
  on_cta: () => void;
  features: PlanFeature[];
  lead_in?: string | null;
  compact?: boolean;
}

export function PlanCard({
  name,
  description,
  price_label,
  period_label,
  anchor_label,
  save_label,
  billed_note,
  badge,
  featured,
  is_current,
  cta_label,
  cta_disabled,
  on_cta,
  features,
  lead_in,
  compact = false,
}: PlanCardProps) {
  const highlighted = featured || is_current;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border transition-colors ${
        compact ? "p-4" : "p-6"
      } ${
        featured
          ? `border-brand bg-surf-selected z-10 ${compact ? "" : "sm:-my-2 sm:py-8"}`
          : highlighted
            ? "border-brand bg-surf-selected"
            : "border-edge-secondary bg-surf-tertiary"
      }`}
    >
      {badge && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-fg,#ffffff)] whitespace-nowrap shadow-sm"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          {badge}
        </span>
      )}

      <div className="text-center">
        <h4 className="text-base font-semibold text-txt-primary">{name}</h4>

        <div className="mt-2 flex items-baseline justify-center gap-1.5 flex-wrap">
          {anchor_label && (
            <span
              className={`font-semibold text-txt-muted line-through ${
                compact ? "text-base" : "text-lg"
              }`}
            >
              {anchor_label}
            </span>
          )}
          <span
            className={`font-bold text-txt-primary tracking-tight ${
              compact ? "text-2xl" : "text-3xl"
            }`}
          >
            {price_label}
          </span>
          <span className="text-sm text-txt-muted">{period_label}</span>
          {save_label && (
            <span
              className="ms-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-fg,#ffffff)]"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              {save_label}
            </span>
          )}
        </div>

        <p className="mt-1 h-4 text-xs text-txt-muted">{billed_note || ""}</p>

        {description && (
          <p className="mt-1.5 text-sm text-txt-muted leading-snug">
            {description}
          </p>
        )}
      </div>

      <Button
        className={`w-full ${compact ? "mt-4" : "mt-5"}`}
        disabled={cta_disabled}
        variant={featured && !is_current ? "primary" : "outline"}
        onClick={on_cta}
      >
        {cta_label}
      </Button>

      <div
        className={`border-t ${compact ? "mt-4 pt-4" : "mt-5 pt-5"}`}
        style={{
          borderTopColor: featured
            ? "color-mix(in srgb, var(--accent-color) 40%, transparent)"
            : "var(--border-secondary)",
        }}
      >
        {lead_in && (
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">
            {lead_in}
          </p>
        )}
        <ul className="space-y-2.5 list-none">
          {features.map((feature, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-sm text-txt-secondary"
            >
              {feature.on ? (
                <CheckCircleIcon
                  className="w-[18px] h-[18px] flex-shrink-0 mt-0.5"
                  style={{ color: "var(--accent-blue)" }}
                />
              ) : (
                <XCircleIcon
                  className="w-[18px] h-[18px] flex-shrink-0 mt-0.5"
                  style={{ color: "var(--color-danger)" }}
                />
              )}
              <span>{render_feature_label(feature.label)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: { id: T; label: string; badge?: string }[];
  on_change: (value: T) => void;
}

export function Segmented<T extends string>({
  value,
  options,
  on_change,
}: SegmentedProps<T>) {
  return (
    <div className="inline-flex rounded-full p-1 gap-1 bg-surf-tertiary border border-edge-secondary">
      {options.map((opt) => {
        const active = value === opt.id;

        return (
          <button
            key={opt.id}
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none ${
              active
                ? "text-[var(--accent-fg,#ffffff)]"
                : "text-txt-muted hover:text-txt-secondary"
            }`}
            style={
              active ? { backgroundColor: "var(--accent-blue)" } : undefined
            }
            type="button"
            onClick={() => on_change(opt.id)}
          >
            {opt.label}
            {opt.badge && (
              <span
                className="ms-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={
                  active
                    ? {
                        backgroundColor: "rgba(255,255,255,0.22)",
                        color: "var(--accent-fg, #ffffff)",
                      }
                    : {
                        backgroundColor: "var(--accent-blue)",
                        color: "var(--accent-fg, #ffffff)",
                      }
                }
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
