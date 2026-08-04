//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderPlusIcon,
  FolderIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown_menu";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { TAG_COLOR_PRESETS } from "@/components/ui/email_tag";
import {
  use_folders,
  build_folder_tree,
  flatten_folder_tree,
} from "@/hooks/use_folders";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

const MAX_FOLDER_NAME_LENGTH = 100;

interface CreateFolderModalProps {
  is_open: boolean;
  on_close: () => void;
  initial_parent_token?: string;
}

export function CreateFolderModal({
  is_open,
  on_close,
  initial_parent_token,
}: CreateFolderModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { create_new_folder, state: folders_state } = use_folders();
  const [folder_name, set_folder_name] = useState("");
  const [selected_color, set_selected_color] = useState<string>(
    TAG_COLOR_PRESETS[10].hex,
  );
  const [is_creating, set_is_creating] = useState(false);
  const [error, set_error] = useState("");
  const [selected_parent_token, set_selected_parent_token] = useState<
    string | undefined
  >(undefined);
  const [parent_menu_open, set_parent_menu_open] = useState(false);

  useEffect(() => {
    if (is_open) {
      set_selected_parent_token(initial_parent_token);
      set_parent_menu_open(false);
    }
  }, [is_open, initial_parent_token]);

  const parent_options = useMemo(
    () =>
      flatten_folder_tree(build_folder_tree(folders_state.folders)).filter(
        (node) => node.depth < 4,
      ),
    [folders_state.folders],
  );

  const trimmed_name = folder_name.trim();

  const validation_error = useMemo(() => {
    if (!trimmed_name) return null;
    if (trimmed_name.length > MAX_FOLDER_NAME_LENGTH) {
      return t("common.folder_name_too_long", { max: MAX_FOLDER_NAME_LENGTH });
    }
    const duplicate_exists = folders_state.folders.some(
      (f) =>
        f.name.toLowerCase() === trimmed_name.toLowerCase() &&
        (f.parent_token || undefined) === (selected_parent_token || undefined),
    );

    if (duplicate_exists) {
      return t("common.folder_already_exists");
    }

    return null;
  }, [trimmed_name, folders_state.folders, selected_parent_token]);

  const handle_create = async () => {
    if (!trimmed_name || is_creating || validation_error) return;

    set_is_creating(true);
    set_error("");

    const result = await create_new_folder(
      trimmed_name,
      selected_color,
      selected_parent_token,
    );

    set_is_creating(false);

    if (result.folder) {
      on_close();
      set_folder_name("");
      set_selected_color(TAG_COLOR_PRESETS[10].hex);
      set_selected_parent_token(undefined);
    } else if (result.code === "PLAN_LIMIT_EXCEEDED") {
      set_error(t("common.folder_plan_limit_reached"));
    } else if (result.error) {
      set_error(result.error);
    } else {
      set_error(t("common.failed_to_create_folder_error"));
    }
  };

  const handle_close = () => {
    if (is_creating) return;
    set_folder_name("");
    set_selected_color(TAG_COLOR_PRESETS[10].hex);
    set_selected_parent_token(undefined);
    set_error("");
    on_close();
  };

  const selected_parent = selected_parent_token
    ? folders_state.folders.find(
        (f) => f.folder_token === selected_parent_token,
      )
    : undefined;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={handle_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-5">
                <FolderPlusIcon className="w-5 h-5 text-txt-secondary" />
                <h2 className="text-[16px] font-semibold text-txt-primary">
                  {selected_parent_token
                    ? t("common.create_subfolder")
                    : t("common.create_folder")}
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="create-folder-name"
                  >
                    {t("common.folder_name")}
                  </label>
                  <Input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="w-full"
                    id="create-folder-name"
                    placeholder={t("common.enter_folder_name")}
                    status={validation_error || error ? "error" : "default"}
                    type="text"
                    value={folder_name}
                    onChange={(e) => set_folder_name(e.target.value)}
                    onKeyDown={(e) => e["key"] === "Enter" && handle_create()}
                  />
                </div>

                <div>
                  <span className="block text-[13px] font-medium mb-2 text-txt-secondary">
                    {t("common.parent_folder")}
                  </span>
                  <DropdownMenu
                    open={parent_menu_open}
                    onOpenChange={set_parent_menu_open}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex w-full items-center gap-2 rounded-lg border border-edge-primary px-3 py-2 text-[14px] text-left text-txt-primary transition-colors hover:bg-surface-secondary focus:outline-none"
                        type="button"
                      >
                        {selected_parent ? (
                          <FolderIcon
                            className="w-4 h-4 flex-shrink-0"
                            style={{
                              color: selected_parent.color || "#3b82f6",
                            }}
                          />
                        ) : null}
                        <span className="flex-1 truncate">
                          {selected_parent
                            ? selected_parent.name
                            : t("common.top_level_no_parent")}
                        </span>
                        <ChevronDownIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-56 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
                      sideOffset={4}
                    >
                      <DropdownMenuItem
                        onClick={() => set_selected_parent_token(undefined)}
                      >
                        <span className="truncate">
                          {t("common.top_level_no_parent")}
                        </span>
                      </DropdownMenuItem>
                      {parent_options.map((node) => (
                        <DropdownMenuItem
                          key={node.folder.id}
                          style={{ paddingLeft: 8 + node.depth * 14 }}
                          onClick={() =>
                            set_selected_parent_token(node.folder.folder_token)
                          }
                        >
                          <FolderIcon
                            className="w-4 h-4 mr-2 flex-shrink-0"
                            style={{ color: node.folder.color || "#3b82f6" }}
                          />
                          <span className="truncate">{node.folder.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="create-folder-color"
                  >
                    {t("common.color")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TAG_COLOR_PRESETS.map((color) => (
                      <button
                        key={color.hex}
                        className="w-9 h-9 rounded-full"
                        style={{
                          backgroundColor: color.hex,
                          boxShadow:
                            selected_color === color.hex
                              ? `0 0 0 2px var(--modal-bg), 0 0 0 4px ${color.hex}`
                              : "none",
                        }}
                        title={color.name}
                        onClick={() => set_selected_color(color.hex)}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  {selected_parent && (
                    <>
                      <FolderIcon
                        className="w-4 h-4"
                        style={{ color: selected_parent.color || "#3b82f6" }}
                      />
                      <span className="text-[14px] text-txt-muted">/</span>
                    </>
                  )}
                  <FolderIcon
                    className="w-4 h-4"
                    style={{ color: selected_color }}
                  />
                  <span className="text-[14px] text-txt-primary">
                    {folder_name || t("common.folder_preview")}
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
                size="xl"
                variant="outline"
                onClick={handle_close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="text-white"
                disabled={!trimmed_name || is_creating || !!validation_error}
                size="xl"
                style={{ backgroundColor: selected_color }}
                variant="depth"
                onClick={handle_create}
              >
                {is_creating && <Spinner size="md" />}
                {is_creating ? t("common.creating") : t("common.create_folder")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
