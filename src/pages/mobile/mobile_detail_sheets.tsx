//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type { UserPreferences } from "@/services/api/preferences";
import type { TranslationKey } from "@/lib/i18n";

import {
  StarIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  PrinterIcon,
  CodeBracketIcon,
  ShieldExclamationIcon,
  ShieldCheckIcon,
  ClipboardDocumentIcon,
  NoSymbolIcon,
  AdjustmentsHorizontalIcon,
  HandRaisedIcon,
  BellSnoozeIcon,
  MoonIcon,
  SunIcon,
  InformationCircleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import {
  addHours,
  addDays,
  setHours,
  setMinutes,
  nextSaturday,
  nextMonday,
  format,
} from "date-fns";

import { format_safe_date } from "./mobile_thread_message";
import {
  TOOLBAR_ACTION_MAP,
  ALL_TOOLBAR_ACTION_IDS,
  DEFAULT_TOOLBAR,
} from "./mobile_detail_toolbar";

import { use_i18n } from "@/lib/i18n/context";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { show_toast } from "@/components/toast/simple_toast";
import { format_bytes } from "@/lib/utils";
import { EncryptionInfoDropdown } from "@/components/common/encryption_info_dropdown";

export function MobileActionMenuSheet({
  menu_message,
  menu_source,
  on_close,
  on_reply,
  on_reply_all,
  on_forward,
  on_toggle_star,
  on_toggle_read,
  on_snooze,
  on_archive,
  on_spam,
  on_not_spam,
  is_spam,
  on_trash,
  on_toggle_dark_mode,
  on_toggle_all_dark_mode,
  on_print,
  on_view_source,
  on_copy_id,
  on_message_details,
  on_block,
  on_report_phishing,
  on_customize_toolbar,
  is_starred,
  is_all_dark,
  dark_mode_ids,
  preferences_force_dark: preferences_force_dark_mode,
  format_detail,
  t,
}: {
  menu_message: DecryptedThreadMessage | null;
  menu_source: "message" | "toolbar";
  on_close: () => void;
  on_reply: () => void;
  on_reply_all: () => void;
  on_forward: () => void;
  on_toggle_star: () => void;
  on_toggle_read: () => void;
  on_snooze: () => void;
  on_archive: () => void;
  on_spam: () => void;
  on_not_spam: () => void;
  is_spam: boolean;
  on_trash: () => void;
  on_toggle_dark_mode: () => void;
  on_toggle_all_dark_mode: () => void;
  on_print: () => void;
  on_view_source: () => void;
  on_copy_id: () => void;
  on_message_details: () => void;
  on_block: () => void;
  on_report_phishing: () => void;
  on_customize_toolbar: () => void;
  is_starred: boolean;
  is_all_dark: boolean;
  dark_mode_ids: Set<string>;
  preferences_force_dark: boolean;
  format_detail: (date: Date) => string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <MobileBottomSheet is_open={!!menu_message} on_close={on_close}>
      <div className="px-4 pb-4">
        {menu_message && (
          <div className="mb-3 flex items-center gap-3">
            <ProfileAvatar
              use_domain_logo
              email={menu_message.sender_email}
              name={menu_message.sender_name}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                {menu_message.sender_name}
              </p>
              <p className="truncate text-[12px] text-[var(--text-muted)]">
                {format_safe_date(menu_message.timestamp, format_detail)}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_reply}
          >
            <ArrowUturnLeftIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.reply")}
            </span>
          </button>
          {menu_message &&
            (menu_message.to_recipients?.length ?? 0) +
              (menu_message.cc_recipients?.length ?? 0) >=
              2 && (
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
                type="button"
                onClick={on_reply_all}
              >
                <ArrowUturnLeftIcon className="h-5 w-5 text-[var(--text-muted)]" />
                <span className="text-[14px] text-[var(--text-primary)]">
                  {t("mail.reply_all")}
                </span>
              </button>
            )}
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_forward}
          >
            <ArrowUturnRightIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.forward")}
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--border-primary)]" />

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_toggle_star}
          >
            {is_starred ? (
              <StarSolidIcon className="h-5 w-5 text-amber-400" />
            ) : (
              <StarIcon className="h-5 w-5 text-[var(--text-muted)]" />
            )}
            <span className="text-[14px] text-[var(--text-primary)]">
              {is_starred ? t("mail.unstar") : t("mail.star")}
            </span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_toggle_read}
          >
            {menu_message?.is_read ? (
              <EnvelopeIcon className="h-5 w-5 text-[var(--text-muted)]" />
            ) : (
              <EnvelopeOpenIcon className="h-5 w-5 text-[var(--text-muted)]" />
            )}
            <span className="text-[14px] text-[var(--text-primary)]">
              {menu_message?.is_read
                ? t("mail.mark_unread")
                : t("mail.mark_read")}
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--border-primary)]" />

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_snooze}
          >
            <BellSnoozeIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("common.snooze_label")}
            </span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_archive}
          >
            <ArchiveBoxIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.archive")}
            </span>
          </button>
          {is_spam ? (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={on_not_spam}
            >
              <ShieldCheckIcon className="h-5 w-5 text-emerald-500" />
              <span className="text-[14px] text-[var(--text-primary)]">
                {t("mail.not_spam")}
              </span>
            </button>
          ) : (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={on_spam}
            >
              <NoSymbolIcon className="h-5 w-5 text-[var(--text-muted)]" />
              <span className="text-[14px] text-[var(--text-primary)]">
                {t("mail.report_spam")}
              </span>
            </button>
          )}
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_trash}
          >
            <TrashIcon className="h-5 w-5 text-[var(--color-danger,#ef4444)]" />
            <span className="text-[14px] text-[var(--color-danger,#ef4444)]">
              {t("mail.move_to_trash")}
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--border-primary)]" />

          {menu_source === "message" && (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={on_toggle_dark_mode}
            >
              {menu_message &&
              (preferences_force_dark_mode ||
                dark_mode_ids.has(menu_message.id)) ? (
                <SunIcon className="h-5 w-5 text-[var(--text-muted)]" />
              ) : (
                <MoonIcon className="h-5 w-5 text-[var(--text-muted)]" />
              )}
              <span className="text-[14px] text-[var(--text-primary)]">
                {menu_message &&
                (preferences_force_dark_mode ||
                  dark_mode_ids.has(menu_message.id))
                  ? t("mail.exit_dark_mode")
                  : t("mail.view_dark_mode")}
              </span>
            </button>
          )}
          {menu_source === "toolbar" && (
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={on_toggle_all_dark_mode}
            >
              {is_all_dark ? (
                <SunIcon className="h-5 w-5 text-[var(--text-muted)]" />
              ) : (
                <MoonIcon className="h-5 w-5 text-[var(--text-muted)]" />
              )}
              <span className="text-[14px] text-[var(--text-primary)]">
                {is_all_dark
                  ? t("mail.exit_all_dark_mode")
                  : t("mail.view_all_dark_mode")}
              </span>
            </button>
          )}
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_print}
          >
            <PrinterIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.print")}
            </span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_view_source}
          >
            <CodeBracketIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.view_source")}
            </span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_copy_id}
          >
            <ClipboardDocumentIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.copy_message_id")}
            </span>
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_message_details}
          >
            <InformationCircleIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("mail.message_details")}
            </span>
          </button>

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_block}
          >
            <HandRaisedIcon className="h-5 w-5 text-[var(--color-danger,#ef4444)]" />
            <span className="text-[14px] text-[var(--color-danger,#ef4444)]">
              {t("mail.block_sender")}
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--border-primary)]" />

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_report_phishing}
          >
            <ShieldExclamationIcon className="h-5 w-5 text-amber-500" />
            <span className="text-[14px] text-amber-500">
              {t("common.report_phishing")}
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--border-primary)]" />

          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={on_customize_toolbar}
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="text-[14px] text-[var(--text-primary)]">
              {t("settings.customize_toolbar")}
            </span>
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
}

export function MobileViewSourceSheet({
  message,
  on_close,
  t,
}: {
  message: DecryptedThreadMessage | null;
  on_close: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <MobileBottomSheet is_open={!!message} on_close={on_close}>
      <div className="px-4 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
            {t("mail.view_source")}
          </h3>
          <button
            className="rounded-lg px-2.5 py-1 text-[13px] font-medium text-[var(--accent-color,#3b82f6)] active:opacity-70"
            type="button"
            onClick={() => {
              if (message) {
                const source = message.html_content || message.body || "";

                navigator.clipboard
                  .writeText(source)
                  .then(() => {
                    show_toast(t("common.copied"), "success");
                  })
                  .catch(() => {});
              }
            }}
          >
            {t("common.copy")}
          </button>
        </div>
        <pre className="max-h-[60vh] overflow-auto rounded-xl bg-[var(--bg-tertiary)] p-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {message?.html_content || message?.body || ""}
        </pre>
      </div>
    </MobileBottomSheet>
  );
}

export function MobileSnoozeSheet({
  is_open,
  on_close,
  on_snooze,
}: {
  is_open: boolean;
  on_close: () => void;
  on_snooze: (date: Date) => void;
}) {
  const { t } = use_i18n();

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("common.snooze_label")}
        </h3>
        <div className="space-y-1">
          {[
            {
              label: t("mail.later_today_snooze"),
              date: addHours(new Date(), 4),
            },
            {
              label: t("mail.tomorrow_snooze"),
              date: setMinutes(setHours(addDays(new Date(), 1), 9), 0),
            },
            {
              label: t("mail.this_weekend_snooze"),
              date: setMinutes(setHours(nextSaturday(new Date()), 9), 0),
            },
            {
              label: t("mail.next_week_snooze"),
              date: setMinutes(setHours(nextMonday(new Date()), 9), 0),
            },
            {
              label: t("mail.next_month_snooze"),
              date: setMinutes(setHours(addDays(new Date(), 30), 9), 0),
            },
          ].map((opt) => (
            <button
              key={opt.label}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-[var(--bg-tertiary)]"
              type="button"
              onClick={() => on_snooze(opt.date)}
            >
              <BellSnoozeIcon className="h-5 w-5 text-[var(--text-muted)]" />
              <div className="flex-1">
                <p className="text-[14px] font-medium text-[var(--text-primary)]">
                  {opt.label}
                </p>
                <p className="text-[12px] text-[var(--text-muted)]">
                  {format(opt.date, "EEE, MMM d 'at' h:mm a")}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </MobileBottomSheet>
  );
}

export function MobileToolbarCustomizerSheet({
  is_open,
  on_close,
  preferences_toolbar_actions,
  update_preference,
  t,
}: {
  is_open: boolean;
  on_close: () => void;
  preferences_toolbar_actions?: string[];
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-4 pb-4" style={{ minHeight: 320 }}>
        <h3 className="mb-1 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("settings.customize_toolbar")}
        </h3>
        <p className="mb-4 text-[13px] text-[var(--text-muted)]">
          {t("settings.customize_toolbar_description")}
        </p>

        {(["quick", "organize"] as const).map((group) => {
          const group_label =
            group === "quick"
              ? t("settings.toolbar_section_quick_actions")
              : t("settings.toolbar_section_organize");
          const group_actions = ALL_TOOLBAR_ACTION_IDS.filter(
            (id) => TOOLBAR_ACTION_MAP[id].group === group,
          );

          return (
            <div key={group} className="mb-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group_label}
              </p>
              <div className="space-y-1">
                {group_actions.map((id) => {
                  const config = TOOLBAR_ACTION_MAP[id];
                  const current =
                    preferences_toolbar_actions ?? DEFAULT_TOOLBAR;
                  const is_active = current.includes(id);
                  const Icon = config.icon;

                  return (
                    <button
                      key={id}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 active:bg-[var(--bg-tertiary)]"
                      type="button"
                      onClick={() => {
                        if (is_active && current.length <= 1) return;
                        const next = is_active
                          ? current.filter((a) => a !== id)
                          : [...current, id];

                        update_preference("mobile_toolbar_actions", next, true);
                      }}
                    >
                      <Icon
                        className={`h-5 w-5 ${config.is_danger ? "text-[var(--color-danger,#ef4444)]" : "text-[var(--text-muted)]"}`}
                      />
                      <span className="flex-1 text-left text-[14px] text-[var(--text-primary)]">
                        {t(config.label_key as TranslationKey)}
                      </span>
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-md ${
                          is_active
                            ? ""
                            : "border border-[var(--border-primary)]"
                        }`}
                        style={
                          is_active
                            ? {
                                background:
                                  "linear-gradient(180deg, var(--accent-color, #3b82f6) 0%, var(--accent-color-hover, #2563eb) 100%)",
                                boxShadow:
                                  "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                              }
                            : undefined
                        }
                      >
                        {is_active && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 12 12"
                          >
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          {t("settings.toolbar_dots_hint")}
        </p>
      </div>
    </MobileBottomSheet>
  );
}

function build_message_headers(message: DecryptedThreadMessage): string {
  const lines: string[] = [];

  lines.push(`From: ${message.sender_name} <${message.sender_email}>`);

  if (message.to_recipients && message.to_recipients.length > 0) {
    const to_value = message.to_recipients
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join(", ");

    lines.push(`To: ${to_value}`);
  }

  lines.push(`Subject: ${message.subject}`);
  lines.push(`Date: ${new Date(message.timestamp).toUTCString()}`);
  lines.push(`Message-ID: <${message.id}@astermail.org>`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: text/html`);
  lines.push(`X-Mailer: AsterMail/1.0`);

  return lines.join("\n");
}

function get_mobile_location_label(
  message: DecryptedThreadMessage,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (message.is_deleted) return t("mail.trashed_label");
  if (message.item_type === "sent") return t("mail.sent_label");
  if (message.item_type === "draft") return t("mail.draft");

  return t("common.mail");
}

export function MobileMessageDetailsSheet({
  message,
  on_close,
  size_bytes,
  format_detail,
  t,
}: {
  message: DecryptedThreadMessage | null;
  on_close: () => void;
  size_bytes?: number;
  format_detail: (date: Date) => string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const headers = message ? build_message_headers(message) : "";

  const handle_copy_headers = () => {
    navigator.clipboard
      .writeText(headers)
      .then(() => {
        show_toast(t("mail.headers_copied"), "success");
      })
      .catch(() => {});
  };

  const handle_download_headers = () => {
    if (!message) return;

    const blob = new Blob([headers], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `headers-${message.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <MobileBottomSheet is_open={!!message} on_close={on_close}>
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("mail.message_details")}
        </h3>

        {message && (
          <div className="space-y-2.5 mb-4">
            <div className="flex">
              <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.from_label")}
              </span>
              <span className="min-w-0 text-[12px] text-[var(--text-secondary)] break-all">
                {message.sender_name} &lt;{message.sender_email}&gt;
              </span>
            </div>

            {message.to_recipients && message.to_recipients.length > 0 && (
              <div className="flex">
                <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                  {t("common.to_label")}
                </span>
                <span className="min-w-0 text-[12px] text-[var(--text-secondary)] break-all">
                  {message.to_recipients
                    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
                    .join(", ")}
                </span>
              </div>
            )}

            <div className="flex">
              <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.date_label")}
              </span>
              <span className="text-[12px] text-[var(--text-secondary)]">
                {format_safe_date(message.timestamp, format_detail)}
              </span>
            </div>

            <div className="flex">
              <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                {t("common.subject_label")}
              </span>
              <span className="min-w-0 text-[12px] text-[var(--text-secondary)] break-words">
                {message.subject}
              </span>
            </div>

            <div className="flex">
              <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                {t("mail.message_id_label")}
              </span>
              <span className="min-w-0 text-[12px] text-[var(--text-secondary)] break-all">
                &lt;{message.id}@astermail.org&gt;
              </span>
            </div>

            {size_bytes != null && size_bytes > 0 && (
              <div className="flex">
                <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                  {t("mail.size_label")}
                </span>
                <span className="text-[12px] text-[var(--text-secondary)]">
                  {format_bytes(size_bytes)}
                </span>
              </div>
            )}

            <div className="flex">
              <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                {t("mail.location_label")}
              </span>
              <span className="text-[12px] text-[var(--text-secondary)]">
                {get_mobile_location_label(message, t)}
              </span>
            </div>

            <div className="flex items-center">
              <span className="w-20 flex-shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
                {t("mail.encryption_label")}
              </span>
              <EncryptionInfoDropdown
                has_pq_protection={false}
                has_recipient_key={message.has_recipient_key}
                is_external={message.is_external}
                label={
                  message.is_external && !message.has_recipient_key
                    ? t("common.protected_in_transit")
                    : t("mail.zero_access_encrypted")
                }
                size={14}
              />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t("mail.message_headers")}
            </h4>
            <div className="flex items-center gap-1">
              <button
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-[var(--accent-color,#3b82f6)] active:opacity-70"
                type="button"
                onClick={handle_copy_headers}
              >
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                {t("mail.copy_headers")}
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-[var(--accent-color,#3b82f6)] active:opacity-70"
                type="button"
                onClick={handle_download_headers}
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                {t("mail.download_headers")}
              </button>
            </div>
          </div>
          <pre className="max-h-[40vh] overflow-auto rounded-xl bg-[var(--bg-tertiary)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {headers}
          </pre>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
