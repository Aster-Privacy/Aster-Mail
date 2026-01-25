import { useState, useRef, useEffect } from "react";
import { KeyIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  verify_backup_code_login,
  TotpVerifyResponse,
} from "@/services/api/totp";

interface BackupCodeInputProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_authenticator: () => void;
  on_cancel: () => void;
}

export function BackupCodeInput({
  pending_login_token,
  on_success,
  on_use_authenticator,
  on_cancel,
}: BackupCodeInputProps) {
  const [code, set_code] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  const handle_verify = async () => {
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (normalized.length !== 8) {
      set_error("Backup code must be 8 characters");

      return;
    }

    set_is_loading(true);
    set_error("");

    const formatted_code = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;

    const response = await verify_backup_code_login({
      code: formatted_code,
      pending_login_token,
    });

    if (response.error) {
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      on_success(response.data);
    }

    set_is_loading(false);
  };

  const handle_input_change = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");

    set_code(cleaned);
    set_error("");
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handle_verify();
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <KeyIcon
              className="w-8 h-8"
              style={{ color: "var(--accent-primary)" }}
            />
          </div>
        </div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Enter Backup Code
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Enter one of your backup codes to sign in
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <input
            ref={input_ref}
            className="w-full px-4 py-3 text-center text-lg font-mono tracking-wider rounded-lg border transition-colors outline-none disabled:opacity-50 uppercase"
            disabled={is_loading}
            maxLength={9}
            placeholder="XXXX-XXXX"
            style={{
              backgroundColor: "var(--input-bg)",
              borderColor: error ? "#ef4444" : "var(--input-border)",
              color: "var(--text-primary)",
            }}
            type="text"
            value={code}
            onBlur={(e) => {
              e.target.style.borderColor = error
                ? "#ef4444"
                : "var(--input-border)";
            }}
            onChange={(e) => handle_input_change(e.target.value)}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--accent-color)";
            }}
            onKeyDown={handle_key_down}
          />
          <p
            className="text-xs text-center mt-2"
            style={{ color: "var(--text-muted)" }}
          >
            Each backup code can only be used once
          </p>
        </div>

        {error && <p className="text-sm text-center text-red-500">{error}</p>}

        <div className="flex gap-3">
          <Button className="flex-1" variant="outline" onClick={on_cancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={
              is_loading || code.replace(/[^A-Z0-9]/gi, "").length !== 8
            }
            variant="primary"
            onClick={handle_verify}
          >
            {is_loading ? "Verifying..." : "Continue"}
          </Button>
        </div>

        <button
          className="w-full text-sm text-center transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
          type="button"
          onClick={on_use_authenticator}
        >
          Use authenticator app instead
        </button>
      </div>
    </div>
  );
}
