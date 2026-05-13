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
import type { TranslationKey } from "@/lib/i18n/types";

import { useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  EnvelopeIcon,
  PaperAirplaneIcon,
  InboxIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { use_search } from "@/hooks/use_search";

interface ContactHistoryPanelProps {
  contact_email: string;
}

interface HistoryEntry {
  id: string;
  subject: string;
  timestamp: string;
  is_sent: boolean;
}

function format_relative_date(
  date_string: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(date_string);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return t("common.yesterday");
  if (days < 7) return t("common.x_days_ago", { count: days });
  if (days < 365)
    return date.toLocaleDateString([], { month: "short", day: "numeric" });

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ContactHistoryPanel({
  contact_email,
}: ContactHistoryPanelProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const received = use_search();
  const sent = use_search();

  useEffect(() => {
    if (!contact_email) return;
    received.search(`from:${contact_email}`);
    sent.search(`to:${contact_email}`);
  }, [contact_email]);

  const is_loading =
    received.state.is_searching ||
    received.state.index_building ||
    sent.state.is_searching ||
    sent.state.index_building;

  const error = received.state.error || sent.state.error;

  const activities = useMemo<HistoryEntry[]>(() => {
    const seen = new Set<string>();
    const out: HistoryEntry[] = [];
    for (const r of received.state.results) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({
        id: r.id,
        subject: r.subject,
        timestamp: r.timestamp,
        is_sent: false,
      });
    }
    for (const r of sent.state.results) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({
        id: r.id,
        subject: r.subject,
        timestamp: r.timestamp,
        is_sent: true,
      });
    }
    out.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return out;
  }, [received.state.results, sent.state.results]);

  if (is_loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-edge-primary border-t-txt-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <EnvelopeIcon className="w-10 h-10 mb-4 text-txt-muted" />
          <p className="text-[15px] font-medium mb-1 text-txt-primary">
            {t("common.no_email_history")}
          </p>
          <p className="text-[13px] text-center max-w-[240px] text-txt-muted">
            {t("common.communication_history")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-edge-secondary/60">
          {activities.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className="w-full flex items-center gap-3 px-2 py-2.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] rounded-md transition-colors cursor-pointer"
              onClick={() => {
                const query = encodeURIComponent(`from:${contact_email}`);
                navigate(`/?q=${query}#${activity.id}`);
              }}
            >
              {activity.is_sent ? (
                <PaperAirplaneIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
              ) : (
                <InboxIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[13px] truncate text-txt-primary",
                      !activity.subject && "italic text-txt-muted",
                    )}
                  >
                    {activity.subject || t("mail.no_subject")}
                  </span>
                  <span className="text-[11px] text-txt-muted flex-shrink-0">
                    {format_relative_date(activity.timestamp, t)}
                  </span>
                </div>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  {activity.is_sent ? t("mail.sent") : t("common.received")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
