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
import type { ReactElement, ComponentType } from "react";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EnvelopeOpenIcon,
  ArchiveBoxArrowDownIcon,
  ArrowUturnLeftIcon,
  ShieldExclamationIcon,
  TrashIcon,
  InboxIcon,
  XMarkIcon,
  ClockIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  TagIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Capacitor } from "@capacitor/core";

import { set_island_visible } from "@/components/toast/action_toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown_menu";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface ActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  on_click?: () => void;
  variant?: "default" | "danger";
  title?: string;
}

function ActionButton({
  icon: Icon,
  on_click,
  variant = "default",
  title,
}: ActionButtonProps): ReactElement {
  return (
    <motion.button
      className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
      title={title}
      onClick={on_click}
    >
      <Icon
        className={`w-[18px] h-[18px] ${variant === "danger" ? "text-red-500" : "text-[var(--text-primary)]"}`}
      />
    </motion.button>
  );
}

interface FolderOption {
  folder_token: string;
  name: string;
  color: string;
  status: "all" | "some" | "none";
}

interface TagOption {
  tag_token: string;
  name: string;
  color: string;
  status: "all" | "some" | "none";
}

interface SelectionActionIslandProps {
  is_visible: boolean;
  selected_count: number;
  on_archive?: () => void;
  on_unarchive?: () => void;
  on_delete: () => void;
  on_mark_read: () => void;
  on_spam: () => void;
  on_restore?: () => void;
  on_clear_selection?: () => void;
  is_archive_view?: boolean;
  is_trash_view?: boolean;
  is_spam_view?: boolean;
  on_snooze?: (snooze_until: Date) => void;
  on_custom_snooze?: () => void;
  folders?: FolderOption[];
  on_folder_toggle?: (folder_token: string) => void;
  tags?: TagOption[];
  on_tag_toggle?: (tag_token: string) => void;
}

export function SelectionActionIsland({
  is_visible,
  selected_count,
  on_archive,
  on_unarchive,
  on_delete,
  on_mark_read,
  on_spam,
  on_restore,
  on_clear_selection,
  is_archive_view = false,
  is_trash_view = false,
  is_spam_view = false,
  on_snooze,
  on_custom_snooze: _on_custom_snooze,
  folders = [],
  on_folder_toggle,
  tags = [],
  on_tag_toggle,
}: SelectionActionIslandProps): ReactElement {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const is_native = Capacitor.isNativePlatform();

  useEffect(() => {
    set_island_visible(is_visible);

    return () => set_island_visible(false);
  }, [is_visible]);

  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 rounded-xl shadow-lg border"
          exit={{ opacity: 0, y: 16 }}
          initial={reduce_motion ? false : { opacity: 0, y: 16 }}
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-primary)",
          }}
          transition={{
            type: "tween",
            ease: "easeOut",
            duration: reduce_motion ? 0 : 0.2,
          }}
        >
          <div
            className="flex items-center gap-1.5 pr-3 border-r"
            style={{ borderColor: "var(--border-secondary)" }}
          >
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: "var(--accent-color)" }}
            >
              {selected_count}
            </span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t("common.selected")}
            </span>
          </div>

          <div className="flex items-center gap-0.5 pl-1">
            {(is_trash_view || is_spam_view) && on_restore && (
              <ActionButton
                icon={ArrowUturnLeftIcon}
                on_click={on_restore}
                title={t("mail.restore")}
              />
            )}

            {!is_trash_view && !is_spam_view && (
              <>
                {is_archive_view ? (
                  <ActionButton
                    icon={InboxIcon}
                    on_click={on_unarchive}
                    title={t("mail.move_to_inbox")}
                  />
                ) : (
                  <ActionButton
                    icon={ArchiveBoxArrowDownIcon}
                    on_click={on_archive}
                    title={t("mail.archive")}
                  />
                )}
              </>
            )}
            <ActionButton
              icon={TrashIcon}
              on_click={on_delete}
              title={
                is_trash_view
                  ? t("mail.delete_permanently")
                  : t("common.delete")
              }
              variant="danger"
            />
            <ActionButton
              icon={EnvelopeOpenIcon}
              on_click={on_mark_read}
              title={t("mail.mark_as_read")}
            />

            {!is_native && folders.length > 0 && on_folder_toggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    title={t("common.folders")}
                  >
                    <FolderIcon className="w-[18px] h-[18px] text-[var(--text-primary)]" />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  className="max-h-64 overflow-y-auto"
                  side="top"
                  sideOffset={8}
                >
                  {folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.folder_token}
                      onClick={() => on_folder_toggle(folder.folder_token)}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="flex-1 truncate">{folder.name}</span>
                      {(folder.status === "all" ||
                        folder.status === "some") && (
                        <CheckIcon
                          className={`w-4 h-4 ml-2 flex-shrink-0 ${folder.status === "some" ? "opacity-50" : ""}`}
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!is_native && tags.length > 0 && on_tag_toggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    title={t("common.labels")}
                  >
                    <TagIcon className="w-[18px] h-[18px] text-[var(--text-primary)]" />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  className="max-h-64 overflow-y-auto"
                  side="top"
                  sideOffset={8}
                >
                  {tags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.tag_token}
                      onClick={() => on_tag_toggle(tag.tag_token)}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1 truncate">{tag.name}</span>
                      {(tag.status === "all" || tag.status === "some") && (
                        <CheckIcon
                          className={`w-4 h-4 ml-2 flex-shrink-0 ${tag.status === "some" ? "opacity-50" : ""}`}
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                  title={t("common.more")}
                >
                  <EllipsisHorizontalIcon className="w-[18px] h-[18px] text-[var(--text-primary)]" />
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top" sideOffset={8}>
                {!is_trash_view && !is_spam_view && (
                  <DropdownMenuItem onClick={on_spam}>
                    <ShieldExclamationIcon className="w-4 h-4 mr-2" />
                    {t("mail.report_spam")}
                  </DropdownMenuItem>
                )}
                {on_snooze && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setHours(date.getHours() + 4);
                        on_snooze(date);
                      }}
                    >
                      <ClockIcon className="w-4 h-4 mr-2" />
                      {t("mail.later_today_snooze")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 1);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      <ClockIcon className="w-4 h-4 mr-2" />
                      {t("mail.tomorrow_snooze")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 7);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      <ClockIcon className="w-4 h-4 mr-2" />
                      {t("mail.next_week_snooze")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {on_clear_selection && (
            <>
              <div
                className="w-px h-5 ml-1"
                style={{ backgroundColor: "var(--border-secondary)" }}
              />
              <motion.button
                className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                title={t("mail.clear_selection")}
                onClick={on_clear_selection}
              >
                <XMarkIcon className="w-[18px] h-[18px] text-[var(--text-muted)]" />
              </motion.button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
