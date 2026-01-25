import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderPlusIcon,
  FolderIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { use_folders } from "@/hooks/use_folders";

const MAX_FOLDER_NAME_LENGTH = 100;

interface CreateFolderModalProps {
  is_open: boolean;
  on_close: () => void;
}

const FOLDER_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
];

export function CreateFolderModal({
  is_open,
  on_close,
}: CreateFolderModalProps) {
  const { create_new_folder, state: folders_state } = use_folders();
  const [folder_name, set_folder_name] = useState("");
  const [selected_color, set_selected_color] = useState(FOLDER_COLORS[5].value);
  const [is_creating, set_is_creating] = useState(false);
  const [error, set_error] = useState("");

  const trimmed_name = folder_name.trim();

  const validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_FOLDER_NAME_LENGTH) {
      return `Folder name must be ${MAX_FOLDER_NAME_LENGTH} characters or less`;
    }
    const duplicate_exists = folders_state.folders.some(
      (f) => f.name.toLowerCase() === trimmed_name.toLowerCase(),
    );

    if (duplicate_exists) {
      return "A folder with this name already exists";
    }

    return null;
  }, [trimmed_name, folders_state.folders]);

  const handle_create = async () => {
    if (!trimmed_name || is_creating || validation_error) return;

    set_is_creating(true);
    set_error("");

    const result = await create_new_folder(trimmed_name, selected_color);

    set_is_creating(false);

    if (result) {
      on_close();
      set_folder_name("");
      set_selected_color(FOLDER_COLORS[5].value);
    } else {
      set_error("Failed to create folder. Please try again.");
    }
  };

  const handle_close = () => {
    if (is_creating) return;
    set_folder_name("");
    set_selected_color(FOLDER_COLORS[5].value);
    set_error("");
    on_close();
  };

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handle_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={{ opacity: 0, scale: 0.96 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-5">
                <FolderPlusIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
                <h2
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Create Folder
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-[13px] font-medium mb-2"
                    htmlFor="create-folder-name"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Folder Name
                  </label>
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="w-full h-10 px-3 rounded-lg text-[14px] outline-none transition-colors focus:ring-0"
                    id="create-folder-name"
                    placeholder="Enter folder name"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-secondary)",
                      color: "var(--text-primary)",
                    }}
                    type="text"
                    value={folder_name}
                    onChange={(e) => set_folder_name(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handle_create()}
                  />
                </div>

                <div>
                  <label
                    className="block text-[13px] font-medium mb-2"
                    htmlFor="create-folder-color"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FOLDER_COLORS.map((color) => (
                      <button
                        key={color.value}
                        className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color.value,
                          boxShadow:
                            selected_color === color.value
                              ? `0 0 0 2px var(--modal-bg), 0 0 0 4px ${color.value}`
                              : "none",
                        }}
                        onClick={() => set_selected_color(color.value)}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <FolderIcon
                    className="w-4 h-4"
                    style={{ color: selected_color }}
                  />
                  <span
                    className="text-[14px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {folder_name || "Folder preview"}
                  </span>
                </div>

                {(validation_error || error) && (
                  <p className="text-[13px] text-red-500 mt-2">
                    {validation_error || error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
              <Button
                disabled={is_creating}
                size="lg"
                variant="outline"
                onClick={handle_close}
              >
                Cancel
              </Button>
              <Button
                className="text-white"
                disabled={!trimmed_name || is_creating || !!validation_error}
                size="lg"
                style={{ backgroundColor: selected_color }}
                variant="primary"
                onClick={handle_create}
              >
                {is_creating && (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                )}
                {is_creating ? "Creating..." : "Create Folder"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
