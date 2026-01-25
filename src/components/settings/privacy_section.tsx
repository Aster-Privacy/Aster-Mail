import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { use_auth } from "@/contexts/auth_context";
import {
  get_key_fingerprint,
  export_private_key_with_confirmation,
  get_recovery_codes_with_confirmation,
  has_vault_in_memory,
} from "@/services/crypto/memory_key_store";

export function PrivacySection() {
  const { user } = use_auth();
  const [show_key_export, set_show_key_export] = useState(false);
  const [key_export_password, set_key_export_password] = useState("");
  const [key_export_error, set_key_export_error] = useState("");
  const [exported_key, set_exported_key] = useState("");
  const [show_recovery_codes, set_show_recovery_codes] = useState(false);
  const [recovery_codes_list, set_recovery_codes_list] = useState<string[]>([]);

  const handle_export_key = async () => {
    set_key_export_error("");
    const result =
      await export_private_key_with_confirmation(key_export_password);

    if (result.success && result.key) {
      set_exported_key(result.key);
    } else {
      set_key_export_error(result.error || "Failed to export key");
    }
  };

  const handle_show_recovery_codes = async () => {
    set_key_export_error("");
    const result =
      await get_recovery_codes_with_confirmation(key_export_password);

    if (result.success && result.codes) {
      set_recovery_codes_list(result.codes);
      set_show_recovery_codes(true);
    } else {
      set_key_export_error(result.error || "Failed to get recovery codes");
    }
  };

  const handle_download_key = () => {
    if (!exported_key) return;
    const blob = new Blob([exported_key], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `astermail-private-key-${user?.username || "user"}.asc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset_state = () => {
    set_show_key_export(false);
    set_key_export_password("");
    set_key_export_error("");
    set_exported_key("");
    set_show_recovery_codes(false);
    set_recovery_codes_list([]);
  };

  return (
    <Card className="border-[var(--border-secondary)] bg-[var(--bg-card)] shadow-none">
      <CardHeader className="pb-3">
        <CardTitle
          className="text-base"
          style={{ color: "var(--text-primary)" }}
        >
          Encryption Keys
        </CardTitle>
        <CardDescription
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Your encryption keys are stored securely in memory and never saved to
          disk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <svg
              className="w-5 h-5 text-green-500"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
            </svg>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              End-to-End Encryption
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
              Always On
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            All your emails are encrypted with your personal keys. Only you can
            read them.
          </p>
        </div>

        {has_vault_in_memory() && (
          <div
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-wide mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Key Fingerprint
            </p>
            <code
              className="text-sm font-mono"
              style={{ color: "var(--text-secondary)" }}
            >
              {get_key_fingerprint() || "Not available"}
            </code>
          </div>
        )}

        {!show_key_export ? (
          <Button
            className="w-full h-9"
            variant="outline"
            onClick={() => set_show_key_export(true)}
          >
            Export Keys & Recovery Codes
          </Button>
        ) : (
          <div
            className="p-4 rounded-lg border space-y-4"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              borderColor: "var(--border-secondary)",
            }}
          >
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <svg
                className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Never share your private key with anyone. Store it securely
                offline.
              </p>
            </div>

            {key_export_error && (
              <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {key_export_error}
                </p>
              </div>
            )}

            {!exported_key && !show_recovery_codes && (
              <>
                <div>
                  <label
                    className="text-xs font-medium block mb-1.5"
                    htmlFor="key-export-password"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Enter your password to continue
                  </label>
                  <Input
                    className="h-8 text-xs"
                    id="key-export-password"
                    placeholder="Your password"
                    type="password"
                    value={key_export_password}
                    onChange={(e) => set_key_export_password(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 h-8 text-xs"
                    disabled={!key_export_password}
                    onClick={handle_export_key}
                  >
                    Export Private Key
                  </Button>
                  <Button
                    className="flex-1 h-8 text-xs"
                    disabled={!key_export_password}
                    variant="outline"
                    onClick={handle_show_recovery_codes}
                  >
                    View Recovery Codes
                  </Button>
                </div>
              </>
            )}

            {exported_key && (
              <div className="space-y-3">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Your Private Key
                </p>
                <textarea
                  readOnly
                  className="w-full px-3 py-2 text-xs font-mono border rounded-lg"
                  rows={6}
                  style={{
                    backgroundColor: "var(--input-bg)",
                    borderColor: "var(--input-border)",
                    color: "var(--text-secondary)",
                  }}
                  value={exported_key}
                />
                <Button
                  className="w-full h-9 text-xs"
                  onClick={handle_download_key}
                >
                  Download Key File
                </Button>
              </div>
            )}

            {show_recovery_codes && recovery_codes_list.length > 0 && (
              <div className="space-y-3">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Your Recovery Codes
                </p>
                <div className="grid gap-2">
                  {recovery_codes_list.map((code, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 px-3 py-2 rounded border"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-secondary)",
                      }}
                    >
                      <span
                        className="text-xs w-4"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {idx + 1}.
                      </span>
                      <code
                        className="font-mono text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {code}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full h-8 text-xs"
              variant="ghost"
              onClick={reset_state}
            >
              Close
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
