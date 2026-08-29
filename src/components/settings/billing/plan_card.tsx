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

import {
  PLAN_FEATURE_ICONS,
  type PlanFeatureIcon,
} from "@/components/settings/billing/plan_feature_icons";

export interface PlanFeature {
  label: string;
  on: boolean;
  icon?: PlanFeatureIcon;
  description?: string;
}

function render_feature_label(label: string, galaxy = false) {
  const match = label.match(/^(Unlimited|\d[\d.,]*(?:\s?[GMT]B)?)\s+(.*)$/i);

  if (!match) return label;

  return (
    <>
      <strong
        className={`font-semibold ${
          galaxy ? "plan_galaxy_text_primary" : "text-txt-primary"
        }`}
      >
        {match[1]}
      </strong>{" "}
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
  const galaxy = featured && !is_current;
  const heading_cls = galaxy ? "plan_galaxy_text_primary" : "text-txt-primary";
  const muted_cls = galaxy ? "plan_galaxy_text_muted" : "text-txt-muted";
  const body_cls = galaxy ? "plan_galaxy_text_body" : "text-txt-secondary";
  const icon_cls = galaxy ? "plan_galaxy_text_muted" : "text-txt-muted";

  return (
    <div
      className={`relative flex flex-col rounded-2xl border transition-colors ${
        compact ? "p-4" : "p-6"
      } ${
        galaxy
          ? `plan_galaxy z-10 ${compact ? "" : "sm:-my-2 sm:py-8"}`
          : is_current
            ? "border-edge-primary bg-surf-tertiary"
            : "border-edge-secondary bg-surf-tertiary"
      }`}
    >
      {badge && (
        <span
          className={`absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
            is_current ? "plan_current_badge" : "plan_galaxy_badge"
          }`}
        >
          {badge}
        </span>
      )}

      <div className="text-center">
        <h4 className={`text-base font-semibold ${heading_cls}`}>{name}</h4>

        <div className="mt-2 flex items-baseline justify-center gap-1.5 flex-wrap">
          {anchor_label && (
            <span
              className={`font-semibold line-through ${muted_cls} ${
                compact ? "text-base" : "text-lg"
              }`}
            >
              {anchor_label}
            </span>
          )}
          <span
            className={`font-bold tracking-tight ${heading_cls} ${
              compact ? "text-2xl" : "text-3xl"
            }`}
          >
            {price_label}
          </span>
          <span className={`text-sm ${muted_cls}`}>{period_label}</span>
          {save_label && (
            <span
              className={`ms-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                galaxy ? "plan_galaxy_badge" : ""
              }`}
              style={
                galaxy
                  ? undefined
                  : {
                      backgroundColor: "var(--accent-blue)",
                      color: "var(--accent-fg, #ffffff)",
                    }
              }
            >
              {save_label}
            </span>
          )}
        </div>

        <p className={`mt-1 h-4 text-xs ${muted_cls}`}>{billed_note || ""}</p>

        {description && (
          <p className={`mt-1.5 text-sm leading-snug ${muted_cls}`}>
            {description}
          </p>
        )}
      </div>

      <Button
        className={`w-full ${compact ? "mt-4" : "mt-5"} ${
          galaxy ? "plan_galaxy_cta" : ""
        }`}
        disabled={cta_disabled}
        variant={galaxy ? "primary" : "outline"}
        onClick={on_cta}
      >
        {cta_label}
      </Button>

      <div
        className={`border-t ${compact ? "mt-4 pt-4" : "mt-5 pt-5"} ${
          galaxy ? "plan_galaxy_divider" : ""
        }`}
        style={
          galaxy ? undefined : { borderTopColor: "var(--border-secondary)" }
        }
      >
        {lead_in && (
          <p
            className={`mb-3 text-[11px] font-semibold uppercase tracking-wide ${muted_cls}`}
          >
            {lead_in}
          </p>
        )}
        <ul className="space-y-3 list-none">
          {features.map((feature, i) => {
            const Icon = feature.on
              ? feature.icon
                ? PLAN_FEATURE_ICONS[feature.icon]
                : CheckCircleIcon
              : XCircleIcon;

            return (
              <li key={i} className="flex items-start gap-3 text-sm">
                <Icon
                  className={`w-[17px] h-[17px] flex-shrink-0 mt-[3px] ${
                    feature.on ? icon_cls : ""
                  }`}
                  style={
                    feature.on ? undefined : { color: "var(--color-danger)" }
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className={`block leading-snug ${body_cls}`}>
                    {render_feature_label(feature.label, galaxy)}
                  </span>
                  {feature.description && (
                    <span
                      className={`mt-1 block text-xs leading-snug ${muted_cls}`}
                    >
                      {feature.description}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
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
    <div
      className="grid w-full max-w-xs rounded-full p-1 gap-1 bg-surf-tertiary border border-edge-secondary"
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
