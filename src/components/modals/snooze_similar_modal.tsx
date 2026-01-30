import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { list_mail_items } from "@/services/api/mail";
import { bulk_snooze_emails } from "@/services/api/snooze";
import { decrypt_mail_envelope } from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { show_action_toast } from "@/components/toast/action_toast";
import { get_email_username } from "@/lib/utils";

interface DecryptedEnvelope {
  from_address?: string;
  from_name?: string;
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

const snooze_options = [
  { label: "Later today", hours: 4 },
  { label: "Tomorrow", hours: 24 },
  { label: "This weekend", days: "weekend" as const },
  { label: "Next week", days: 7 },
  { label: "Next month", days: 30 },
];

function calculate_snooze_date(option: (typeof snooze_options)[0]): Date {
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

async function decrypt_envelope_local(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();
  const vault = get_vault_from_memory();

  try {
    const result = await decrypt_mail_envelope<DecryptedEnvelope>(
      encrypted,
      nonce,
      passphrase,
      vault?.identity_key ?? null,
    );

    return result;
  } finally {
    if (passphrase) zero_uint8_array(passphrase);
  }
}

export function SnoozeSimilarModal({
  is_open,
  on_close,
}: SnoozeSimilarModalProps) {
  const [senders, set_senders] = useState<SenderGroup[]>([]);
  const [selected_senders, set_selected_senders] = useState<Set<string>>(
    new Set(),
  );
  const [selected_snooze, set_selected_snooze] = useState<
    (typeof snooze_options)[0] | null
  >(null);
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_executing, set_is_executing] = useState(false);
  const [show_success, set_show_success] = useState(false);
  const [snoozed_count, set_snoozed_count] = useState(0);

  const load_senders = useCallback(async () => {
    set_is_loading(true);
    try {
      const response = await list_mail_items({
        item_type: "received",
        limit: 500,
      });

      if (response.data?.items) {
        const sender_map = new Map<string, SenderGroup>();

        for (const item of response.data.items) {
          if (item.metadata?.is_trashed || item.metadata?.is_archived) continue;
          try {
            const envelope = await decrypt_envelope_local(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope) continue;
            const email = envelope.from_address || "unknown@unknown.com";
            const name = envelope.from_name || get_email_username(email);

            if (sender_map.has(email)) {
              const existing = sender_map.get(email)!;

              existing.count++;
              existing.ids.push(item.id);
            } else {
              sender_map.set(email, { email, name, count: 1, ids: [item.id] });
            }
          } catch {
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
      set_selected_snooze(null);
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

  const handle_snooze = async () => {
    if (selected_senders.size === 0 || !selected_snooze) return;

    set_is_executing(true);
    try {
      const selected = senders.filter((s) => selected_senders.has(s.email));
      const all_ids = selected.flatMap((s) => s.ids);
      const snooze_date = calculate_snooze_date(selected_snooze);

      const result = await bulk_snooze_emails(all_ids, snooze_date);

      if (result.error) {
        show_action_toast({
          message: "Failed to snooze emails",
          action_type: "archive",
          email_ids: [],
        });

        return;
      }

      if (result.data) {
        set_snoozed_count(result.data.snoozed_count);
        set_show_success(true);
        window.dispatchEvent(new CustomEvent("astermail:mail-changed"));

        show_action_toast({
          message: `${result.data.snoozed_count} email${result.data.snoozed_count !== 1 ? "s" : ""} snoozed until ${selected_snooze.label.toLowerCase()}`,
          action_type: "archive",
          email_ids: all_ids,
        });
      }
    } catch {
      show_action_toast({
        message: "Failed to snooze emails",
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

  const can_execute = selected_senders.size > 0 && selected_snooze !== null;
  const all_selected =
    selected_senders.size === filtered_senders.length &&
    filtered_senders.length > 0;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={on_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden"
            exit={{ opacity: 0, scale: 0.96, y: 0 }}
            initial={{ opacity: 0, scale: 0.96, y: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <ClockIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
                <h2
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Snooze similar emails
                </h2>
              </div>
              <button
                className="p-1.5 rounded-lg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                style={{ color: "var(--text-muted)" }}
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
                  initial={{ opacity: 0 }}
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
                    style={{ backgroundColor: "var(--bg-secondary)" }}
                  >
                    <CheckIcon
                      className="w-5 h-5"
                      style={{ color: "var(--accent-color)" }}
                    />
                  </div>
                  <p
                    className="text-[15px] font-medium mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Emails snoozed
                  </p>
                  <p
                    className="text-[12px] text-center mb-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {snoozed_count} email{snoozed_count !== 1 ? "s" : ""} will
                    reappear {selected_snooze?.label.toLowerCase()}
                  </p>
                  <Button size="lg" variant="primary" onClick={on_close}>
                    Done
                  </Button>
                </motion.div>
              ) : is_executing ? (
                <motion.div
                  key="loading"
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-16"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                >
                  <ArrowPathIcon
                    className="w-6 h-6 animate-spin mb-3"
                    style={{ color: "var(--accent-color)" }}
                  />
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Snoozing emails...
                  </p>
                </motion.div>
              ) : (
                <div key="content" className="flex flex-col">
                  <div className="px-4 pb-3">
                    <div className="relative">
                      <MagnifyingGlassIcon
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <input
                        className="w-full h-10 pl-10 pr-4 rounded-lg text-[13px] focus:outline-none"
                        placeholder="Search senders..."
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-secondary)",
                        }}
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
                        <ArrowPathIcon
                          className="w-5 h-5 animate-spin"
                          style={{ color: "var(--text-muted)" }}
                        />
                      </div>
                    ) : filtered_senders.length === 0 ? (
                      <div className="py-8 text-center">
                        <p
                          className="text-[13px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {search_query
                            ? "No senders found"
                            : "No senders with multiple emails"}
                        </p>
                      </div>
                    ) : (
                      filtered_senders.map((sender) => {
                        const is_selected = selected_senders.has(sender.email);

                        return (
                          <button
                            key={sender.email}
                            className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors"
                            style={{
                              backgroundColor: is_selected
                                ? "var(--bg-secondary)"
                                : "transparent",
                            }}
                            onClick={() => handle_select_sender(sender.email)}
                          >
                            <Checkbox
                              checked={is_selected}
                              onCheckedChange={() =>
                                handle_select_sender(sender.email)
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                              style={{
                                backgroundColor: "var(--bg-tertiary)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {sender.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <p
                                className="text-[13px] font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {sender.name}
                              </p>
                              <p
                                className="text-[11px] truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {sender.email}
                              </p>
                            </div>
                            <span
                              className="text-[11px] tabular-nums flex-shrink-0"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {sender.count} emails
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div
                    className="px-4 py-3"
                    style={{ borderTop: "1px solid var(--border-secondary)" }}
                  >
                    <p
                      className="text-[12px] font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Snooze until
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {snooze_options.map((option) => {
                        const is_selected =
                          selected_snooze?.label === option.label;

                        return (
                          <button
                            key={option.label}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                            style={{
                              backgroundColor: is_selected
                                ? "var(--accent-subtle)"
                                : "var(--bg-secondary)",
                              color: is_selected
                                ? "var(--accent-primary)"
                                : "var(--text-secondary)",
                              border: is_selected
                                ? "1px solid var(--accent-primary)"
                                : "1px solid var(--border-secondary)",
                            }}
                            onClick={() => set_selected_snooze(option)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: "1px solid var(--border-secondary)" }}
                  >
                    <button
                      className="flex items-center gap-3 text-[12px] font-medium"
                      style={{ color: "var(--text-muted)" }}
                      onClick={handle_select_all}
                    >
                      <Checkbox
                        checked={all_selected}
                        onCheckedChange={handle_select_all}
                      />
                      {selected_senders.size > 0
                        ? `${selected_senders.size} sender${selected_senders.size !== 1 ? "s" : ""} (${total_selected_emails} emails)`
                        : "Select all"}
                    </button>
                    <Button
                      disabled={!can_execute}
                      size="lg"
                      variant="primary"
                      onClick={handle_snooze}
                    >
                      Snooze
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
  );
}
