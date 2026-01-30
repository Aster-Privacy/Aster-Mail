import type {
  DecryptedContactActivityEntry,
  ContactEmailStats,
} from "@/types/contacts";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  EnvelopeIcon,
  PaperAirplaneIcon,
  InboxIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  get_contact_history,
  get_contact_stats,
} from "@/services/api/contact_history";

interface ContactHistoryPanelProps {
  contact_id: string;
}

function format_date(date_string: string): string {
  const date = new Date(date_string);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30)
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function format_stat_date(date_string?: string): string {
  if (!date_string) return "Never";
  const date = new Date(date_string);
  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ContactHistoryPanel({ contact_id }: ContactHistoryPanelProps) {
  const [activities, set_activities] = useState<DecryptedContactActivityEntry[]>(
    [],
  );
  const [stats, set_stats] = useState<ContactEmailStats | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [is_loading_more, set_is_loading_more] = useState(false);
  const [next_cursor, set_next_cursor] = useState<string | null>(null);
  const [has_more, set_has_more] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [show_stats, set_show_stats] = useState(true);

  const load_initial_data = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    try {
      const [history_response, stats_response] = await Promise.all([
        get_contact_history(contact_id, undefined, 20),
        get_contact_stats(contact_id),
      ]);

      if (history_response.data) {
        set_activities(history_response.data.items);
        set_next_cursor(history_response.data.next_cursor);
        set_has_more(history_response.data.has_more);
      }

      if (stats_response.data) {
        set_stats(stats_response.data);
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      set_is_loading(false);
    }
  }, [contact_id]);

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
      set_error(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      set_is_loading_more(false);
    }
  }, [contact_id, next_cursor, is_loading_more]);

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-danger mb-3">{error}</p>
        <Button variant="ghost" size="sm" onClick={load_initial_data}>
          <ArrowPathIcon className="w-4 h-4 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground-600">
          Communication History
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => set_show_stats(!show_stats)}
          className="gap-1.5"
        >
          <ChartBarIcon className="w-4 h-4" />
          {show_stats ? "Hide" : "Show"} Stats
        </Button>
      </div>

      <AnimatePresence>
        {show_stats && stats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-2 gap-3"
          >
            <div className="bg-default-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <PaperAirplaneIcon className="w-4 h-4 text-primary" />
                <span className="text-xs text-foreground-500">Sent</span>
              </div>
              <p className="text-2xl font-semibold">{stats.total_sent}</p>
              <p className="text-xs text-foreground-400 mt-1">
                Last: {format_stat_date(stats.last_sent_at)}
              </p>
            </div>

            <div className="bg-default-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <InboxIcon className="w-4 h-4 text-success" />
                <span className="text-xs text-foreground-500">Received</span>
              </div>
              <p className="text-2xl font-semibold">{stats.total_received}</p>
              <p className="text-xs text-foreground-400 mt-1">
                Last: {format_stat_date(stats.last_received_at)}
              </p>
            </div>

            {stats.first_contact_at && (
              <div className="col-span-2 bg-default-50 rounded-lg p-2 text-center">
                <p className="text-xs text-foreground-500">
                  First contact: {format_stat_date(stats.first_contact_at)}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1">
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <EnvelopeIcon className="w-10 h-10 mx-auto text-foreground-300 mb-3" />
            <p className="text-sm text-foreground-500">
              No email history with this contact yet
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {activities.map((activity, index) => {
              const is_sent = activity.activity_type === "email_sent";
              const prev_activity = activities[index - 1];
              const show_date_divider =
                index === 0 ||
                (prev_activity &&
                  new Date(activity.created_at).toDateString() !==
                    new Date(prev_activity.created_at).toDateString());

              return (
                <motion.div key={activity.id}>
                  {show_date_divider && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-divider" />
                      <span className="text-xs text-foreground-400">
                        {new Date(activity.created_at).toLocaleDateString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex-1 h-px bg-divider" />
                    </div>
                  )}

                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className={cn(
                      "flex items-start gap-3 p-2 rounded-lg hover:bg-default-50 transition-colors cursor-pointer",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        is_sent ? "bg-primary/10" : "bg-success/10",
                      )}
                    >
                      {is_sent ? (
                        <PaperAirplaneIcon
                          className={cn("w-4 h-4", "text-primary")}
                        />
                      ) : (
                        <InboxIcon className={cn("w-4 h-4", "text-success")} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            is_sent ? "text-primary" : "text-success",
                          )}
                        >
                          {is_sent ? "Sent" : "Received"}
                        </span>
                        <span className="text-xs text-foreground-400">
                          {format_date(activity.created_at)}
                        </span>
                      </div>
                      {activity.subject ? (
                        <p className="text-sm truncate mt-0.5">
                          {activity.subject}
                        </p>
                      ) : (
                        <p className="text-sm text-foreground-400 italic mt-0.5">
                          No subject
                        </p>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {has_more && (
          <div className="pt-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handle_load_more}
              disabled={is_loading_more}
              className="gap-1.5"
            >
              {is_loading_more ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="w-4 h-4" />
                  Load More
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
