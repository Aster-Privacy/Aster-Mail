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
import { Button, Island } from "@aster/ui";

import {
  PLAN_FEATURE_ICONS,
  type PlanFeatureIcon,
} from "@/components/settings/billing/plan_feature_icons";
import { InfoPopover } from "@/components/ui/info_popover";

export interface PlanFeature {
  label: string;
  on: boolean;
  icon?: PlanFeatureIcon;
  description?: string;
  info?: string;
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
  const highlighted = featured && !is_current;

  return (
    <Island
      className={`flex h-full flex-col ${compact ? "p-5" : "p-6"}`}
      selected={is_current}
      tone={highlighted ? "accent" : "default"}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h4 className="text-[15px] font-semibold text-txt-primary">{name}</h4>
        {badge && (
          <span
            className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor: "var(--accent-color)",
              color: "var(--accent-fg, #ffffff)",
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        {anchor_label && (
          <span className="text-base font-medium text-txt-muted line-through">
            {anchor_label}
          </span>
        )}
        <span
          className={`font-bold tracking-tight tabular-nums text-txt-primary ${
            compact ? "text-[28px] leading-9" : "text-3xl"
          }`}
        >
          {price_label}
        </span>
        <span className="text-sm text-txt-muted">{period_label}</span>
        {save_label && (
          <span
            className="ms-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent-color) 14%, transparent)",
              color: "var(--accent-color)",
            }}
          >
            {save_label}
          </span>
        )}
      </div>

      {billed_note != null && (
        <p className="mt-1 min-h-4 text-xs text-txt-muted">
          {billed_note || "\u00a0"}
        </p>
      )}

      {description && (
        <p className="mt-2 text-sm leading-snug text-txt-muted">
          {description}
        </p>
      )}

      <Button
        className={`w-full ${compact ? "mt-4" : "mt-5"}`}
        disabled={cta_disabled}
        variant={highlighted ? "primary" : "secondary"}
        onClick={on_cta}
      >
        {cta_label}
      </Button>

      <div
        aria-hidden="true"
        className={`h-px ${compact ? "my-4" : "my-5"}`}
        style={{ backgroundColor: "var(--aster-island-divider)" }}
      />

      <div className="flex-1">
        {lead_in != null && (
          <p
            aria-hidden={lead_in ? undefined : true}
            className="mb-3 min-h-4 text-xs font-medium text-txt-muted"
          >
            {lead_in || "\u00a0"}
          </p>
        )}
        <ul className="list-none space-y-2.5">
          {features.map((feature, i) => {
            const Icon = feature.on
              ? feature.icon
                ? PLAN_FEATURE_ICONS[feature.icon]
                : CheckCircleIcon
              : XCircleIcon;

            return (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                <Icon
                  className="mt-px h-4 w-4 flex-shrink-0"
                  style={{
                    color: feature.on
                      ? "var(--accent-color)"
                      : "var(--color-danger)",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug text-txt-secondary">
                    {render_feature_label(feature.label)}
                    {feature.info && (
                      <span className="ms-1.5 inline-flex align-middle">
                        <InfoPopover
                          description={feature.info}
                          icon_class="w-3.5 h-3.5"
                          title={feature.label}
                        />
                      </span>
                    )}
                  </span>
                  {feature.description && (
                    <span className="mt-1 block text-xs leading-snug text-txt-muted">
                      {feature.description}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Island>
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
    <div
      className="grid w-full max-w-xs gap-1 rounded-full bg-surf-secondary p-1"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.id;

        return (
          <button
            key={opt.id}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none whitespace-nowrap ${
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

export function Tabs<T extends string>({
  value,
  options,
  on_change,
}: SegmentedProps<T>) {
  return (
    <div className="w-full max-w-xs">
      <div
        className="grid w-full border-b border-edge-secondary"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((opt) => {
          const active = value === opt.id;

          return (
            <button
              key={opt.id}
              className={`relative px-4 pt-1 pb-2.5 text-sm font-semibold transition-colors focus:outline-none whitespace-nowrap ${
                active
                  ? "text-txt-primary"
                  : "text-txt-muted hover:text-txt-secondary"
              }`}
              type="button"
              onClick={() => on_change(opt.id)}
            >
              {opt.label}
              <span
                className="absolute start-0 end-0 -bottom-px h-0.5 rounded-full transition-opacity"
                style={{
                  backgroundColor: "var(--accent-blue)",
                  opacity: active ? 1 : 0,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
