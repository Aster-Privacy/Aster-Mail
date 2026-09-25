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
import { Skeleton } from "@/components/ui/skeleton";

export const BILLING_CARD_CLASS =
  "rounded-xl border border-edge-secondary bg-surf-primary";

function MeterRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-[18px] w-[18px] rounded-full" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
        <Skeleton className="h-3 w-16 rounded" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-3 w-28 rounded" />
    </div>
  );
}

export function BillingHeroSkeleton() {
  return (
    <div className={`${BILLING_CARD_CLASS} p-5`}>
      <div className="flex items-center gap-2">
        <Skeleton className="h-[18px] w-16 rounded" />
        <Skeleton className="h-6 w-20 rounded" />
      </div>
      <Skeleton className="mt-2 h-4 w-16 rounded" />
      <Skeleton className="mt-4 h-7 w-24 rounded" />
      <Skeleton className="mt-2 h-3.5 w-40 rounded" />
      <Skeleton className="mt-5 h-11 w-full rounded-xl" />
    </div>
  );
}

export function BillingMetersSkeleton() {
  return (
    <div className={`${BILLING_CARD_CLASS} py-1`}>
      <MeterRowSkeleton />
      <MeterRowSkeleton />
      <MeterRowSkeleton />
    </div>
  );
}

export function BillingRowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className={`${BILLING_CARD_CLASS} py-1`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex min-h-[54px] items-center gap-3 px-4">
          <Skeleton className="h-[18px] w-[18px] rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="mt-1.5 h-3 w-20 rounded" />
          </div>
          <Skeleton className="h-4 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

export function BillingOptionRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={`${BILLING_CARD_CLASS} p-1`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex min-h-[54px] items-center gap-3 px-3">
          <Skeleton className="h-[22px] w-[22px] rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="mt-1.5 h-3 w-36 rounded" />
          </div>
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export function BillingHistorySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={`${BILLING_CARD_CLASS} py-1`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="mt-1.5 h-3 w-24 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-10 rounded" />
            <Skeleton className="h-4 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BillingSectionSkeleton() {
  return (
    <div className="space-y-6">
      <BillingHeroSkeleton />
      <BillingMetersSkeleton />
      <BillingRowsSkeleton />
      <div className="space-y-3">
        <Skeleton className="h-11 w-full rounded-xl" />
        <BillingOptionRowsSkeleton />
        <BillingOptionRowsSkeleton rows={2} />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <BillingOptionRowsSkeleton rows={4} />
      <BillingHistorySkeleton />
    </div>
  );
}
