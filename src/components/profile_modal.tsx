import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CameraIcon,
  ArrowPathIcon,
  UserIcon,
  EnvelopeIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { update_profile_picture } from "@/services/api/user";
import { use_auth } from "@/contexts/auth_context";

const MAX_IMAGE_SIZE = 256;
const IMAGE_QUALITY = 0.8;
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function compress_image(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const object_url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(object_url);

      let { width, height } = img;

      if (width > height) {
        if (width > MAX_IMAGE_SIZE) {
          height = Math.round((height * MAX_IMAGE_SIZE) / width);
          width = MAX_IMAGE_SIZE;
        }
      } else {
        if (height > MAX_IMAGE_SIZE) {
          width = Math.round((width * MAX_IMAGE_SIZE) / height);
          height = MAX_IMAGE_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        const data_url = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);

        resolve(data_url);
      } else {
        reject(new Error("Failed to get canvas context"));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(object_url);
      reject(new Error("Failed to load image"));
    };

    img.src = object_url;
  });
}

interface ProfileModalProps {
  is_open: boolean;
  on_close: () => void;
  on_edit_profile: () => void;
  profile_picture: string;
  user_name: string;
  user_email: string;
}

export function ProfileModal({
  is_open,
  on_close,
  on_edit_profile,
  profile_picture,
  user_name,
  user_email,
}: ProfileModalProps) {
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [preview, set_preview] = useState<string | null>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const { user, update_user } = use_auth();

  const reset_state = () => {
    set_error(null);
    set_preview(null);
    if (file_input_ref.current) {
      file_input_ref.current.value = "";
    }
  };

  const handle_close = () => {
    reset_state();
    on_close();
  };

  const validate_file = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Please select a valid image (JPEG, PNG, GIF, or WebP)";
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `Image must be smaller than ${MAX_FILE_SIZE_MB}MB`;
    }

    return null;
  };

  const handle_picture_change = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    set_error(null);

    const validation_error = validate_file(file);

    if (validation_error) {
      set_error(validation_error);

      return;
    }

    set_is_saving(true);

    try {
      const compressed = await compress_image(file);

      set_preview(compressed);

      const response = await update_profile_picture(compressed);

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data?.success && user) {
        await update_user({ ...user, profile_picture: compressed });
        set_preview(null);
      } else {
        throw new Error("Failed to save profile picture");
      }
    } catch (err) {
      set_preview(null);
      set_error(
        err instanceof Error ? err.message : "Failed to update profile picture",
      );
    } finally {
      set_is_saving(false);
      if (file_input_ref.current) {
        file_input_ref.current.value = "";
      }
    }
  };

  const displayed_picture = preview || profile_picture;

  return (
    <Modal is_open={is_open} on_close={handle_close} size="sm">
      <div className="pt-8 pb-6 px-6">
        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            {displayed_picture ? (
              <img
                alt={user_name}
                className="w-24 h-24 rounded-full ring-4 ring-blue-500/20 ring-offset-2 ring-offset-transparent object-cover"
                src={displayed_picture}
              />
            ) : (
              <div className="ring-4 ring-blue-500/20 ring-offset-2 ring-offset-transparent rounded-full">
                <ProfileAvatar name={user_name} size="xl" />
              </div>
            )}

            {is_saving && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                <ArrowPathIcon className="w-6 h-6 text-white animate-spin" />
              </div>
            )}

            <button
              className="absolute -bottom-1 -right-1 p-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-all duration-150 hover:scale-105 disabled:opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] active:shadow-[0_1px_1px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(0,0,0,0.1)] active:translate-y-px"
              disabled={is_saving}
              onClick={() => file_input_ref.current?.click()}
            >
              <CameraIcon className="w-3.5 h-3.5" />
            </button>

            <input
              ref={file_input_ref}
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              type="file"
              onChange={handle_picture_change}
            />
          </div>

          <button
            className="text-[13px] font-medium text-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50"
            disabled={is_saving}
            onClick={() => file_input_ref.current?.click()}
          >
            {is_saving ? "Uploading..." : "Change photo"}
          </button>

          <AnimatePresence>
            {error && (
              <motion.p
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-500 text-center mt-3"
                exit={{ opacity: 0, y: -5 }}
                initial={{ opacity: 0, y: -5 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-8 space-y-4">
          <div
            className="flex items-center gap-3 p-3 rounded-xl transition-colors"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-card)" }}
            >
              <UserIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Name
              </p>
              <p
                className="text-[14px] font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {user_name}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-3 p-3 rounded-xl transition-colors"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-card)" }}
            >
              <EnvelopeIcon
                className="w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Email
              </p>
              <p
                className="text-[14px] font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {user_email}
              </p>
            </div>
          </div>
        </div>
      </div>

      <ModalFooter className="justify-center">
        <Button
          size="lg"
          variant="primary"
          onClick={() => {
            handle_close();
            on_edit_profile();
          }}
        >
          <PencilIcon className="w-3.5 h-3.5 mr-2" />
          Edit Profile
        </Button>
      </ModalFooter>
    </Modal>
  );
}
