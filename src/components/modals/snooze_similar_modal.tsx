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
import type { MailItem } from "@/services/api/mail";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
  CalendarIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { CustomSnoozeModal } from "@/components/modals/custom_snooze_modal";
import { list_mail_items } from "@/services/api/mail";
import { bulk_snooze_emails } from "@/services/api/snooze";
import {
  decrypt_mail_envelope,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { get_favicon_url } from "@/lib/favicon_url";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  decrypt_mail_metadata,
  create_default_metadata,
} from "@/services/crypto/mail_metadata";
import { get_email_username, get_email_domain } from "@/lib/utils";
import { has_protected_folder_label } from "@/hooks/use_folders";
import {
  emit_mail_items_removed,
  emit_snoozed_changed,
} from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface DecryptedEnvelope {
  from: { name: string; email: string };
}

interface SenderGroup {
  email: string;
  name: string;
  count: number;
  ids: string[];
}

interface SnoozeSimilarModalProps {
  is_open: boolean;
  on_close: () => void;
}

function get_snooze_options(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  return [
    { label: t("common.later_today"), hours: 4 },
    { label: t("common.tomorrow"), hours: 24 },
    { label: t("common.this_weekend"), days: "weekend" as const },
    { label: t("common.next_week"), days: 7 },
    { label: t("common.next_month"), days: 30 },
  ];
}

function calculate_snooze_date(option: {
  label: string;
  hours?: number;
  days?: number | "weekend";
}): Date {
  const now = new Date();

  if ("hours" in option && option.hours) {
    return new Date(now.getTime() + option.hours * 60 * 60 * 1000);
  }

  if (option.days === "weekend") {
    const day_of_week = now.getDay();
    const days_until_saturday =
      day_of_week === 6 ? 7 : (6 - day_of_week + 7) % 7;
    const saturday = new Date(now);

    saturday.setDate(now.getDate() + days_until_saturday);
    saturday.setHours(9, 0, 0, 0);

    return saturday;
  }

  if (typeof option.days === "number") {
    const target = new Date(now);

    target.setDate(now.getDate() + option.days);
    target.setHours(9, 0, 0, 0);

    return target;
  }

  return now;
}

async function decrypt_items_metadata_for_action(
  items: MailItem[],
): Promise<void> {
  for (const item of items) {
    if (item.metadata) continue;
    if (!item.encrypted_metadata || !item.metadata_nonce) {
      const is_sent =
        item.item_type === "sent" ||
        item.item_type === "draft" ||
        item.item_type === "scheduled";
      const defaults = create_default_metadata(item.item_type);

      defaults.is_read = is_sent;
      if (item.message_ts) defaults.message_ts = item.message_ts;
      item.metadata = defaults;
      continue;
    }
    try {
      const meta = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );

      item.metadata = meta ?? create_default_metadata(item.item_type);
    } catch {
      item.metadata = create_default_metadata(item.item_type);
    }
  }
}

async function decrypt_envelope_local(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();
  const vault = get_vault_from_memory();

  try {
    const raw = await decrypt_mail_envelope<Record<string, unknown>>(
      encrypted,
      nonce,
      passphrase,
      vault?.identity_key ?? null,
    );

    if (!raw) return null;
    const from = normalize_envelope_from(raw.from);

    if (!from) return null;

    return { from };
  } finally {
    if (passphrase) zero_uint8_array(passphrase);
  }
}

export function SnoozeSimilarModal({
  is_open,
  on_close,
}: SnoozeSimilarModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const snooze_options = get_snooze_options(t);
  const [senders, set_senders] = useState<SenderGroup[]>([]);
  const [selected_senders, set_selected_senders] = useState<Set<string>>(
    new Set(),
  );
  const [snooze_date, set_snooze_date] = useState<Date | null>(null);
  const [snooze_label, set_snooze_label] = useState<string | null>(null);
  const [show_custom_picker, set_show_custom_picker] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_executing, set_is_executing] = useState(false);
  const [show_success, set_show_success] = useState(false);
  const [snoozed_count, set_snoozed_count] = useState(0);

  const load_senders = useCallback(async () => {
    set_is_loading(true);
    try {
      let all_items: MailItem[] = [];
      let cursor: string | undefined;

      do {
        const response = await list_mail_items({
          item_type: "received",
          cursor,
        });

        if (!response.data?.items) break;
        all_items.push(...response.data.items);
        cursor = response.data.next_cursor;
      } while (cursor);

      if (all_items.length > 0) {
        await decrypt_items_metadata_for_action(all_items);
        const sender_map = new Map<string, SenderGroup>();

        for (const item of all_items) {
          if (item.metadata?.is_trashed || item.metadata?.is_archived) continue;
          if (has_protected_folder_label(item.labels)) continue;
          try {
            const envelope = await decrypt_envelope_local(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope) continue;
            const email = envelope.from?.email || "unknown@unknown.com";
            const name = envelope.from?.name || get_email_username(email);

            if (sender_map.has(email)) {
              const existing = sender_map.get(email)!;

              existing.count++;
              existing.ids.push(item.id);
            } else {
              sender_map.set(email, { email, name, count: 1, ids: [item.id] });
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error(error);
            continue;
          }
        }

        const sorted = Array.from(sender_map.values())
          .filter((s) => s.count > 1)
          .sort((a, b) => b.count - a.count);

        set_senders(sorted);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    if (is_open) {
      set_selected_senders(new Set());
      set_snooze_date(null);
      set_snooze_label(null);
      set_show_custom_picker(false);
      set_search_query("");
      set_show_success(false);
      set_snoozed_count(0);
      load_senders();
    }
  }, [is_open, load_senders]);

  const filtered_senders = useMemo(() => {
    if (!search_query.trim()) return senders;
    const query = search_query.toLowerCase();

    return senders.filter(
      (s) =>
        s.email.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query),
    );
  }, [senders, search_query]);

  const handle_select_sender = (email: string) => {
    const new_selected = new Set(selected_senders);

    if (new_selected.has(email)) {
      new_selected.delete(email);
    } else {
      new_selected.add(email);
    }
    set_selected_senders(new_selected);
  };

  const handle_select_all = () => {
    if (selected_senders.size === filtered_senders.length) {
      set_selected_senders(new Set());
    } else {
      set_selected_senders(new Set(filtered_senders.map((s) => s.email)));
    }
  };

  const handle_pick_preset = (option: {
    label: string;
    hours?: number;
    days?: number | "weekend";
  }) => {
    set_snooze_date(calculate_snooze_date(option));
    set_snooze_label(option.label);
  };

  const handle_custom_snooze = async (date: Date) => {
    set_snooze_date(date);
    set_snooze_label(format(date, "MMM d, h:mm a"));
    set_show_custom_picker(false);
  };

  const handle_snooze = async () => {
    if (selected_senders.size === 0 || !snooze_date) return;

    set_is_executing(true);
    try {
      const selected = senders.filter((s) => selected_senders.has(s.email));
      const all_ids = selected.flatMap((s) => s.ids);

      const result = await bulk_snooze_emails(all_ids, snooze_date);

      if (result.error) {
        show_action_toast({
          message: t("common.failed_to_snooze_emails"),
          action_type: "archive",
          email_ids: [],
        });

        return;
      }

      if (result.data) {
        set_snoozed_count(result.data.snoozed_count);
        set_show_success(true);

        emit_mail_items_removed({ ids: all_ids });
        emit_snoozed_changed();
        invalidate_mail_stats();

        show_action_toast({
          message: t("common.emails_snoozed_until", {
            count: String(result.data.snoozed_count),
            time: snooze_label?.toLowerCase() ?? "later",
          }),
          action_type: "archive",
          email_ids: all_ids,
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_action_toast({
        message: t("common.failed_to_snooze_emails"),
        action_type: "archive",
        email_ids: [],
      });
    } finally {
      set_is_executing(false);
    }
  };

  const total_selected_emails = senders
    .filter((s) => selected_senders.has(s.email))
    .reduce((sum, s) => sum + s.count, 0);

  const can_execute = selected_senders.size > 0 && snooze_date !== null;
  const all_selected =
    selected_senders.size === filtered_senders.length &&
    filtered_senders.length > 0;

  return (
    <>
      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            <motion.div
              className="absolute inset-0 backdrop-blur-md"
              style={{ backgroundColor: "var(--modal-overlay)" }}
              onClick={on_close}
            />
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
              exit={{ opacity: 0, scale: 0.96, y: 0 }}
              initial={
                reduce_motion ? false : { opacity: 0, scale: 0.96, y: 0 }
              }
              style={{
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              }}
              transition={{
                duration: reduce_motion ? 0 : 0.15,
                ease: "easeOut",
              }}
            >
              <div className="flex items-center justify-between px-6 py-5">
                <div className="flex items-center gap-3">
                  <ClockIcon className="w-5 h-5 text-txt-secondary" />
                  <h2 className="text-[16px] font-semibold text-txt-primary">
                    {t("mail.snooze_similar_emails")}
                  </h2>
                </div>
                <button
                  className="p-1.5 rounded-[14px] transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05] text-txt-muted"
                  onClick={on_close}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {show_success ? (
                  <motion.div
                    key="success"
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center px-6 py-12"
                    exit={{ opacity: 0 }}
                    initial={reduce_motion ? false : { opacity: 0 }}
                  >
                    <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3 bg-surf-secondary">
                      <CheckIcon className="w-5 h-5 text-brand" />
                    </div>
                    <p className="text-[15px] font-medium mb-1 text-txt-primary">
                      {t("common.emails_snoozed")}
                    </p>
                    <p className="text-[12px] text-center mb-6 text-txt-muted">
                      {t("common.emails_will_reappear", {
                        count: String(snoozed_count),
                        time: snooze_label?.toLowerCase() ?? "later",
                      })}
                    </p>
                    <Button size="xl" variant="depth" onClick={on_close}>
                      {t("common.done")}
                    </Button>
                  </motion.div>
                ) : is_executing ? (
                  <motion.div
                    key="loading"
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16"
                    exit={{ opacity: 0 }}
                    initial={reduce_motion ? false : { opacity: 0 }}
                  >
                    <Spinner className="mb-3 text-brand" size="lg" />
                    <p className="text-[13px] text-txt-muted">
                      {t("common.snoozing_emails")}
                    </p>
                  </motion.div>
                ) : (
                  <div key="content" className="flex flex-col">
                    <div className="px-4 pb-3">
                      <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
                        <Input
                          className="w-full pl-10 pr-4"
                          placeholder={t("common.search_senders")}
                          type="text"
                          value={search_query}
                          onChange={(e) => set_search_query(e.target.value)}
                        />
                      </div>
                    </div>

                    <div
                      className="max-h-48 overflow-y-auto"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {is_loading ? (
                        <div className="flex items-center justify-center py-12">
                          <Spinner className="text-txt-muted" size="md" />
                        </div>
                      ) : filtered_senders.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-[13px] text-txt-muted">
                            {search_query
                              ? t("common.no_senders_found")
                              : t("common.no_senders_with_multiple_emails")}
                          </p>
                        </div>
                      ) : (
                        filtered_senders.map((sender) => {
                          const is_selected = selected_senders.has(
                            sender.email,
                          );

                          return (
                            <button
                              key={sender.email}
                              className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors"
                              style={{ backgroundColor: "transparent" }}
                              onClick={() => handle_select_sender(sender.email)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "var(--bg-hover)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                              }}
                            >
                              <Checkbox
                                checked={is_selected}
                                onCheckedChange={() =>
                                  handle_select_sender(sender.email)
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-black/[0.03] dark:bg-white/[0.04]">
                                <img
                                  alt=""
                                  className="w-4 h-4 object-contain"
                                  src={get_favicon_url(
                                    get_email_domain(
                                      sender.email,
                                    ).toLowerCase(),
                                  )}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    const parent =
                                      e.currentTarget.parentElement;

                                    if (parent) {
                                      parent.textContent = "";
                                      const span =
                                        document.createElement("span");

                                      span.className =
                                        "text-[11px] font-medium text-txt-muted";
                                      span.textContent = sender.name.charAt(0);
                                      parent.appendChild(span);
                                    }
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-[13px] font-medium truncate text-txt-primary">
                                  {sender.name}
                                </p>
                                <p className="text-[11px] truncate text-txt-muted">
                                  {sender.email}
                                </p>
                              </div>
                              <span className="text-[11px] tabular-nums flex-shrink-0 text-txt-muted">
                                {t("common.count_emails", {
                                  count: String(sender.count),
                                })}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="px-1 py-1 border-t border-edge-secondary">
                      <p className="text-[12px] font-medium px-3 pt-2 pb-1 text-txt-secondary">
                        {t("common.snooze_until")}
                      </p>
                      {snooze_options.map((option) => {
                        const is_selected = snooze_label === option.label;

                        return (
                          <button
                            key={option.label}
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[12px] text-[13px] transition-colors ${is_selected ? "" : "text-txt-primary"}`}
                            style={
                              is_selected
                                ? { color: "var(--accent-primary)" }
                                : undefined
                            }
                            onClick={() => handle_pick_preset(option)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "var(--bg-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                            }}
                          >
                            <ClockIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                            <span className="flex-1 text-left">
                              {option.label}
                            </span>
                            {is_selected && (
                              <CheckIcon
                                className="w-4 h-4 flex-shrink-0"
                                style={{ color: "var(--accent-primary)" }}
                              />
                            )}
                          </button>
                        );
                      })}
                      <button
                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[12px] text-[13px] transition-colors ${snooze_label && !snooze_options.some((o) => o.label === snooze_label) ? "" : "text-txt-primary"}`}
                        style={
                          snooze_label &&
                          !snooze_options.some((o) => o.label === snooze_label)
                            ? { color: "var(--accent-primary)" }
                            : undefined
                        }
                        onClick={() => set_show_custom_picker(true)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <CalendarIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                        <span className="flex-1 text-left">
                          {snooze_label &&
                          !snooze_options.some((o) => o.label === snooze_label)
                            ? snooze_label
                            : t("mail.pick_date_time")}
                        </span>
                        {snooze_label &&
                          !snooze_options.some(
                            (o) => o.label === snooze_label,
                          ) && (
                            <CheckIcon
                              className="w-4 h-4 flex-shrink-0"
                              style={{ color: "var(--accent-primary)" }}
                            />
                          )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 border-t border-edge-secondary">
                      <button
                        className="flex items-center gap-3 text-[12px] font-medium text-txt-muted"
                        onClick={handle_select_all}
                      >
                        <Checkbox
                          checked={all_selected}
                          onCheckedChange={handle_select_all}
                        />
                        {selected_senders.size > 0
                          ? t("common.senders_emails_count", {
                              senders: String(selected_senders.size),
                              emails: String(total_selected_emails),
                            })
                          : t("common.select_all")}
                      </button>
                      <Button
                        disabled={!can_execute}
                        size="xl"
                        variant="depth"
                        onClick={handle_snooze}
                      >
                        {t("mail.snooze")}
                        {total_selected_emails > 0
                          ? ` (${total_selected_emails})`
                          : ""}
                      </Button>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CustomSnoozeModal
        is_open={show_custom_picker}
        on_close={() => set_show_custom_picker(false)}
        on_snooze={handle_custom_snooze}
      />
    </>
  );
}
