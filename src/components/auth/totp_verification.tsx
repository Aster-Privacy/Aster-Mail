import { useState, useRef, useEffect, useCallback } from "react";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { verify_totp_login, TotpVerifyResponse } from "@/services/api/totp";

interface TotpVerificationProps {
  pending_login_token: string;
  on_success: (response: TotpVerifyResponse) => void;
  on_use_backup_code: () => void;
  on_cancel: () => void;
}

export function TotpVerification({
  pending_login_token,
  on_success,
  on_use_backup_code,
  on_cancel,
}: TotpVerificationProps) {
  const [code, set_code] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_refs = useRef<(HTMLInputElement | null)[]>([]);

  const handle_verify = useCallback(async () => {
    if (code.length !== 6) return;

    set_is_loading(true);
    set_error("");

    const response = await verify_totp_login({
      code,
      pending_login_token,
    });

    if (response.error) {
      set_error(response.error);
      set_code("");
      input_refs.current[0]?.focus();
      set_is_loading(false);

      return;
    }

    if (response.data) {
      on_success(response.data);
    }

    set_is_loading(false);
  }, [code, pending_login_token, on_success]);

  useEffect(() => {
    if (code.length === 6 && !is_loading) {
      handle_verify();
    }
  }, [code, is_loading, handle_verify]);

  useEffect(() => {
    input_refs.current[0]?.focus();
  }, []);

  const handle_code_input = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const new_code = code.split("");

    new_code[index] = value.slice(-1);
    const updated_code = new_code.join("").slice(0, 6);

    set_code(updated_code);

    if (value && index < 5) {
      input_refs.current[index + 1]?.focus();
    }
  };

  const handle_key_down = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      input_refs.current[index - 1]?.focus();
    }
  };

  const handle_paste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    set_code(pasted);
    const focus_index = Math.min(pasted.length, 5);

    input_refs.current[focus_index]?.focus();
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <ShieldCheckIcon
              className="w-8 h-8"
              style={{ color: "var(--accent-primary)" }}
            />
          </div>
        </div>
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Two-Factor Authentication
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Enter the 6-digit code from your authenticator app
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <input
              key={index}
              ref={(el) => {
                input_refs.current[index] = el;
              }}
              className="w-11 h-14 text-center text-xl font-semibold rounded-lg border transition-colors outline-none disabled:opacity-50"
              disabled={is_loading}
              inputMode="numeric"
              maxLength={1}
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: error ? "#ef4444" : "var(--input-border)",
                color: "var(--text-primary)",
              }}
              type="text"
              value={code[index] || ""}
              onBlur={(e) => {
                e.target.style.borderColor = error
                  ? "#ef4444"
                  : "var(--input-border)";
              }}
              onChange={(e) => handle_code_input(index, e.target.value)}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--accent-color)";
              }}
              onKeyDown={(e) => handle_key_down(index, e)}
              onPaste={handle_paste}
            />
          ))}
        </div>

        {error && <p className="text-sm text-center text-red-500">{error}</p>}

        {is_loading && (
          <div className="flex justify-center">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border-secondary)",
                borderTopColor: "var(--accent-color)",
              }}
            />
          </div>
        )}

        <Button className="w-full" variant="outline" onClick={on_cancel}>
          Cancel
        </Button>

        <button
          className="w-full text-sm text-center transition-colors hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
          type="button"
          onClick={on_use_backup_code}
        >
          Use a backup code instead
        </button>
      </div>
    </div>
  );
}
