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
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import {
  dismiss_mail_legacy_migration,
  get_mail_legacy_migration_progress,
  retry_mail_legacy_migration,
  subscribe_mail_legacy_migration,
  type MailLegacyMigrationProgress,
} from "@/services/crypto/mail_legacy_migration";

interface MailKeyUpgradeDialogProps {
  progress: MailLegacyMigrationProgress;
  on_retry: () => void;
  on_dismiss: () => void;
}

export function is_mail_key_upgrade_blocking(
  progress: MailLegacyMigrationProgress,
): boolean {
  return (
    progress.forced &&
    (progress.phase === "running" ||
      progress.phase === "failed" ||
      (progress.phase === "done" && progress.unreadable > 0))
  );
}

export function MailKeyUpgradeDialog({
  progress,
  on_retry,
  on_dismiss,
}: MailKeyUpgradeDialogProps) {
  const { t } = use_i18n();
  const dialog_ref = useRef<HTMLDivElement>(null);
  const failed = progress.phase === "failed";
  const done = progress.phase === "done";

  useEffect(() => {
    dialog_ref.current?.focus();
  }, [progress.phase]);

  useEffect(() => {
    const handle_key = (event: KeyboardEvent) => {
      if (event.key === "Escape") on_dismiss();
    };

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [on_dismiss]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      data-testid="mail-key-upgrade-gate"
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "var(--modal-overlay)" }}
      />
      <div
        ref={dialog_ref}
        aria-describedby="mail-key-upgrade-body"
        aria-labelledby="mail-key-upgrade-title"
        aria-modal="true"
        className="relative w-full max-w-[420px] overflow-hidden rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-floating-bg,var(--modal-bg))] px-6 pt-6 pb-5 shadow-[var(--aster-floating-shadow)] outline-none"
        role="alertdialog"
        tabIndex={-1}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            {failed ? (
              <ExclamationTriangleIcon
                className="w-5 h-5"
                style={{ color: "var(--color-warning)" }}
              />
            ) : done ? (
              <CheckCircleIcon
                className="w-5 h-5"
                style={{ color: "var(--color-success)" }}
              />
            ) : (
              <ShieldCheckIcon
                className="w-5 h-5"
                style={{ color: "var(--color-info)" }}
              />
            )}
          </div>
          <h2
            className="text-base font-semibold"
            id="mail-key-upgrade-title"
            style={{ color: "var(--text-primary)" }}
          >
            {done
              ? t("common.mail_key_upgrade_done_title")
              : t("common.mail_key_upgrade_title")}
          </h2>
        </div>
        <p
          className="text-[13px] leading-5 mb-4"
          id="mail-key-upgrade-body"
          style={{ color: "var(--text-secondary)" }}
        >
          {done
            ? t("common.mail_key_upgrade_unreadable", {
                count: progress.unreadable,
              })
            : failed
              ? t("common.mail_key_upgrade_failed")
              : t("common.mail_key_upgrade_running")}
        </p>
        {!done && (
          <div
            aria-live="polite"
            className="flex flex-col gap-1 p-3 rounded-lg"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <div className="flex items-center gap-2">
              {!failed && <Spinner size="sm" />}
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {t("common.mail_key_upgrade_progress", {
                  count: progress.processed,
                })}
              </span>
            </div>
            {failed && progress.skipped > 0 && (
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {t("common.mail_key_upgrade_skipped", {
                  count: progress.skipped,
                })}
              </span>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          {done ? (
            <Button variant="depth" onClick={on_dismiss}>
              {t("common.close")}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={on_dismiss}>
                {t("common.not_now")}
              </Button>
              {failed && (
                <Button variant="depth" onClick={on_retry}>
                  {t("common.mail_key_upgrade_retry")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MailKeyUpgradeGate() {
  const progress = useSyncExternalStore(
    subscribe_mail_legacy_migration,
    get_mail_legacy_migration_progress,
  );

  if (!is_mail_key_upgrade_blocking(progress)) return null;

  return (
    <MailKeyUpgradeDialog
      on_dismiss={dismiss_mail_legacy_migration}
      on_retry={retry_mail_legacy_migration}
      progress={progress}
    />
  );
}
