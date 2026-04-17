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
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { use_i18n } from "@/lib/i18n/context";

export function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
      <Skeleton className="h-3 w-12 flex-shrink-0" />
    </div>
  );
}

export function EmptySearchState({ query }: { query: string }) {
  const { t } = use_i18n();
  const operators = [
    {
      operator: "from:",
      example: "from:john@email.com",
      desc: t("mail.search_by_sender"),
    },
    {
      operator: "has:",
      example: "has:attachment",
      desc: t("mail.filter_by_attachments"),
    },
    { operator: "is:", example: "is:unread", desc: t("mail.filter_by_status") },
    {
      operator: "after:",
      example: "after:2024-01-01",
      desc: t("mail.after_date_search"),
    },
    {
      operator: '"..."',
      example: '"exact phrase"',
      desc: t("mail.search_exact_match"),
    },
  ];

  return (
    <div className="py-6 px-4">
      <div className="text-center mb-5">
        <p className="text-sm font-medium mb-1 text-txt-primary">
          {t("mail.no_results_for", { query })}
        </p>
        <p className="text-xs text-txt-muted">
          {t("mail.try_search_operators")}
        </p>
      </div>
      <div className="rounded-lg p-3 bg-surf-tertiary">
        <p className="text-[10px] font-medium mb-2 text-txt-muted">
          {t("mail.search_operators")}
        </p>
        <div className="space-y-1.5">
          {operators.map((op) => (
            <div
              key={op.operator}
              className="flex items-center justify-between text-[11px]"
            >
              <code className="px-1.5 py-0.5 rounded font-mono bg-surf-card text-txt-secondary">
                {op.example}
              </code>
              <span className="text-txt-muted">{op.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface QuickSearchAction {
  label: string;
  query: string;
  icon: React.ReactNode;
}

export function FirstTimeSearchState({
  on_quick_action,
}: {
  on_quick_action?: (query: string) => void;
}) {
  const { t } = use_i18n();
  const quick_actions: QuickSearchAction[] = useMemo(
    () => [
      {
        label: t("mail.filter_unread"),
        query: "is:unread",
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M22 8.98V18c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h10.1c-.06.32-.1.66-.1 1 0 1.48.65 2.79 1.67 3.71L12 11 4 6v2l8 5 5.3-3.32c.54.2 1.1.32 1.7.32 1.13 0 2.16-.39 3-1.02zM19 3c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
          </svg>
        ),
      },
      {
        label: t("mail.filter_starred"),
        query: "is:starred",
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        ),
      },
      {
        label: t("mail.filter_attachments"),
        query: "has:attachment",
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
          </svg>
        ),
      },
      {
        label: t("mail.filter_this_week"),
        query: "after:7d",
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
          </svg>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="py-8 px-6 text-center">
      <svg
        className="w-10 h-10 mx-auto mb-3 text-txt-muted opacity-50"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <path
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm mb-5 text-txt-muted">
        {t("mail.search_by_sender_subject_content")}
      </p>
      {on_quick_action && (
        <div className="flex flex-wrap justify-center gap-2">
          {quick_actions.map((action) => (
            <button
              key={action.query}
              className="search_filter_btn flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors duration-150 hover:bg-[var(--bg-hover)] border-edge-secondary text-txt-secondary"
              onClick={() => on_quick_action(action.query)}
            >
              <span className="text-txt-muted">{action.icon}</span>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
