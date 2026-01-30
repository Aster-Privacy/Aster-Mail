import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KeyIcon,
  ClipboardIcon,
  ClipboardDocumentCheckIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ServerIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

import { COPY_FEEDBACK_MS } from "@/constants/timings";
import { Loader2Icon } from "@/components/common/icons";
import { show_toast } from "@/components/toast/simple_toast";
import { api_client } from "@/services/api/client";
import { get_user_info } from "@/services/api/auth";
import {
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { generate_recovery_pdf } from "@/services/crypto/recovery_pdf";

interface PgpKeyInfo {
  fingerprint: string;
  key_id: string;
  algorithm: string;
  key_size: number;
  created_at: string;
  expires_at: string | null;
  public_key_armored: string;
  decrypt_count: number;
  last_used_decrypt_at: string | null;
}

interface RecoveryCodesInfo {
  total_codes: number;
  available_codes: number;
  created_at: string | null;
}

interface SaltResponse {
  salt: string;
}

interface VerifyPasswordResponse {
  verified: boolean;
}

interface RegenerateCodesResponse {
  codes: string[];
  info: RecoveryCodesInfo;
}

export function EncryptionSection() {
  const [is_authenticated, set_is_authenticated] = useState(false);
  const [password, set_password] = useState("");
  const [auth_error, set_auth_error] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [pgp_key, set_pgp_key] = useState<PgpKeyInfo | null>(null);
  const [recovery_info, set_recovery_info] = useState<RecoveryCodesInfo | null>(
    null,
  );
  const [recovery_codes, set_recovery_codes] = useState<string[] | null>(null);
  const [show_recovery_codes, set_show_recovery_codes] = useState(false);
  const [copied_fingerprint, set_copied_fingerprint] = useState(false);
  const [copied_key, set_copied_key] = useState(false);
  const [show_regenerate_confirm, set_show_regenerate_confirm] =
    useState(false);
  const [regenerate_confirm_text, set_regenerate_confirm_text] = useState("");
  const [is_regenerating, set_is_regenerating] = useState(false);
  const [user_email, set_user_email] = useState<string>("");
  const [codes_key, set_codes_key] = useState(0);

  const format_fingerprint = (fp: string): string => {
    return fp.match(/.{1,4}/g)?.join(" ") || fp;
  };

  const format_date = (date_string: string): string => {
    return new Date(date_string).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handle_authenticate = async () => {
    if (!password.trim()) {
      set_auth_error("Please enter your password");

      return;
    }

    set_is_loading(true);
    set_auth_error("");

    try {
      const salt_response =
        await api_client.get<SaltResponse>("/encryption/salt");

      if (salt_response.error || !salt_response.data?.salt) {
        set_auth_error(
          salt_response.error || "Failed to retrieve authentication data",
        );

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash } = await derive_password_hash(password, salt);

      const response = await api_client.post<VerifyPasswordResponse>(
        "/encryption/verify-password",
        { password_hash: hash },
      );

      if (response.error) {
        set_auth_error(response.error);

        return;
      }

      if (response.data?.verified) {
        set_is_authenticated(true);
        await load_encryption_data();
      } else {
        set_auth_error("Incorrect password");
      }
    } catch (err) {
      set_auth_error(
        err instanceof Error ? err.message : "Failed to verify password",
      );
    } finally {
      set_is_loading(false);
      set_password("");
    }
  };

  const load_encryption_data = async () => {
    try {
      const [key_response, recovery_response, user_response] =
        await Promise.all([
          api_client
            .get<PgpKeyInfo>("/encryption/pgp-key")
            .catch(() => ({ data: null, error: null })),
          api_client.get<RecoveryCodesInfo>("/encryption/recovery-status"),
          get_user_info(),
        ]);

      if (key_response.data) {
        set_pgp_key(key_response.data);
      }
      if (recovery_response.data) {
        set_recovery_info(recovery_response.data);
      }
      if (user_response.data?.email) {
        set_user_email(user_response.data.email);
      }
    } catch {
      return;
    }
  };

  const handle_copy_fingerprint = async () => {
    if (!pgp_key) return;

    try {
      await navigator.clipboard.writeText(pgp_key.fingerprint);
      set_copied_fingerprint(true);
      setTimeout(() => set_copied_fingerprint(false), COPY_FEEDBACK_MS);
    } catch {
      return;
    }
  };

  const handle_export_public_key = async () => {
    if (!pgp_key) return;

    try {
      const blob = new Blob([pgp_key.public_key_armored], {
        type: "application/pgp-keys",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `aster-public-key-${pgp_key.key_id}.asc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      return;
    }
  };

  const handle_copy_public_key = async () => {
    if (!pgp_key) return;

    try {
      await navigator.clipboard.writeText(pgp_key.public_key_armored);
      set_copied_key(true);
      setTimeout(() => set_copied_key(false), COPY_FEEDBACK_MS);
    } catch {
      return;
    }
  };

  const handle_download_codes = () => {
    if (!recovery_codes || recovery_codes.length === 0) return;
    generate_recovery_pdf(
      user_email || "your-account@aster.email",
      recovery_codes,
    );
  };

  const handle_copy_all_codes = async () => {
    if (!recovery_codes) return;

    try {
      const codes_text = recovery_codes.join("\n");

      await navigator.clipboard.writeText(codes_text);
      show_toast("Copied successfully", "success");
    } catch {
      return;
    }
  };

  const handle_regenerate_codes = async () => {
    if (regenerate_confirm_text.toLowerCase() !== "regenerate") {
      return;
    }

    set_is_regenerating(true);

    try {
      const response = await api_client.post<RegenerateCodesResponse>(
        "/encryption/regenerate-recovery-codes",
        {},
      );

      if (response.data) {
        set_codes_key((prev) => prev + 1);
        set_recovery_codes(response.data.codes);
        set_recovery_info(response.data.info);
        set_show_recovery_codes(true);
        set_show_regenerate_confirm(false);
        set_regenerate_confirm_text("");
      }
    } catch {
      return;
    } finally {
      set_is_regenerating(false);
    }
  };

  useEffect(() => {
    return () => {
      set_recovery_codes(null);
      set_is_authenticated(false);
    };
  }, []);

  const codes_remaining = recovery_info?.available_codes ?? 0;
  const codes_total = recovery_info?.total_codes ?? 6;
  const codes_used = codes_total - codes_remaining;

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Encryption
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Manage your encryption keys and account recovery
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!is_authenticated ? (
          <motion.div
            key="auth"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <LockClosedIcon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Password Required
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Enter your password to view encryption settings
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="flex-1 px-3 py-2 text-sm rounded-md outline-none border border-transparent focus:border-blue-500 transition-colors"
                  placeholder="Enter password"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                  type="password"
                  value={password}
                  onChange={(e) => set_password(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handle_authenticate()}
                />
                <button
                  className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 flex items-center justify-center min-w-[72px]"
                  disabled={is_loading || !password.trim()}
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                  onClick={handle_authenticate}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--bg-secondary)")
                  }
                >
                  {is_loading ? (
                    <Loader2Icon className="animate-spin" size={16} />
                  ) : (
                    "Unlock"
                  )}
                </button>
              </div>

              {auth_error && (
                <p className="text-xs text-red-500 mt-2">{auth_error}</p>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            animate={{ opacity: 1 }}
            className="space-y-6"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {pgp_key && (
              <div
                className="rounded-lg"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <KeyIcon
                        className="w-[18px] h-[18px]"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {pgp_key.algorithm.toUpperCase()}-{pgp_key.key_size}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Created {format_date(pgp_key.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-green-500">
                    <CheckCircleIcon className="w-4 h-4" />
                    Active
                  </div>
                </div>

                <div
                  className="px-4 py-3"
                  style={{ borderTop: "1px solid var(--border-primary)" }}
                >
                  <div className="flex items-center gap-2">
                    <code
                      className="flex-1 px-3 py-2 rounded-md text-[11px] font-mono tracking-wide"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {format_fingerprint(pgp_key.fingerprint)}
                    </code>
                    <button
                      className="p-2 rounded-md transition-colors"
                      style={{
                        color: copied_fingerprint
                          ? "#22c55e"
                          : "var(--text-muted)",
                      }}
                      onClick={handle_copy_fingerprint}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      {copied_fingerprint ? (
                        <ClipboardDocumentCheckIcon className="w-4 h-4" />
                      ) : (
                        <ClipboardIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div
                  className="px-4 py-3 flex gap-2"
                  style={{ borderTop: "1px solid var(--border-primary)" }}
                >
                  <button
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                    }}
                    onClick={handle_export_public_key}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-secondary)")
                    }
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    Export Public Key
                  </button>
                  <button
                    className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      color: copied_key ? "#22c55e" : "var(--text-secondary)",
                    }}
                    onClick={handle_copy_public_key}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-secondary)")
                    }
                  >
                    {copied_key ? (
                      <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" />
                    ) : (
                      <ClipboardIcon className="w-3.5 h-3.5" />
                    )}
                    {copied_key ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <div
              className="rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <ShieldCheckIcon
                        className="w-[18px] h-[18px]"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Recovery Codes
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {codes_remaining} of {codes_total} remaining
                      </p>
                    </div>
                  </div>
                  {codes_used > 0 && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          codes_remaining <= 2
                            ? "rgba(239, 68, 68, 0.1)"
                            : "rgba(234, 179, 8, 0.1)",
                        color: codes_remaining <= 2 ? "#ef4444" : "#eab308",
                      }}
                    >
                      {codes_used} used
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: codes_total }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-1 rounded-full"
                      style={{
                        backgroundColor:
                          i < codes_remaining
                            ? "var(--accent-color)"
                            : "var(--border-secondary)",
                      }}
                    />
                  ))}
                </div>
              </div>

              {codes_remaining <= 2 && codes_remaining > 0 && (
                <div
                  className="px-4 py-2.5 flex items-center gap-2"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.05)",
                    borderTop: "1px solid var(--border-primary)",
                  }}
                >
                  <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-500">
                    Running low on recovery codes. Consider regenerating them.
                  </p>
                </div>
              )}

              <AnimatePresence mode="wait">
                {show_recovery_codes && recovery_codes && (
                  <motion.div
                    key={codes_key}
                    animate={{ opacity: 1 }}
                    className="px-4 py-3"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    style={{ borderTop: "1px solid var(--border-primary)" }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {recovery_codes.map((code, index) => (
                        <div
                          key={`${codes_key}-${index}`}
                          className="flex items-center gap-2 px-3 py-2 rounded-md"
                          style={{ backgroundColor: "var(--bg-secondary)" }}
                        >
                          <span
                            className="text-[10px] font-medium w-4"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {index + 1}
                          </span>
                          <code
                            className="text-xs font-mono"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {code}
                          </code>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                        }}
                        onClick={handle_download_codes}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-hover)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-secondary)")
                        }
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        Download PDF
                      </button>
                      <button
                        className="flex items-center justify-center px-3 py-2 rounded-md transition-colors"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                        }}
                        onClick={handle_copy_all_codes}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-hover)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-secondary)")
                        }
                      >
                        <ClipboardIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className="px-4 py-3"
                style={{ borderTop: "1px solid var(--border-primary)" }}
              >
                {show_regenerate_confirm ? (
                  <div>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Regenerate all codes?
                    </p>
                    <p
                      className="text-xs mb-3"
                      style={{ color: "var(--text-muted)" }}
                    >
                      All existing codes will be invalidated. Type{" "}
                      <code
                        className="px-1 py-0.5 rounded text-[10px]"
                        style={{ backgroundColor: "var(--bg-secondary)" }}
                      >
                        regenerate
                      </code>{" "}
                      to confirm.
                    </p>
                    <div className="flex gap-2">
                      <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="flex-1 px-3 py-2 text-sm rounded-md outline-none border border-transparent focus:border-blue-500 transition-colors"
                        placeholder="Type regenerate"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                        type="text"
                        value={regenerate_confirm_text}
                        onChange={(e) =>
                          set_regenerate_confirm_text(e.target.value)
                        }
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          regenerate_confirm_text.toLowerCase() ===
                            "regenerate" &&
                          handle_regenerate_codes()
                        }
                      />
                      <button
                        className="px-3 py-2 text-xs font-medium rounded-md transition-colors"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-muted)",
                        }}
                        onClick={() => {
                          set_show_regenerate_confirm(false);
                          set_regenerate_confirm_text("");
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-hover)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--bg-secondary)")
                        }
                      >
                        Cancel
                      </button>
                      <button
                        className="px-3 py-2 text-xs font-medium text-white rounded-md transition-all disabled:opacity-50"
                        disabled={
                          regenerate_confirm_text.toLowerCase() !==
                            "regenerate" || is_regenerating
                        }
                        style={{ backgroundColor: "#ef4444" }}
                        onClick={handle_regenerate_codes}
                      >
                        {is_regenerating ? "..." : "Confirm"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                    }}
                    onClick={() => set_show_regenerate_confirm(true)}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--bg-secondary)")
                    }
                  >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    Regenerate Codes
                  </button>
                )}
              </div>
            </div>

            <div
              className="rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      End-to-End Encrypted
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      All your data is protected with zero-knowledge encryption
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    {
                      icon: EnvelopeIcon,
                      label: "Email content & attachments",
                    },
                    { icon: FolderIcon, label: "Folder names & structure" },
                    { icon: MagnifyingGlassIcon, label: "Search index" },
                    { icon: DocumentTextIcon, label: "Drafts & signatures" },
                    { icon: UserIcon, label: "Contact information" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 px-3 py-2 rounded-md"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <item.icon
                        className="w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <span
                        className="flex-1 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {item.label}
                      </span>
                      <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: DevicePhoneMobileIcon,
                  title: "Client-Side Encryption",
                  desc: "Your emails are encrypted on your device before being sent to our servers.",
                },
                {
                  icon: ServerIcon,
                  title: "Zero-Knowledge Storage",
                  desc: "We never have access to your encryption keys or unencrypted data.",
                },
                {
                  icon: KeyIcon,
                  title: "PGP Compatible",
                  desc: "Send encrypted emails to anyone using PGP.",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <item.icon
                      className="w-[18px] h-[18px]"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {pgp_key && pgp_key.decrypt_count > 0 && (
              <div
                className="rounded-lg p-4"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p
                      className="text-2xl font-semibold tabular-nums"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {pgp_key.decrypt_count.toLocaleString()}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Emails decrypted
                    </p>
                  </div>
                  {pgp_key.last_used_decrypt_at && (
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {format_date(pgp_key.last_used_decrypt_at)}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Last decryption
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
