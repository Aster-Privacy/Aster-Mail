import { useState } from "react";
import {
  TrashIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_auth } from "@/contexts/auth_context";
import { api_client } from "@/services/api/client";
import { get_user_salt } from "@/services/api/auth";
import {
  hash_email,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";

interface DeleteAccountModalProps {
  is_open: boolean;
  on_close: () => void;
  on_deleted: () => void;
}

export function DeleteAccountModal({
  is_open,
  on_close,
  on_deleted,
}: DeleteAccountModalProps) {
  const { user, logout_all } = use_auth();
  const [confirmation_text, set_confirmation_text] = useState("");
  const [password, set_password] = useState("");
  const [show_password, set_show_password] = useState(false);
  const [is_deleting, set_is_deleting] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [status, set_status] = useState<string | null>(null);

  const expected_text = "delete my account";
  const is_confirmed =
    confirmation_text.toLowerCase() === expected_text && password.length > 0;

  const handle_delete = async () => {
    if (!is_confirmed || !user?.email) return;

    set_is_deleting(true);
    set_error(null);
    set_status("Verifying credentials...");

    try {
      const user_hash = await hash_email(user.email);
      const salt_response = await get_user_salt({ user_hash });

      if (salt_response.error || !salt_response.data) {
        set_error("Failed to verify credentials. Please try again.");
        set_is_deleting(false);
        set_status(null);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash: password_hash } = await derive_password_hash(
        password,
        salt,
      );

      set_status("Deleting account...");

      const response = await api_client.delete<{
        success: boolean;
        message?: string;
      }>("/core/v1/auth/me", { data: { password_hash } });

      if (response.data?.success || response.data?.message) {
        await logout_all();
        on_deleted();
      } else {
        set_error(
          response.error ||
            "Failed to delete account. Please check your password.",
        );
      }
    } catch {
      set_error("An error occurred while deleting your account.");
    } finally {
      set_is_deleting(false);
      set_status(null);
    }
  };

  const handle_close = () => {
    if (is_deleting) return;
    set_confirmation_text("");
    set_password("");
    set_show_password(false);
    set_error(null);
    set_status(null);
    on_close();
  };

  return (
    <Modal
      close_on_overlay={!is_deleting}
      is_open={is_open}
      on_close={handle_close}
      size="md"
    >
      <ModalHeader className="pb-0">
        <div className="flex items-center gap-3">
          <TrashIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div>
            <h3
              className="text-base font-semibold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Delete Account
            </h3>
            <p
              className="text-[13px] mt-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              {user?.email}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div
          className="rounded-lg p-4 mb-4 border"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.05)",
            borderColor: "rgba(239, 68, 68, 0.2)",
          }}
        >
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                This action is permanent and cannot be undone
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                All your emails, folders, contacts, and encryption keys will be
                permanently deleted. You will not be able to recover any data
                associated with this account.
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          To confirm deletion, type{" "}
          <strong className="text-red-500">delete my account</strong> below:
        </p>

        <Input
          autoComplete="off"
          className="mb-3 bg-[var(--input-bg)] border-[var(--border-secondary)] text-[var(--text-primary)]"
          disabled={is_deleting}
          placeholder="Type to confirm"
          type="text"
          value={confirmation_text}
          onChange={(e) => set_confirmation_text(e.target.value)}
        />

        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          Enter your password to confirm:
        </p>

        <div className="relative">
          <Input
            autoComplete="current-password"
            className="pr-10 bg-[var(--input-bg)] border-[var(--border-secondary)] text-[var(--text-primary)]"
            disabled={is_deleting}
            placeholder="Password"
            type={show_password ? "text" : "password"}
            value={password}
            onChange={(e) => set_password(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && is_confirmed && handle_delete()
            }
          />
          <Button
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            disabled={is_deleting}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => set_show_password(!show_password)}
          >
            {show_password ? (
              <EyeSlashIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            ) : (
              <EyeIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        {status && !error && (
          <p className="text-sm mt-4" style={{ color: "var(--text-tertiary)" }}>
            {status}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <Button
          className="flex-1"
          disabled={is_deleting}
          size="lg"
          variant="outline"
          onClick={handle_close}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!is_confirmed || is_deleting}
          size="lg"
          variant="destructive"
          onClick={handle_delete}
        >
          {is_deleting ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Deleting...
            </>
          ) : (
            "Delete Account"
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
