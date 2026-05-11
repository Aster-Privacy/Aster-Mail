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
import type { DecryptedContactActivityEntry } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useCallback, useEffect } from "react";
import {
  EnvelopeIcon,
  PaperAirplaneIcon,
  InboxIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { get_contact_history } from "@/services/api/contact_history";

interface ContactHistoryPanelProps {
  contact_id: string;
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

export function ContactHistoryPanel({ contact_id }: ContactHistoryPanelProps) {
  const { t } = use_i18n();
  const [activities, set_activities] = useState<
    DecryptedContactActivityEntry[]
  >([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_loading_more, set_is_loading_more] = useState(false);
  const [next_cursor, set_next_cursor] = useState<string | null>(null);
  const [has_more, set_has_more] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const load_initial_data = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    try {
      const history_response = await get_contact_history(
        contact_id,
        undefined,
        20,
      );

      if (history_response.data) {
        set_activities(history_response.data.items);
        set_next_cursor(history_response.data.next_cursor);
        set_has_more(history_response.data.has_more);
      } else if (history_response.error) {
        set_error(history_response.error);
      }
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : t("common.failed_to_load_history"),
      );
    } finally {
      set_is_loading(false);
    }
  }, [contact_id, t]);

  useEffect(() => {
    load_initial_data();
  }, [load_initial_data]);

  const handle_load_more = useCallback(async () => {
    if (!next_cursor || is_loading_more) return;

    set_is_loading_more(true);

    try {
      const response = await get_contact_history(contact_id, next_cursor, 20);

      if (response.data) {
        set_activities((prev) => [...prev, ...response.data!.items]);
        set_next_cursor(response.data.next_cursor);
        set_has_more(response.data.has_more);
      }
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : t("common.failed_to_load_more"),
      );
    } finally {
      set_is_loading_more(false);
    }
  }, [contact_id, next_cursor, is_loading_more]);

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-edge-primary border-t-txt-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[13px] text-red-500 mb-3">{error}</p>
        <Button size="md" variant="outline" onClick={load_initial_data}>
          <ArrowPathIcon className="w-4 h-4 mr-1.5" />
          {t("common.retry")}
        </Button>
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
        <div className="rounded-xl border border-edge-secondary bg-surf-secondary divide-y divide-edge-secondary overflow-hidden">
          {activities.map((activity) => {
            const is_sent = activity.activity_type === "email_sent";

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
              >
                <div className="mt-0.5">
                  {is_sent ? (
                    <PaperAirplaneIcon className="w-4 h-4 text-txt-muted" />
                  ) : (
                    <InboxIcon className="w-4 h-4 text-txt-muted" />
                  )}
                </div>
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
                      {format_relative_date(activity.created_at, t)}
                    </span>
                  </div>
                  <p className="text-[11px] uppercase tracking-wider text-txt-muted mt-0.5">
                    {is_sent ? t("mail.sent") : t("common.received")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {has_more && (
        <div className="pt-1 text-center">
          <Button
            className="gap-1.5"
            disabled={is_loading_more}
            size="md"
            variant="outline"
            onClick={handle_load_more}
          >
            {is_loading_more ? (
              <>
                <div className="w-4 h-4 border-2 border-edge-primary border-t-txt-primary rounded-full animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <ArrowPathIcon className="w-4 h-4" />
                {t("common.load_more")}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
