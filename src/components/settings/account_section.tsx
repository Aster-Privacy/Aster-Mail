import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CameraIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

import { DeleteAccountModal } from "@/components/modals/delete_account_modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { PROFILE_COLORS } from "@/constants/profile";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  update_display_name,
  update_profile_picture,
} from "@/services/api/user";
import {
  get_recovery_email,
  save_recovery_email,
  resend_recovery_verification,
} from "@/services/api/recovery_email";

const MAX_SIZE = 256;

function compress_image(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > height && width > MAX_SIZE) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } else reject(new Error("No canvas context"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Load failed"));
    };
    img.src = url;
  });
}

function mask_email(email: string): string {
  const [local, domain] = email.split("@");

  if (!domain) return email;
  const masked_local = local.length > 0 ? local[0] + "***" : "***";

  return `${masked_local}@${domain}`;
}

interface RecoveryModalProps {
  is_open: boolean;
  on_close: () => void;
  on_save: (email: string) => Promise<void>;
  current: string | null;
}

function RecoveryModal({
  is_open,
  on_close,
  on_save,
  current,
}: RecoveryModalProps) {
  const [email, set_email] = useState(current || "");
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (is_open) {
      set_email(current || "");
      set_error(null);
    }
  }, [is_open, current]);

  const handle_save = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      set_error("Enter a valid email");

      return;
    }
    set_saving(true);
    try {
      await on_save(email);
      on_close();
    } catch {
      set_error("Failed to save");
    } finally {
      set_saving(false);
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="sm">
      <ModalHeader>
        <ModalTitle>Recovery email</ModalTitle>
        <ModalDescription>
          This email will be used to recover your account if you lose access.
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <Input
          autoFocus
          placeholder="Enter recovery email"
          type="email"
          value={email}
          onChange={(e) => set_email(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle_save()}
        />
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={handle_save}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

interface AccountSectionProps {
  on_account_deleted?: () => void;
}

export function AccountSection({ on_account_deleted }: AccountSectionProps) {
  const { user, update_user, vault } = use_auth();
  const { preferences, update_preference, reset_to_defaults } =
    use_preferences();
  const file_ref = useRef<HTMLInputElement>(null);

  const [color, set_color] = useState(
    preferences.profile_color || PROFILE_COLORS[5],
  );
  const [name, set_name] = useState(user?.display_name || user?.username || "");
  const [saving_name, set_saving_name] = useState(false);
  const [uploading, set_uploading] = useState(false);
  const [preview, set_preview] = useState<string | null>(null);
  const [recovery, set_recovery] = useState<{
    email: string | null;
    verified: boolean;
  }>({ email: null, verified: false });
  const [show_modal, set_show_modal] = useState(false);
  const [pending, set_pending] = useState(false);
  const [resending, set_resending] = useState(false);
  const [show_delete_modal, set_show_delete_modal] = useState(false);
  const [show_reset_confirm, set_show_reset_confirm] = useState(false);
  const [reset_text, set_reset_text] = useState("");
  const [photo_error, set_photo_error] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!vault) return;
      try {
        const r = await get_recovery_email(vault);

        set_recovery(r.data);
      } catch {
        set_recovery({ email: null, verified: false });
      }
    };

    load();
  }, [vault]);

  useEffect(() => {
    set_name(user?.display_name || user?.username || "");
  }, [user]);

  useEffect(() => {
    if (preferences.profile_color) {
      set_color(preferences.profile_color);
    }
  }, [preferences.profile_color]);

  const save_name = async () => {
    if (!name.trim() || !user || name === (user.display_name || user.username))
      return;
    set_saving_name(true);
    try {
      const r = await update_display_name(name);

      if (r.data?.user)
        await update_user({
          ...user,
          display_name: r.data.user.display_name || undefined,
        });
    } catch {
      return;
    }
    set_saving_name(false);
  };

  const handle_photo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      set_photo_error("Please select a valid image (JPEG, PNG, or WebP)");

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      set_photo_error("Image must be smaller than 5MB");

      return;
    }

    set_uploading(true);
    set_photo_error(null);

    try {
      const compressed = await compress_image(file);

      set_preview(compressed);

      const response = await update_profile_picture(compressed);

      if (response.error) {
        set_photo_error(response.error);
        set_preview(null);
      } else if (response.data?.success && user) {
        await update_user({
          ...user,
          profile_picture: compressed,
        });
        set_preview(null);
        set_photo_error(null);
        show_toast("Profile picture updated", "success");
      } else {
        set_photo_error("Failed to save profile picture");
        set_preview(null);
      }
    } catch (err) {
      set_preview(null);
      set_photo_error(
        err instanceof Error ? err.message : "Failed to upload image",
      );
    } finally {
      set_uploading(false);
      if (file_ref.current) {
        file_ref.current.value = "";
      }
    }
  };

  const save_recovery = async (email: string) => {
    if (!vault) return;
    const r = await save_recovery_email(email, vault);

    if (r.data.success) {
      set_recovery({ email, verified: false });
      set_pending(true);
    } else throw new Error("Failed");
  };

  const handle_resend = async () => {
    if (resending) return;
    set_resending(true);
    try {
      const r = await resend_recovery_verification();

      if (r.data.success) {
        set_pending(true);
        show_toast("Verification email sent", "success");
      } else {
        show_toast("Failed to send verification email", "error");
      }
    } catch {
      show_toast("Failed to send verification email", "error");
    } finally {
      set_resending(false);
    }
  };

  const picture = preview || user?.profile_picture || "/profile.webp";

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--border-secondary)",
        }}
      >
        <div
          className="h-20"
          style={{
            backgroundColor: color,
          }}
        />
        <div className="px-5 pb-5 -mt-8 flex items-end justify-between">
          <div className="relative">
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg relative">
              <img
                alt=""
                className="w-full h-full object-cover rounded-xl"
                src={picture}
                style={{ border: "3px solid var(--bg-primary)" }}
              />
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                  <ArrowPathIcon className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </div>
            <button
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-colors disabled:opacity-50"
              disabled={uploading}
              style={{
                backgroundColor: "var(--bg-card)",
                border: "2px solid var(--border-secondary)",
                color: "var(--text-muted)",
              }}
              onClick={() => file_ref.current?.click()}
              onMouseEnter={(e) => {
                if (!uploading) {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                }
              }}
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-card)")
              }
            >
              {uploading ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CameraIcon className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={file_ref}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              type="file"
              onChange={handle_photo}
            />
          </div>
          {photo_error && (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-medium mt-2"
              exit={{ opacity: 0, y: -5 }}
              initial={{ opacity: 0, y: -5 }}
              style={{ color: "#ef4444" }}
            >
              {photo_error}
            </motion.p>
          )}
          <div className="flex items-center gap-2.5">
            {PROFILE_COLORS.map((c) => {
              const is_selected = c === color;

              return (
                <button
                  key={c}
                  className="relative w-7 h-7 rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: c,
                    boxShadow: is_selected
                      ? `0 0 0 2px var(--bg-tertiary), 0 0 0 3.5px ${c}, 0 2px 8px ${c}50`
                      : `inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15), 0 2px 6px ${c}30`,
                  }}
                  onClick={() => {
                    set_color(c);
                    update_preference("profile_color", c);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between py-4 px-1">
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Display name
          </p>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            The name others in your workspace will see
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="w-48"
            value={name}
            onBlur={save_name}
            onChange={(e) => set_name(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save_name()}
          />
          {saving_name && (
            <ArrowPathIcon
              className="w-4 h-4 animate-spin"
              style={{ color: "var(--text-muted)" }}
            />
          )}
        </div>
      </div>

      <div className="py-4 px-1">
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Recovery email address
            </p>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              This is the email used to recover your account
            </p>
          </div>
          <div className="flex items-center gap-3">
            {recovery.email && (
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {mask_email(recovery.email)}
                </span>
                {recovery.verified ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircleIcon className="w-4 h-4" />
                    Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <ExclamationCircleIcon className="w-4 h-4" />
                    Not verified
                  </span>
                )}
              </div>
            )}
            {recovery.email && !recovery.verified && (
              <Button
                disabled={resending}
                size="sm"
                variant="ghost"
                onClick={handle_resend}
              >
                {resending ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  "Resend"
                )}
              </Button>
            )}
            <Button variant="secondary" onClick={() => set_show_modal(true)}>
              {recovery.email ? "Update" : "Add"}
            </Button>
          </div>
        </div>
        {pending && recovery.email && !recovery.verified && (
          <p className="text-sm mt-3" style={{ color: "var(--text-tertiary)" }}>
            Verification email sent to {mask_email(recovery.email)}. Check your
            inbox and click the link to verify.
          </p>
        )}
      </div>

      <div className="py-4 px-1">
        {show_reset_confirm ? (
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-secondary)",
            }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: "rgba(245, 158, 11, 0.1)" }}
              >
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Reset all settings to defaults?
                </p>
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  This will reset all your preferences including appearance,
                  email settings, and notifications. Type{" "}
                  <span className="font-mono font-semibold">RESET</span> to
                  confirm.
                </p>
              </div>
            </div>
            <Input
              autoFocus
              className="mb-4"
              placeholder="Type RESET to confirm"
              value={reset_text}
              onChange={(e) => set_reset_text(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && reset_text === "RESET") {
                  reset_to_defaults();
                  set_show_reset_confirm(false);
                  set_reset_text("");
                }
                if (e.key === "Escape") {
                  set_show_reset_confirm(false);
                  set_reset_text("");
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  set_show_reset_confirm(false);
                  set_reset_text("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-600"
                disabled={reset_text !== "RESET"}
                onClick={() => {
                  if (reset_text === "RESET") {
                    reset_to_defaults();
                    set_show_reset_confirm(false);
                    set_reset_text("");
                  }
                }}
              >
                Reset Settings
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Reset all settings
              </p>
              <p
                className="text-sm mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Restore all preferences to their default values
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => set_show_reset_confirm(true)}
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between py-4 px-1">
        <div>
          <p className="text-sm font-medium text-red-500">Delete account</p>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Erase all your content and data permanently
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => set_show_delete_modal(true)}
        >
          Delete
        </Button>
      </div>

      <RecoveryModal
        current={recovery.email}
        is_open={show_modal}
        on_close={() => set_show_modal(false)}
        on_save={save_recovery}
      />

      <DeleteAccountModal
        is_open={show_delete_modal}
        on_close={() => set_show_delete_modal(false)}
        on_deleted={() => {
          set_show_delete_modal(false);
          on_account_deleted?.();
        }}
      />
    </div>
  );
}
