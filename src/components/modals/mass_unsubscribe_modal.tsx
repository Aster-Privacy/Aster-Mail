import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import { Modal, ModalBody } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SnoozeIcon } from "@/components/common/icons";
import { list_mail_items } from "@/services/api/mail";
import { batch_archive } from "@/services/api/archive";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { get_email_username, get_email_domain } from "@/lib/utils";

interface Subscription {
  id: string;
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  mail_ids: string[];
}

interface MassUnsubscribeModalProps {
  is_open: boolean;
  on_close: () => void;
}

interface DecryptedEnvelope {
  from_address?: string;
  from_name?: string;
}

async function decrypt_envelope_local(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    const nonce_bytes = base64_to_array(nonce);

    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);
    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const key_hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vault.identity_key + "astermail-envelope-v1"),
    );
    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64_to_array(nonce)) },
      crypto_key,
      new Uint8Array(base64_to_array(encrypted)),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

function is_newsletter_sender(email: string, name: string): boolean {
  const email_lower = email.toLowerCase();
  const name_lower = name.toLowerCase();

  const newsletter_patterns = [
    "newsletter",
    "noreply",
    "no-reply",
    "notifications",
    "notification",
    "updates",
    "update",
    "digest",
    "promo",
    "marketing",
    "deals",
    "offers",
    "news",
    "info",
    "subscribe",
    "weekly",
    "monthly",
    "daily",
  ];

  return newsletter_patterns.some(
    (pattern) => email_lower.includes(pattern) || name_lower.includes(pattern),
  );
}

export function MassUnsubscribeModal({
  is_open,
  on_close,
}: MassUnsubscribeModalProps) {
  const [subscriptions, set_subscriptions] = useState<Subscription[]>([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_unsubscribing, set_is_unsubscribing] = useState(false);
  const [completed_count, set_completed_count] = useState(0);
  const [show_success, set_show_success] = useState(false);

  const fetch_subscriptions = useCallback(async () => {
    set_is_loading(true);
    try {
      const response = await list_mail_items({
        item_type: "received",
        limit: 500,
      });

      if (response.data?.items) {
        const sender_map = new Map<
          string,
          { email: string; name: string; count: number; ids: string[] }
        >();

        for (const item of response.data.items) {
          if (item.metadata?.is_trashed || item.metadata?.is_archived) continue;

          try {
            const envelope = await decrypt_envelope_local(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope?.from_address) continue;

            const email = envelope.from_address.toLowerCase();
            const name = envelope.from_name || get_email_username(email);

            if (!is_newsletter_sender(email, name)) continue;

            if (sender_map.has(email)) {
              const existing = sender_map.get(email)!;

              existing.count++;
              existing.ids.push(item.id);
            } else {
              sender_map.set(email, {
                email,
                name,
                count: 1,
                ids: [item.id],
              });
            }
          } catch {
            continue;
          }
        }

        const subs = Array.from(sender_map.values()).map(
          (s) =>
            ({
              id: s.email,
              sender_email: s.email,
              sender_name: s.name,
              domain: get_email_domain(s.email) || s.email,
              email_count: s.count,
              mail_ids: s.ids,
            }) as Subscription,
        );

        set_subscriptions(subs);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    if (is_open) {
      fetch_subscriptions();
      set_selected_ids(new Set());
      set_search_query("");
      set_show_success(false);
      set_completed_count(0);
    }
  }, [is_open, fetch_subscriptions]);

  const filtered_subscriptions = useMemo(() => {
    if (!search_query)
      return [...subscriptions].sort((a, b) => b.email_count - a.email_count);

    const query = search_query.toLowerCase();

    return subscriptions
      .filter(
        (sub) =>
          sub.sender_name.toLowerCase().includes(query) ||
          sub.sender_email.toLowerCase().includes(query) ||
          sub.domain.toLowerCase().includes(query),
      )
      .sort((a, b) => b.email_count - a.email_count);
  }, [subscriptions, search_query]);

  const handle_select_all = () => {
    if (selected_ids.size === filtered_subscriptions.length) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(filtered_subscriptions.map((sub) => sub.id)));
    }
  };

  const handle_select = (id: string) => {
    const new_selected = new Set(selected_ids);

    if (new_selected.has(id)) {
      new_selected.delete(id);
    } else {
      new_selected.add(id);
    }
    set_selected_ids(new_selected);
  };

  const handle_unsubscribe = async () => {
    if (selected_ids.size === 0) return;

    set_is_unsubscribing(true);
    const total = selected_ids.size;

    try {
      const selected_subs = subscriptions.filter((sub) =>
        selected_ids.has(sub.id),
      );
      const all_mail_ids = selected_subs.flatMap((sub) => sub.mail_ids);

      await batch_archive({ ids: all_mail_ids, tier: "hot" });
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));

      set_completed_count(total);
      set_subscriptions((prev) =>
        prev.filter((sub) => !selected_ids.has(sub.id)),
      );
      set_selected_ids(new Set());
      set_show_success(true);
    } finally {
      set_is_unsubscribing(false);
    }
  };

  const all_selected =
    selected_ids.size === filtered_subscriptions.length &&
    filtered_subscriptions.length > 0;

  return (
    <Modal
      close_on_overlay={!is_unsubscribing}
      is_open={is_open}
      on_close={on_close}
      show_close_button={false}
      size="md"
    >
      <div className="flex flex-col" style={{ height: "520px" }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <SnoozeIcon size={20} />
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Bulk Unsubscribe
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

        <ModalBody className="p-0 flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {show_success ? (
              <motion.div
                key="success"
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center flex-1 px-6"
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
                  All done
                </p>
                <p
                  className="text-[12px] text-center mb-6"
                  style={{ color: "var(--text-muted)" }}
                >
                  {completed_count} sender
                  {completed_count !== 1 ? "s" : ""} archived
                </p>
                <div className="flex gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      set_show_success(false);
                      fetch_subscriptions();
                    }}
                  >
                    Continue
                  </Button>
                  <Button size="lg" variant="primary" onClick={on_close}>
                    Done
                  </Button>
                </div>
              </motion.div>
            ) : is_unsubscribing ? (
              <motion.div
                key="loading"
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center flex-1"
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
                  Unsubscribing...
                </p>
              </motion.div>
            ) : (
              <div
                key="content"
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="px-3 py-2.5 flex-shrink-0">
                  <div className="relative">
                    <MagnifyingGlassIcon
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <input
                      className="w-full h-8 pl-8 pr-3 rounded-lg text-[13px] focus:outline-none placeholder:text-[var(--text-muted)]"
                      placeholder="Search..."
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                      }}
                      value={search_query}
                      onChange={(e) => set_search_query(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {is_loading ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <ArrowPathIcon
                        className="w-5 h-5 animate-spin mb-2"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <p
                        className="text-[12px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Scanning...
                      </p>
                    </div>
                  ) : filtered_subscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full px-6">
                      <p
                        className="text-[13px] font-medium mb-0.5"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {search_query ? "No results" : "All clear"}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {search_query
                          ? "Try a different search"
                          : "No subscriptions found"}
                      </p>
                    </div>
                  ) : (
                    filtered_subscriptions.map((sub) => {
                      const is_selected = selected_ids.has(sub.id);

                      return (
                        <button
                          key={sub.id}
                          className="w-full flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors"
                          style={{
                            backgroundColor: is_selected
                              ? "var(--bg-secondary)"
                              : "transparent",
                          }}
                          onClick={() => handle_select(sub.id)}
                          onMouseEnter={(e) => {
                            if (!is_selected)
                              e.currentTarget.style.backgroundColor =
                                "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = is_selected
                              ? "var(--bg-secondary)"
                              : "transparent";
                          }}
                        >
                          <Checkbox
                            checked={is_selected}
                            onCheckedChange={() => handle_select(sub.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-black/[0.03] dark:bg-white/[0.04]">
                            <img
                              alt=""
                              className="w-4 h-4 object-contain"
                              src={`/api/sync/v1/logos/${encodeURIComponent(sub.domain.toLowerCase())}`}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const parent = e.currentTarget.parentElement;

                                if (parent) {
                                  parent.textContent = "";
                                  const span = document.createElement("span");

                                  span.className = "text-[11px] font-medium";
                                  span.style.color = "var(--text-muted)";
                                  span.textContent = sub.sender_name.charAt(0);
                                  parent.appendChild(span);
                                }
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p
                              className="text-[13px] font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {sub.sender_name}
                            </p>
                            <p
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {sub.sender_email}
                            </p>
                          </div>
                          <span
                            className="text-[11px] tabular-nums flex-shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {sub.email_count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div
                  className="flex items-center justify-between px-4 py-3 flex-shrink-0"
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
                    {selected_ids.size > 0
                      ? `${selected_ids.size} selected`
                      : "Select all"}
                  </button>
                  <Button
                    disabled={selected_ids.size === 0}
                    size="lg"
                    variant="primary"
                    onClick={handle_unsubscribe}
                  >
                    Archive
                    {selected_ids.size > 0 ? ` (${selected_ids.size})` : ""}
                  </Button>
                </div>
              </div>
            )}
          </AnimatePresence>
        </ModalBody>
      </div>
    </Modal>
  );
}
