import type { ReactElement, ComponentType } from "react";

import { motion, AnimatePresence } from "framer-motion";
import {
  EnvelopeOpenIcon,
  ArchiveBoxArrowDownIcon,
  ShieldExclamationIcon,
  TrashIcon,
  InboxIcon,
  XMarkIcon,
  ClockIcon,
  FolderPlusIcon,
  CheckIcon,
  MinusIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  on_click?: () => void;
  variant?: "default" | "danger";
}

function ActionButton({
  icon: Icon,
  on_click,
  variant = "default",
}: ActionButtonProps): ReactElement {
  return (
    <motion.button
      className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
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

interface SelectionActionIslandProps {
  is_visible: boolean;
  selected_count: number;
  on_archive?: () => void;
  on_unarchive?: () => void;
  on_delete: () => void;
  on_mark_read: () => void;
  on_spam: () => void;
  on_clear_selection?: () => void;
  is_archive_view?: boolean;
  on_snooze?: (snooze_until: Date) => void;
  on_custom_snooze?: () => void;
  folders?: FolderOption[];
  on_folder_toggle?: (folder_token: string) => void;
}

export function SelectionActionIsland({
  is_visible,
  selected_count,
  on_archive,
  on_unarchive,
  on_delete,
  on_mark_read,
  on_spam,
  on_clear_selection,
  is_archive_view = false,
  on_snooze,
  on_custom_snooze,
  folders = [],
  on_folder_toggle,
}: SelectionActionIslandProps): ReactElement {
  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 rounded-xl shadow-lg border"
          exit={{ opacity: 0, y: 16 }}
          initial={{ opacity: 0, y: 16 }}
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-primary)",
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 35,
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
              selected
            </span>
          </div>

          <div className="flex items-center gap-0.5 pl-1">
            <ActionButton icon={EnvelopeOpenIcon} on_click={on_mark_read} />

            {on_folder_toggle && folders.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FolderPlusIcon className="w-[18px] h-[18px] text-[var(--text-primary)]" />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="top" sideOffset={8}>
                  {folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.folder_token}
                      onClick={() => on_folder_toggle(folder.folder_token)}
                    >
                      <span className="w-4 h-4 flex items-center justify-center">
                        {folder.status === "all" && (
                          <CheckIcon className="w-3.5 h-3.5 text-blue-500" />
                        )}
                        {folder.status === "some" && (
                          <MinusIcon className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full ml-1"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="ml-2 truncate">{folder.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {on_snooze && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <motion.button
                    className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <ClockIcon className="w-[18px] h-[18px] text-[var(--text-primary)]" />
                  </motion.button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="top" sideOffset={8}>
                  <DropdownMenuItem
                    onClick={() => {
                      const date = new Date();

                      date.setHours(date.getHours() + 4);
                      on_snooze(date);
                    }}
                  >
                    Later today (4 hours)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const date = new Date();

                      date.setDate(date.getDate() + 1);
                      date.setHours(9, 0, 0, 0);
                      on_snooze(date);
                    }}
                  >
                    Tomorrow (9 AM)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const date = new Date();
                      const day = date.getDay();
                      const days_until_saturday =
                        day === 6 ? 7 : (6 - day + 7) % 7;

                      date.setDate(date.getDate() + days_until_saturday);
                      date.setHours(9, 0, 0, 0);
                      on_snooze(date);
                    }}
                  >
                    This weekend
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const date = new Date();

                      date.setDate(date.getDate() + 7);
                      date.setHours(9, 0, 0, 0);
                      on_snooze(date);
                    }}
                  >
                    Next week
                  </DropdownMenuItem>
                  {on_custom_snooze && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={on_custom_snooze}>
                        Pick date & time
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {is_archive_view ? (
              <ActionButton icon={InboxIcon} on_click={on_unarchive} />
            ) : (
              <ActionButton
                icon={ArchiveBoxArrowDownIcon}
                on_click={on_archive}
              />
            )}
            <ActionButton icon={ShieldExclamationIcon} on_click={on_spam} />
            <ActionButton
              icon={TrashIcon}
              on_click={on_delete}
              variant="danger"
            />
          </div>

          {on_clear_selection && (
            <>
              <div
                className="w-px h-5 ml-1"
                style={{ backgroundColor: "var(--border-secondary)" }}
              />
              <motion.button
                className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
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
