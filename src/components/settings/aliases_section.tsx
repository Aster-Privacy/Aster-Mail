import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  AtSymbolIcon,
} from "@heroicons/react/24/outline";

import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { ConfirmationModal } from "@/components/confirmation_modal";
import {
  list_aliases,
  create_alias,
  update_alias,
  delete_alias,
  check_alias_availability,
  decrypt_aliases,
  validate_local_part,
  type DecryptedEmailAlias,
  type AliasListResponse,
} from "@/services/api/aliases";

const AVAILABLE_DOMAINS = ["astermail.org", "aster.cx"];

interface DomainDropdownProps {
  value: string;
  options: string[];
  on_change: (value: string) => void;
}

function DomainDropdown({ value, options, on_change }: DomainDropdownProps) {
  const [is_open, set_is_open] = useState(false);
  const dropdown_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (
        dropdown_ref.current &&
        !dropdown_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    };

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);

      return () =>
        document.removeEventListener("mousedown", handle_click_outside);
    }
  }, [is_open]);

  return (
    <div ref={dropdown_ref} className="relative">
      <button
        className="flex items-center gap-2 px-4 py-3 text-sm rounded-lg transition-colors min-w-[160px] justify-between outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
        style={{
          backgroundColor: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--text-primary)",
        }}
        type="button"
        onClick={() => set_is_open(!is_open)}
      >
        <span>{value}</span>
        <svg
          className={`w-4 h-4 transition-transform ${is_open ? "rotate-180" : ""}`}
          fill="currentColor"
          style={{ color: "var(--text-muted)" }}
          viewBox="0 0 24 24"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute z-10 mt-2 w-full rounded-lg shadow-lg overflow-hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-secondary)",
            }}
            transition={{ duration: 0.15 }}
          >
            {options.map((option) => (
              <button
                key={option}
                className="w-full px-4 py-2.5 text-sm text-left transition-colors"
                style={{
                  backgroundColor:
                    option === value ? "var(--bg-secondary)" : "transparent",
                  color: "var(--text-primary)",
                  fontWeight: option === value ? 500 : 400,
                }}
                type="button"
                onClick={() => {
                  on_change(option);
                  set_is_open(false);
                }}
                onMouseEnter={(e) => {
                  if (option !== value)
                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (option !== value)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {option}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CreateAliasModalProps {
  is_open: boolean;
  on_close: () => void;
  on_created: () => void;
  max_aliases: number;
  current_count: number;
}

function CreateAliasModal({
  is_open,
  on_close,
  on_created,
  max_aliases,
  current_count,
}: CreateAliasModalProps) {
  const [local_part, set_local_part] = useState("");
  const [domain, set_domain] = useState(AVAILABLE_DOMAINS[0]);
  const [display_name, set_display_name] = useState("");
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [checking, set_checking] = useState(false);
  const [is_available, set_is_available] = useState<boolean | null>(null);
  const check_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (is_open) {
      set_local_part("");
      set_domain(AVAILABLE_DOMAINS[0]);
      set_display_name("");
      set_error(null);
      set_is_available(null);
    }
  }, [is_open]);

  const check_availability = useCallback(async (lp: string, d: string) => {
    if (!lp || lp.length < 3) {
      set_is_available(null);

      return;
    }

    const validation = validate_local_part(lp);

    if (!validation.valid) {
      set_is_available(null);

      return;
    }

    set_checking(true);
    try {
      const response = await check_alias_availability(lp, d);

      if (response.data) {
        set_is_available(response.data.available);
      }
    } catch {
      set_is_available(null);
    } finally {
      set_checking(false);
    }
  }, []);

  useEffect(() => {
    if (check_timeout_ref.current) {
      clearTimeout(check_timeout_ref.current);
    }

    if (local_part.length >= 3) {
      check_timeout_ref.current = setTimeout(() => {
        check_availability(local_part, domain);
      }, 500);
    } else {
      set_is_available(null);
    }

    return () => {
      if (check_timeout_ref.current) {
        clearTimeout(check_timeout_ref.current);
      }
    };
  }, [local_part, domain, check_availability]);

  const handle_create = async () => {
    const validation = validate_local_part(local_part);

    if (!validation.valid) {
      set_error(validation.error || "Invalid alias");

      return;
    }

    if (is_available === false) {
      set_error("This alias is already taken");

      return;
    }

    set_saving(true);
    set_error(null);

    try {
      const response = await create_alias(
        local_part,
        domain,
        display_name || undefined,
      );

      if (response.error) {
        set_error(response.error);
      } else {
        on_created();
        on_close();
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to create alias");
    } finally {
      set_saving(false);
    }
  };

  const at_limit = current_count >= max_aliases;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          style={{ backgroundColor: "var(--modal-overlay)" }}
          transition={{ duration: 0.15 }}
          onClick={on_close}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="w-[440px] rounded-xl p-5"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-secondary)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Create Email Alias
              </h3>
              <button
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
                onClick={on_close}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {at_limit ? (
              <div
                className="flex items-center gap-3 p-4 rounded-lg mb-4"
                style={{
                  backgroundColor: "var(--bg-warning)",
                  border: "1px solid var(--border-warning)",
                }}
              >
                <ExclamationTriangleIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: "var(--text-warning)" }}
                />
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-warning)" }}
                  >
                    Alias limit reached
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    You have reached the maximum of {max_aliases} aliases for
                    your plan. Upgrade to create more.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p
                  className="text-sm mb-4"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Create an alternate email address that forwards to your main
                  inbox.
                </p>

                <div className="mb-4">
                  <label
                    className="text-sm font-medium block mb-2"
                    htmlFor="alias-address"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Alias Address
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 relative">
                      <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="w-full px-4 py-3 text-sm rounded-lg pr-10 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                        id="alias-address"
                        placeholder="newsletter"
                        style={{
                          backgroundColor: "var(--input-bg)",
                          border: `1px solid ${
                            is_available === false
                              ? "var(--border-error)"
                              : is_available === true
                                ? "var(--border-success)"
                                : "var(--input-border)"
                          }`,
                          color: "var(--text-primary)",
                        }}
                        value={local_part}
                        onChange={(e) =>
                          set_local_part(e.target.value.toLowerCase().trim())
                        }
                        onKeyDown={(e) => e.key === "Enter" && handle_create()}
                      />
                      {checking && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <ArrowPathIcon
                            className="w-4 h-4 animate-spin"
                            style={{ color: "var(--text-muted)" }}
                          />
                        </div>
                      )}
                      {!checking && is_available === true && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckIcon className="w-4 h-4 text-green-500" />
                        </div>
                      )}
                      {!checking && is_available === false && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <XMarkIcon className="w-4 h-4 text-red-500" />
                        </div>
                      )}
                    </div>
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      @
                    </span>
                    <DomainDropdown
                      on_change={set_domain}
                      options={AVAILABLE_DOMAINS}
                      value={domain}
                    />
                  </div>
                  {local_part && !validate_local_part(local_part).valid && (
                    <p className="text-xs mt-1.5 text-red-500">
                      {validate_local_part(local_part).error}
                    </p>
                  )}
                  {is_available === false && (
                    <p className="text-xs mt-1.5 text-red-500">
                      This alias is already taken
                    </p>
                  )}
                </div>

                <div className="mb-4">
                  <label
                    className="text-sm font-medium block mb-2"
                    htmlFor="alias-display-name"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Display Name{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      (optional)
                    </span>
                  </label>
                  <input
                    className="w-full px-4 py-3 text-sm rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    id="alias-display-name"
                    placeholder="Newsletter Alias"
                    style={{
                      backgroundColor: "var(--input-bg)",
                      border: "1px solid var(--input-border)",
                      color: "var(--text-primary)",
                    }}
                    value={display_name}
                    onChange={(e) => set_display_name(e.target.value)}
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onClick={on_close}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                Cancel
              </button>
              {!at_limit && (
                <motion.button
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                  disabled={saving || !local_part || is_available === false}
                  style={{
                    background:
                      "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                  }}
                  transition={{ duration: 0.15 }}
                  whileHover={{
                    background:
                      "linear-gradient(to bottom, #7b96ff 0%, #5f7ef7 50%, #4b6af8 100%)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handle_create}
                >
                  {saving ? "Creating..." : "Create Alias"}
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface AliasItemProps {
  alias: DecryptedEmailAlias;
  on_toggle: (id: string, enabled: boolean) => void;
  on_delete: (id: string) => void;
  toggling: boolean;
  deleting: boolean;
}

function AliasItem({
  alias,
  on_toggle,
  on_delete,
  toggling,
  deleting,
}: AliasItemProps) {
  const [copied, set_copied] = useState(false);

  const copy_address = async () => {
    await navigator.clipboard.writeText(alias.full_address);
    set_copied(true);
    setTimeout(() => set_copied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg transition-colors"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-secondary)",
        opacity: alias.is_enabled ? 1 : 0.6,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {alias.full_address}
          </p>
          <button
            className="p-1 rounded transition-colors flex-shrink-0"
            title={copied ? "Copied!" : "Copy address"}
            onClick={copy_address}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <ClipboardDocumentIcon
                className="w-3.5 h-3.5"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </button>
        </div>
        {alias.display_name && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {alias.display_name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50"
          disabled={toggling}
          style={{
            backgroundColor: alias.is_enabled
              ? "#3b82f6"
              : "var(--border-secondary)",
          }}
          onClick={() => on_toggle(alias.id, !alias.is_enabled)}
        >
          <span
            className={
              "inline-block h-4 w-4 rounded-full transition-transform duration-200 " +
              (alias.is_enabled ? "translate-x-6" : "translate-x-1")
            }
            style={{
              backgroundColor: alias.is_enabled ? "#ffffff" : "var(--bg-card)",
            }}
          />
        </button>

        <button
          className="p-2 rounded-lg transition-colors text-red-500 disabled:opacity-50"
          disabled={deleting}
          onClick={() => on_delete(alias.id)}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          {deleting ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : (
            <TrashIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function AliasesSection() {
  const [aliases, set_aliases] = useState<DecryptedEmailAlias[]>([]);
  const [loading, set_loading] = useState(true);
  const [max_aliases, set_max_aliases] = useState(3);
  const [show_create_modal, set_show_create_modal] = useState(false);
  const [toggling_id, set_toggling_id] = useState<string | null>(null);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [delete_confirm, set_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  const load_aliases = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_aliases();

      if (response.data) {
        const data = response.data as AliasListResponse;

        set_max_aliases(data.max_aliases);
        const decrypted = await decrypt_aliases(data.aliases);

        set_aliases(decrypted);
      }
    } catch {
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_aliases();
  }, [load_aliases]);

  const handle_toggle = async (id: string, enabled: boolean) => {
    set_toggling_id(id);
    try {
      const response = await update_alias(id, { is_enabled: enabled });

      if (!response.error) {
        set_aliases((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_enabled: enabled } : a)),
        );
      }
    } catch {
    } finally {
      set_toggling_id(null);
    }
  };

  const handle_delete = (id: string) => {
    set_delete_confirm({ is_open: true, id });
  };

  const confirm_delete = async () => {
    const id = delete_confirm.id;

    if (!id) return;
    set_delete_confirm({ is_open: false, id: null });
    set_deleting_id(id);
    try {
      const response = await delete_alias(id);

      if (!response.error) {
        set_aliases((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
    } finally {
      set_deleting_id(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Email Aliases
          </h3>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {aliases.length} / {max_aliases} used
          </span>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Create alternate email addresses that forward to your main inbox. Use
          them to protect your privacy or organize incoming mail.
        </p>

        <motion.button
          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold rounded-lg mb-3"
          style={{
            background:
              "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
            color: "#ffffff",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
          }}
          transition={{ duration: 0.15 }}
          whileHover={{
            background:
              "linear-gradient(to bottom, #7b96ff 0%, #5f7ef7 50%, #4b6af8 100%)",
            scale: 1.01,
          }}
          whileTap={{ scale: 0.98 }}
          onClick={() => set_show_create_modal(true)}
        >
          <PlusIcon className="w-4 h-4" />
          Create Alias
        </motion.button>

        {loading ? (
          <div />
        ) : aliases.length === 0 ? (
          <div
            className="text-center py-12 rounded-lg"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-secondary)",
            }}
          >
            <AtSymbolIcon
              className="w-12 h-12 mx-auto mb-3"
              style={{ color: "var(--text-muted)" }}
            />
            <p
              className="text-sm font-medium mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              No aliases yet
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Create your first email alias to get started
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {aliases.map((alias) => (
              <AliasItem
                key={alias.id}
                alias={alias}
                deleting={deleting_id === alias.id}
                on_delete={handle_delete}
                on_toggle={handle_toggle}
                toggling={toggling_id === alias.id}
              />
            ))}
          </div>
        )}
      </div>

      <CreateAliasModal
        current_count={aliases.length}
        is_open={show_create_modal}
        max_aliases={max_aliases}
        on_close={() => set_show_create_modal(false)}
        on_created={load_aliases}
      />

      <ConfirmationModal
        confirm_text="Delete"
        is_open={delete_confirm.is_open}
        message="Are you sure you want to delete this alias? This action cannot be undone."
        on_cancel={() => set_delete_confirm({ is_open: false, id: null })}
        on_confirm={confirm_delete}
        title="Delete Alias"
        variant="danger"
      />
    </div>
  );
}
