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
import type { UnsubscribeInfo } from "@/types/email";

import { motion } from "framer-motion";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { TrashIcon, ArchiveIcon, SpamIcon } from "@/components/common/icons";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface EmailViewerHeaderProps {
  on_close: () => void;
  on_archive?: () => void;
  on_spam?: () => void;
  on_trash?: () => void;
  on_unsubscribe?: () => void;
  is_archive_loading?: boolean;
  is_spam_loading?: boolean;
  is_trash_loading?: boolean;
  is_in_trash?: boolean;
  unsubscribe_info?: UnsubscribeInfo;
}

export function EmailViewerHeader({
  on_close,
  on_archive,
  on_spam,
  on_trash,
  on_unsubscribe,
  is_archive_loading = false,
  is_spam_loading = false,
  is_trash_loading = false,
  is_in_trash = false,
  unsubscribe_info,
}: EmailViewerHeaderProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const show_unsubscribe = unsubscribe_info?.has_unsubscribe && on_unsubscribe;

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center justify-between px-6 py-4 border-b border-default-200"
      initial={reduce_motion ? false : { y: -10, opacity: 0 }}
      transition={{ duration: reduce_motion ? 0 : 0.3, delay: 0.1 }}
    >
      <motion.button
        className="text-blue-500 hover:text-blue-600 font-medium transition-all px-2 py-1 rounded-lg"
        whileHover={{ x: -4, backgroundColor: "rgba(59, 130, 246, 0.08)" }}
        onClick={on_close}
      >
        ← {t("mail.back")}
      </motion.button>
      <div className="flex items-center gap-2">
        {show_unsubscribe && (
          <Tooltip tip={t("mail.unsubscribe")}>
            <Button
              className="text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
              size="icon"
              variant="ghost"
              onClick={on_unsubscribe}
            >
              <EnvelopeIcon className="w-4 h-4" />
            </Button>
          </Tooltip>
        )}
        <Tooltip tip={t("mail.archive")}>
          <Button
            aria-label={
              is_archive_loading ? t("mail.archiving") : t("mail.archive")
            }
            disabled={is_archive_loading}
            size="icon"
            variant="ghost"
            onClick={on_archive}
          >
            {is_archive_loading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <ArchiveIcon size={16} />
            )}
          </Button>
        </Tooltip>
        <Tooltip tip={t("mail.report_spam")}>
          <Button
            aria-label={
              is_spam_loading
                ? t("mail.marking_as_spam")
                : t("mail.mark_as_spam")
            }
            disabled={is_spam_loading}
            size="icon"
            variant="ghost"
            onClick={on_spam}
          >
            {is_spam_loading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <SpamIcon size={16} />
            )}
          </Button>
        </Tooltip>
        <Tooltip
          tip={
            is_in_trash ? t("mail.delete_permanently") : t("mail.move_to_trash")
          }
        >
          <Button
            aria-label={
              is_trash_loading
                ? is_in_trash
                  ? t("mail.deleting_permanently")
                  : t("mail.moving_to_trash")
                : is_in_trash
                  ? t("mail.delete_permanently")
                  : t("mail.move_to_trash")
            }
            disabled={is_trash_loading}
            size="icon"
            variant="ghost"
            onClick={on_trash}
          >
            {is_trash_loading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <TrashIcon size={16} />
            )}
          </Button>
        </Tooltip>
      </div>
    </motion.div>
  );
}
