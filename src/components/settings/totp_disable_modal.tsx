import { useState, useRef, useEffect } from "react";
import {
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { disable_totp } from "@/services/api/totp";
import { get_user_salt } from "@/services/api/auth";
import { use_auth } from "@/contexts/auth_context";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

interface TotpDisableModalProps {
  is_open: boolean;
  on_close: () => void;
  on_success: () => void;
}

export function TotpDisableModal({
  is_open,
  on_close,
  on_success,
}: TotpDisableModalProps) {
  const { user } = use_auth();
  const [code, set_code] = useState("");
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const input_refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (is_open) {
      set_code("");
      set_password("");
      set_error("");
      setTimeout(() => input_refs.current[0]?.focus(), 100);
    }
  }, [is_open]);

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

  const handle_disable = async () => {
    if (code.length !== 6 || !password || !user?.email) return;

    set_is_loading(true);
    set_error("");

    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_error(salt_response.error || "Failed to get authentication data");
        set_is_loading(false);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        password,
        salt,
      );

      const response = await disable_totp({
        code,
        password_hash,
      });

      if (response.error) {
        set_error(response.error);
        set_is_loading(false);

        return;
      }

      on_success();
      on_close();
    } catch {
      set_error("Failed to disable 2FA");
    } finally {
      set_is_loading(false);
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <div className="flex items-center gap-3 mb-2">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
          <ModalTitle>Disable Two-Factor Authentication</ModalTitle>
        </div>
        <ModalDescription>
          Enter your authenticator code and password to disable 2FA. This will
          make your account less secure.
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label
              className="text-sm font-medium block mb-2"
              htmlFor="totp-code-0"
              style={{ color: "var(--text-primary)" }}
            >
              Authenticator Code
            </label>
            <div className="flex justify-center gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <input
                  key={index}
                  ref={(el) => {
                    input_refs.current[index] = el;
                  }}
                  className="w-10 h-12 text-center text-lg font-semibold rounded-lg border transition-colors outline-none"
                  disabled={is_loading}
                  id={index === 0 ? "totp-code-0" : undefined}
                  inputMode="numeric"
                  maxLength={1}
                  style={{
                    backgroundColor: "var(--input-bg)",
                    borderColor: "var(--input-border)",
                    color: "var(--text-primary)",
                  }}
                  type="text"
                  value={code[index] || ""}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--input-border)";
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
          </div>

          <div>
            <label
              className="text-sm font-medium block mb-2"
              htmlFor="disable-password"
              style={{ color: "var(--text-primary)" }}
            >
              Password
            </label>
            <div className="relative">
              <input
                className="w-full px-3 py-2 pr-10 text-sm border rounded-lg outline-none transition-colors"
                disabled={is_loading}
                id="disable-password"
                placeholder="Enter your password"
                style={{
                  backgroundColor: "var(--input-bg)",
                  borderColor: "var(--input-border)",
                  color: "var(--text-primary)",
                }}
                type={show_password ? "text" : "password"}
                value={password}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--input-border)";
                }}
                onChange={(e) => set_password(e.target.value)}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent-color)";
                }}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
                type="button"
                onClick={() => set_show_password(!show_password)}
              >
                {show_password ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_loading} variant="outline" onClick={on_close}>
          Cancel
        </Button>
        <Button
          disabled={code.length !== 6 || !password || is_loading}
          variant="destructive"
          onClick={handle_disable}
        >
          {is_loading ? "Disabling..." : "Disable 2FA"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
