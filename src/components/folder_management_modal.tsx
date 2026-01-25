import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  LockClosedIcon,
  PencilIcon,
  SwatchIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { use_folders } from "@/hooks/use_folders";

const MAX_FOLDER_NAME_LENGTH = 100;

interface FolderManagementModalProps {
  is_open: boolean;
  on_close: () => void;
  folder_id: string;
  folder_name: string;
  folder_color: string;
  is_locked: boolean;
  action: "encrypt" | "rename" | "recolor" | "delete" | null;
}

const PRESET_COLORS = [
  { name: "Orange", value: "#f97316" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Red", value: "#ef4444" },
  { name: "Yellow", value: "#eab308" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
];

export function FolderManagementModal({
  is_open,
  on_close,
  folder_id,
  folder_name,
  folder_color,
  is_locked,
  action,
}: FolderManagementModalProps) {
  const {
    update_existing_folder,
    delete_existing_folder,
    toggle_folder_lock,
    state: folders_state,
  } = use_folders();

  const [new_name, set_new_name] = useState(folder_name);
  const [new_color, set_new_color] = useState(folder_color);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");

  const trimmed_name = new_name.trim();

  const rename_validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_FOLDER_NAME_LENGTH) {
      return `Folder name must be ${MAX_FOLDER_NAME_LENGTH} characters or less`;
    }
    if (trimmed_name.toLowerCase() === folder_name.toLowerCase()) {
      return null;
    }
    const duplicate_exists = folders_state.folders.some(
      (f) =>
        f.id !== folder_id &&
        f.name.toLowerCase() === trimmed_name.toLowerCase(),
    );

    if (duplicate_exists) {
      return "A folder with this name already exists";
    }

    return null;
  }, [trimmed_name, folder_name, folder_id, folders_state.folders]);

  const can_rename = trimmed_name && !rename_validation_error;

  useEffect(() => {
    set_new_name(folder_name);
    set_new_color(folder_color);
    set_error("");
  }, [folder_name, folder_color, is_open]);

  const handle_rename = async () => {
    if (!trimmed_name) {
      set_error("Folder name cannot be empty");

      return;
    }

    if (rename_validation_error) {
      set_error(rename_validation_error);

      return;
    }

    set_is_loading(true);
    set_error("");

    const success = await update_existing_folder(folder_id, trimmed_name);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error("Failed to rename folder");
    }
  };

  const handle_recolor = async () => {
    set_is_loading(true);
    set_error("");

    const success = await update_existing_folder(
      folder_id,
      undefined,
      new_color,
    );

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error("Failed to change folder color");
    }
  };

  const handle_delete = async () => {
    set_is_loading(true);
    set_error("");

    const success = await delete_existing_folder(folder_id);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error("Failed to delete folder");
    }
  };

  const handle_encrypt = async () => {
    set_is_loading(true);
    set_error("");

    const success = await toggle_folder_lock(folder_id, !is_locked);

    set_is_loading(false);

    if (success) {
      on_close();
    } else {
      set_error("Failed to update folder encryption");
    }
  };

  const render_content = () => {
    switch (action) {
      case "encrypt":
        return (
          <div className="px-6 pt-6 pb-6">
            <div className="flex items-center gap-3 mb-4">
              {is_locked ? (
                <ShieldCheckIcon className="w-5 h-5 text-green-500" />
              ) : (
                <LockClosedIcon className="w-5 h-5 text-blue-500" />
              )}
              <div>
                <h3
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {is_locked ? "Unlock Folder" : "Lock Folder"}
                </h3>
                <p
                  className="text-[13px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {folder_name}
                </p>
              </div>
            </div>

            {!is_locked && (
              <div
                className="rounded-lg p-4 mb-4 border"
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  borderColor: "rgba(59, 130, 246, 0.2)",
                }}
              >
                <div className="flex items-start gap-3">
                  <ShieldCheckIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                      Extra Protection Layer
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Your data is already encrypted. Locking this folder adds
                      an <strong>additional encryption layer</strong>, requiring
                      extra authentication to access its contents.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <p
              className="text-[14px] mb-6"
              style={{ color: "var(--text-secondary)" }}
            >
              {is_locked
                ? "This will unlock the folder and remove the extra protection layer. Your data will remain encrypted with standard encryption."
                : "Locking adds extra security on top of existing encryption. You can unlock it at any time."}
            </p>

            {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

            <div className="flex gap-3">
              <Button
                className="flex-1"
                disabled={is_loading}
                size="lg"
                variant="outline"
                onClick={on_close}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="lg"
                variant={is_locked ? "destructive" : "primary"}
                onClick={handle_encrypt}
              >
                {is_loading
                  ? "Processing..."
                  : is_locked
                    ? "Unlock Folder"
                    : "Lock Folder"}
              </Button>
            </div>
          </div>
        );

      case "rename":
        return (
          <div className="px-6 pt-6 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <PencilIcon className="w-5 h-5 text-blue-500" />
              <div>
                <h3
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Rename Folder
                </h3>
                <p
                  className="text-[13px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Enter a new name for this folder
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label
                className="block text-[13px] font-medium mb-2"
                htmlFor="folder-rename"
                style={{ color: "var(--text-secondary)" }}
              >
                Folder name
              </label>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full h-10 px-3 rounded-lg text-[14px] outline-none transition-colors"
                id="folder-rename"
                placeholder="Enter folder name"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-secondary)",
                  color: "var(--text-primary)",
                }}
                type="text"
                value={new_name}
                onChange={(e) => set_new_name(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle_rename()}
              />
            </div>

            {(rename_validation_error || error) && (
              <p className="text-[13px] text-red-500 mb-4">
                {rename_validation_error || error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                className="flex-1 h-10 px-5 rounded-lg text-[14px] font-normal border transition-colors disabled:opacity-50"
                disabled={is_loading}
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
                onClick={on_close}
              >
                Cancel
              </button>
              <Button
                className="flex-1"
                disabled={is_loading || !can_rename}
                size="lg"
                variant="primary"
                onClick={handle_rename}
              >
                {is_loading ? "Renaming..." : "Rename"}
              </Button>
            </div>
          </div>
        );

      case "recolor":
        return (
          <div className="px-6 pt-6 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <SwatchIcon className="w-5 h-5" style={{ color: folder_color }} />
              <div>
                <h3
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Change Folder Color
                </h3>
                <p
                  className="text-[13px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {folder_name}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <label
                className="block text-[13px] font-medium mb-3"
                htmlFor="folder-color"
                style={{ color: "var(--text-secondary)" }}
              >
                Select a color
              </label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className="w-10 h-10 rounded-lg transition-all flex items-center justify-center"
                    style={{
                      backgroundColor: color.value,
                      border:
                        new_color === color.value
                          ? "3px solid var(--text-primary)"
                          : "none",
                      transform:
                        new_color === color.value ? "scale(1.1)" : "scale(1)",
                    }}
                    title={color.name}
                    onClick={() => set_new_color(color.value)}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                className="flex-1 h-10 px-5 rounded-lg text-[14px] font-normal border transition-colors disabled:opacity-50"
                disabled={is_loading}
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
                onClick={on_close}
              >
                Cancel
              </button>
              <Button
                className="flex-1 text-white"
                disabled={is_loading}
                size="lg"
                style={{ backgroundColor: new_color }}
                variant="primary"
                onClick={handle_recolor}
              >
                {is_loading ? "Saving..." : "Save Color"}
              </Button>
            </div>
          </div>
        );

      case "delete":
        return (
          <div className="px-6 pt-6 pb-6">
            <div className="flex items-center gap-3 mb-4">
              <TrashIcon className="w-5 h-5 text-red-500" />
              <div>
                <h3
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Delete Folder
                </h3>
                <p
                  className="text-[13px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {folder_name}
                </p>
              </div>
            </div>

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
                  <p className="text-[13px] font-medium text-red-600 dark:text-red-400 mb-1">
                    This action cannot be undone
                  </p>
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    The folder will be permanently deleted. Emails in this
                    folder will not be deleted, but they will no longer be
                    associated with this folder.
                  </p>
                </div>
              </div>
            </div>

            <p
              className="text-[14px] mb-6"
              style={{ color: "var(--text-secondary)" }}
            >
              Are you sure you want to delete the folder{" "}
              <strong>&quot;{folder_name}&quot;</strong>?
            </p>

            {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                className="flex-1 h-10 px-5 rounded-lg text-[14px] font-normal border transition-colors disabled:opacity-50"
                disabled={is_loading}
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-primary)",
                  color: "var(--text-primary)",
                }}
                onClick={on_close}
              >
                Cancel
              </button>
              <Button
                className="flex-1"
                disabled={is_loading}
                size="lg"
                variant="destructive"
                onClick={handle_delete}
              >
                {is_loading ? "Deleting..." : "Delete Folder"}
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={on_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden"
            exit={{ opacity: 0, scale: 0.96, y: 0 }}
            initial={{ opacity: 0, scale: 0.96, y: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <button
              className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/10 z-10"
              style={{ color: "var(--text-muted)" }}
              onClick={on_close}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
            {render_content()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
