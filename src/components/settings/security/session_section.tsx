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
import type { Session } from "@/services/api/sessions";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  FingerPrintIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { Button, Badge } from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

const SESSIONS_PER_PAGE = 5;

interface SessionSectionProps {
  sessions: Session[];
  sessions_loading: boolean;
  sessions_error: string | null;
  on_revoke_session: (session_id: string) => Promise<void>;
  on_revoke_all_sessions: () => Promise<void>;
  logout_others_loading: boolean;
  logout_others_result: { success: boolean; message: string } | null;
}

function get_device_icon(device_type: string) {
  switch (device_type.toLowerCase()) {
    case "mobile":
      return DevicePhoneMobileIcon;
    case "tablet":
      return DeviceTabletIcon;
    case "desktop":
      return ComputerDesktopIcon;
    default:
      return GlobeAltIcon;
  }
}

function format_last_active(date_string: string) {
  const date = new Date(date_string);
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_mins = Math.floor(diff_ms / 60000);
  const diff_hours = Math.floor(diff_ms / 3600000);
  const diff_days = Math.floor(diff_ms / 86400000);

  if (diff_mins < 5) return { key: "settings.active_now" as const, count: 0 };
  if (diff_mins < 60)
    return { key: "settings.minutes_ago" as const, count: diff_mins };
  if (diff_hours < 24)
    return { key: "settings.hours_ago" as const, count: diff_hours };
  if (diff_days < 7)
    return { key: "settings.days_ago" as const, count: diff_days };

  return { key: null, formatted: date.toLocaleDateString() };
}

function format_created_at(date_string: string) {
  const date = new Date(date_string);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SessionSection({
  sessions,
  sessions_loading,
  sessions_error,
  on_revoke_session,
  on_revoke_all_sessions,
  logout_others_loading,
  logout_others_result,
}: SessionSectionProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const [show_confirm_single, set_show_confirm_single] = useState<
    string | null
  >(null);
  const [show_confirm_all, set_show_confirm_all] = useState(false);
  const [revoking_id, set_revoking_id] = useState<string | null>(null);
  const [revoking_all, set_revoking_all] = useState(false);
  const [visible_count, set_visible_count] = useState(SESSIONS_PER_PAGE);

  const other_sessions = sessions.filter((s) => !s.is_current);
  const current_session = sessions.find((s) => s.is_current);
  const sorted_sessions = current_session
    ? [current_session, ...other_sessions]
    : other_sessions;
  const visible_sessions = sorted_sessions.slice(0, visible_count);
  const has_more = sorted_sessions.length > visible_count;

  const handle_revoke_single = async (session_id: string) => {
    set_show_confirm_single(null);
    set_revoking_id(session_id);
    await on_revoke_session(session_id);
    set_revoking_id(null);
  };

  const handle_revoke_all = async () => {
    set_show_confirm_all(false);
    set_revoking_all(true);
    await on_revoke_all_sessions();
    set_revoking_all(false);
    set_visible_count(SESSIONS_PER_PAGE);
  };

  return (
    <div className="pt-3">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <FingerPrintIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.session_security")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      {sessions_loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div>
                  <Skeleton className="h-4 w-36 mb-1.5" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      ) : sessions_error && sessions.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-txt-muted">{sessions_error}</p>
        </div>
      ) : (
        <>
          {sessions_error && (
            <p className="text-sm mb-3 text-red-500">{sessions_error}</p>
          )}

          <div className="space-y-1">
            {visible_sessions.map((session) => {
              const Icon = get_device_icon(session.device_type);

              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between py-3 border-b last:border-b-0 border-edge-secondary"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-5 h-5 text-txt-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-txt-primary flex items-center gap-2 flex-wrap">
                        <span className="truncate">
                          {session.browser} on {session.os}
                        </span>
                        {session.is_current && (
                          <Badge color="blue">
                            {t("settings.this_device")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-txt-muted mt-0.5">
                        {(() => {
                          const active = format_last_active(
                            session.last_active,
                          );

                          return active.key
                            ? t(active.key).replace(
                                "{{count}}",
                                String(active.count),
                              )
                            : active.formatted;
                        })()}
                        {" · "}
                        {t("settings.signed_in_date").replace(
                          "{{date}}",
                          format_created_at(session.created_at),
                        )}
                      </p>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button
                      className="flex-shrink-0 ml-3"
                      disabled={revoking_id === session.id}
                      size="sm"
                      variant="destructive"
                      onClick={() => set_show_confirm_single(session.id)}
                    >
                      {revoking_id === session.id ? (
                        <>
                          <Spinner className="mr-1.5" size="sm" />
                          {t("settings.signing_out")}
                        </>
                      ) : (
                        t("settings.sign_out")
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {has_more && (
            <div className="mt-3">
              <Button
                className="w-full"
                size="sm"
                variant="ghost"
                onClick={() =>
                  set_visible_count((prev) => prev + SESSIONS_PER_PAGE)
                }
              >
                {t("settings.load_more_sessions").replace(
                  "{{count}}",
                  String(sorted_sessions.length - visible_count),
                )}
              </Button>
            </div>
          )}

          {sessions.length === 0 && (
            <p className="text-sm text-txt-muted text-center py-6">
              {t("settings.no_active_sessions")}
            </p>
          )}

          {other_sessions.length > 0 && (
            <div className="mt-4">
              <Button
                className="w-full"
                disabled={revoking_all || logout_others_loading}
                variant="destructive"
                onClick={() => set_show_confirm_all(true)}
              >
                {revoking_all || logout_others_loading ? (
                  <>
                    <Spinner className="mr-2" size="sm" />
                    {t("settings.signing_out")}
                  </>
                ) : (
                  t("settings.sign_out_all_other")
                )}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.sign_out")}
        is_open={show_confirm_single !== null}
        message={t("settings.sign_out_session_confirm")}
        on_cancel={() => set_show_confirm_single(null)}
        on_confirm={() => {
          if (show_confirm_single) {
            handle_revoke_single(show_confirm_single);
          }
        }}
        title={t("settings.session_security")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.sign_out")}
        is_open={show_confirm_all}
        message={t("settings.sign_out_everywhere_confirm")}
        on_cancel={() => set_show_confirm_all(false)}
        on_confirm={handle_revoke_all}
        title={t("settings.session_security")}
        variant="danger"
      />

      <AnimatePresence>
        {logout_others_result && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-2 p-3 rounded-lg text-sm"
            exit={{ opacity: 0, y: -10 }}
            initial={reduce_motion ? false : { opacity: 0, y: -10 }}
            style={{
              backgroundColor: logout_others_result.success
                ? "#16a34a"
                : "#dc2626",
              color: "#fff",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
          >
            {logout_others_result.success ? (
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{logout_others_result.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
