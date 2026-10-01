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
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Island, IslandDivider, Skeleton } from "@aster/ui";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

export function family_row_icon(Icon: ComponentType<SVGProps<SVGSVGElement>>) {
  return <Icon className="h-[22px] w-[22px]" />;
}

export function FamilyPageHeader({
  title,
  description,
  on_back,
  trailing,
}: {
  title: ReactNode;
  description?: ReactNode;
  on_back: () => void;
  trailing?: ReactNode;
}) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-col gap-3">
      <button
        className="inline-flex h-8 w-fit items-center gap-1 rounded-full pe-3 ps-1.5 text-[13px] font-medium text-txt-secondary transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary"
        type="button"
        onClick={on_back}
      >
        <ChevronLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
        {t("settings.fam_org_back_to_family")}
      </button>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[21px] font-bold leading-7 tracking-[-0.02em] text-txt-primary">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[13px] text-txt-muted">{description}</p>
          )}
        </div>
        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>
    </div>
  );
}

export function FamilyCreateBar({
  children,
  class_name = "",
}: {
  children: ReactNode;
  class_name?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 sm:flex-row sm:items-center [&>*]:min-w-0 ${class_name}`}
    >
      {children}
    </div>
  );
}

export function FamilyStatusText({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "muted";
  children: ReactNode;
}) {
  const color =
    tone === "muted" ? "var(--text-muted)" : `var(--color-${tone})`;

  return (
    <span className="text-[14px] font-semibold" style={{ color }}>
      {children}
    </span>
  );
}

export function use_family_seat_breakdown() {
  const { t } = use_i18n();

  return (breakdown: {
    active_members: number;
    pending_invites: number;
    reserved_addresses: number;
  }): string => {
    const parts = [
      t("settings.fam_org_n_members", { count: breakdown.active_members }),
    ];

    if (breakdown.pending_invites > 0)
      parts.push(
        t("settings.fam_org_n_invites", { count: breakdown.pending_invites }),
      );
    if (breakdown.reserved_addresses > 0)
      parts.push(
        t("settings.fam_org_n_reserved", {
          count: breakdown.reserved_addresses,
        }),
      );
    return parts.join(", ");
  };
}

export function FamilyMeter({
  label,
  value,
  percent,
  trailing,
  tone = "accent",
}: {
  label: ReactNode;
  value: string;
  percent: number;
  trailing?: ReactNode;
  tone?: "accent" | "danger";
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[14px] font-medium text-txt-primary">
          {label}
        </span>
        <div className="flex flex-shrink-0 items-baseline gap-3">
          <span className="text-[13px] tabular-nums text-txt-muted">
            {value}
          </span>
          {trailing}
        </div>
      </div>
      <div
        aria-label={value}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(clamped)}
        className="h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--text-primary) 10%, transparent)",
        }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${clamped}%`,
            backgroundColor:
              tone === "danger" ? "var(--color-danger)" : "var(--accent-color)",
          }}
        />
      </div>
    </div>
  );
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3.5 px-4 py-3">
      <Skeleton className="flex-shrink-0" height={22} variant="circular" width={22} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton height={12} width={`${38 + (index % 3) * 12}%`} />
        <Skeleton height={10} width={`${22 + (index % 2) * 14}%`} />
      </div>
      <Skeleton height={10} width={36} />
    </div>
  );
}

export function FamilySkeletonRows({ count }: { count: number }) {
  return (
    <Island className="overflow-hidden" padding="none">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          {i > 0 && <IslandDivider />}
          <SkeletonRow index={i} />
        </div>
      ))}
    </Island>
  );
}

export function FamilySkeleton() {
  return (
    <div aria-busy="true" className="flex w-full min-w-0 flex-col gap-4">
      <Island padding="none">
        <div className="mx-2 mt-2 h-[88px] rounded-[var(--aster-radius-field)] bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]" />
        <div className="flex flex-col gap-5 px-5 pb-5 pt-4">
          <div className="flex flex-col gap-2">
            <Skeleton height={22} width="42%" />
            <Skeleton height={12} width="28%" />
          </div>
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <Skeleton height={12} width="24%" />
                  <Skeleton height={12} width="20%" />
                </div>
                <Skeleton height={6} width="100%" />
              </div>
            ))}
          </div>
        </div>
      </Island>
      <Skeleton className="ms-1" height={11} width={72} />
      <FamilySkeletonRows count={4} />
      <Skeleton className="ms-1" height={11} width={72} />
      <FamilySkeletonRows count={5} />
    </div>
  );
}
