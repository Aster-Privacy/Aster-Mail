import type { DecryptedContactPhoto } from "@/types/contacts";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  upload_contact_photo,
  delete_contact_photo,
  revoke_photo_blob_url,
} from "@/services/api/contact_photos";

interface ContactPhotoUploadProps {
  contact_id: string;
  current_photo?: DecryptedContactPhoto | null;
  on_photo_change: (photo: DecryptedContactPhoto | null) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ContactPhotoUpload({
  contact_id,
  current_photo,
  on_photo_change,
  disabled = false,
}: ContactPhotoUploadProps) {
  const [is_uploading, set_is_uploading] = useState(false);
  const [is_deleting, set_is_deleting] = useState(false);
  const [drag_active, set_drag_active] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const input_ref = useRef<HTMLInputElement>(null);

  const handle_file_select = useCallback(
    async (file: File) => {
      set_error(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        set_error("Please select a JPEG, PNG, WebP, or GIF image");

        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        set_error("Image must be smaller than 10MB");

        return;
      }

      set_is_uploading(true);

      try {
        const response = await upload_contact_photo(contact_id, file);

        if (response.error || !response.data) {
          set_error(response.error || "Failed to upload photo");

          return;
        }

        const blob = new Blob([file], { type: file.type });
        const blob_url = URL.createObjectURL(blob);

        on_photo_change({
          id: response.data.id,
          contact_id: response.data.contact_id,
          data: new Uint8Array(await file.arrayBuffer()),
          meta: {
            filename: file.name,
            mime_type: file.type,
          },
          blob_url,
          created_at: response.data.created_at,
        });
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        set_is_uploading(false);
      }
    },
    [contact_id, on_photo_change],
  );

  const handle_drop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      set_drag_active(false);

      const file = e.dataTransfer.files[0];

      if (file) {
        handle_file_select(file);
      }
    },
    [handle_file_select],
  );

  const handle_drag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      set_drag_active(true);
    } else if (e.type === "dragleave") {
      set_drag_active(false);
    }
  }, []);

  const handle_delete = useCallback(async () => {
    if (!current_photo) return;

    set_is_deleting(true);
    set_error(null);

    try {
      const response = await delete_contact_photo(contact_id);

      if (response.error) {
        set_error(response.error);

        return;
      }

      if (current_photo.blob_url) {
        revoke_photo_blob_url(current_photo.blob_url);
      }

      on_photo_change(null);
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      set_is_deleting(false);
    }
  }, [contact_id, current_photo, on_photo_change]);

  const handle_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (file) {
        handle_file_select(file);
      }
      if (input_ref.current) {
        input_ref.current.value = "";
      }
    },
    [handle_file_select],
  );

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground-600">
        Profile Photo
      </label>

      {current_photo?.blob_url ? (
        <div className="relative group">
          <div className="relative w-32 h-32 rounded-xl overflow-hidden border-2 border-divider">
            <img
              alt="Contact photo"
              className="w-full h-full object-cover"
              src={current_photo.blob_url}
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                className="text-white hover:bg-white/20"
                disabled={disabled || is_uploading}
                size="sm"
                variant="ghost"
                onClick={() => input_ref.current?.click()}
              >
                <ArrowUpTrayIcon className="w-5 h-5" />
              </Button>
              <Button
                className="text-white hover:bg-white/20"
                disabled={disabled || is_deleting}
                size="sm"
                variant="ghost"
                onClick={handle_delete}
              >
                <TrashIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>
          {(is_uploading || is_deleting) && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "relative w-32 h-32 rounded-xl border-2 border-dashed transition-colors cursor-pointer",
            drag_active
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          onClick={() => !disabled && input_ref.current?.click()}
          onDragEnter={handle_drag}
          onDragLeave={handle_drag}
          onDragOver={handle_drag}
          onDrop={handle_drop}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground-500">
            {is_uploading ? (
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <PhotoIcon className="w-8 h-8 mb-2" />
                <span className="text-xs text-center px-2">
                  Drop image or click
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <input
        ref={input_ref}
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        disabled={disabled || is_uploading}
        type="file"
        onChange={handle_input_change}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-danger"
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: -10 }}
          >
            <XMarkIcon className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-foreground-500">
        JPEG, PNG, WebP, or GIF. Max 10MB.
      </p>
    </div>
  );
}
