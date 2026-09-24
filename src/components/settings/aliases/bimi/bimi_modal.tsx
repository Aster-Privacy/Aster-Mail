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
import type { TranslationKey } from "@/lib/i18n/types";
import type { CustomDomain } from "@/services/api/domains";
import type { ApiResponse } from "@/services/api/client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { DnsRecordCard } from "../dns_record_card";

import { BimiLogoPicker, read_bimi_file } from "./bimi_logo_picker";
import { BimiLogoPreview } from "./bimi_logo_preview";
import { BimiStateChip } from "./bimi_state_chip";
import {
  BIMI_ADJUSTMENT_MESSAGES,
  BIMI_DMARC_MESSAGES,
  BIMI_LOGO_ERROR_MESSAGES,
  BIMI_RECORD_MESSAGES,
  bimi_action_error,
  bimi_row_message,
} from "./bimi_copy";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { ButtonSpinner, Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { format_date, format_time } from "@/utils/date_format";
import {
  check_bimi,
  delete_bimi,
  get_bimi,
  parse_logo_errors,
  publish_bimi,
  upload_bimi_logo,
  type BimiAdjustment,
  type BimiLogoError,
  type BimiView,
} from "@/services/api/bimi";

const AUTO_CHECK_INTERVAL_MS = 20_000;

type BimiStep = "logo" | "publish" | "manage";
type BimiBusy = "upload" | "publish" | "check" | "delete" | null;
type RequirementOutcome = "pass" | "fail" | "unknown";

interface BimiModalProps {
  is_open: boolean;
  domain: CustomDomain;
  on_close: (changed: boolean) => void;
}

function initial_step(view: BimiView): BimiStep {
  return view.state === "off" || view.state === "draft" ? "logo" : "manage";
}

function format_checked_at(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return `${format_date(date)} ${format_time(date)}`;
}

function RequirementRow({
  title,
  message,
  outcome,
}: {
  title: string;
  message: string;
  outcome: RequirementOutcome;
}) {
  const icon =
    outcome === "pass" ? (
      <CheckCircleIcon className="w-5 h-5 flex-shrink-0 text-green-500" />
    ) : outcome === "fail" ? (
      <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
    ) : (
      <MinusCircleIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />
    );

  return (
    <li className="flex items-start gap-3 py-3">
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        <p className="text-xs mt-0.5 text-txt-muted">{message}</p>
      </div>
    </li>
  );
}

function MessageList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "info" | "error";
}) {
  const classes =
    tone === "error"
      ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
      : "border-edge-secondary bg-surf-secondary text-txt-secondary";

  return (
    <div
      className={`rounded-lg border p-3 ${classes}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1.5 list-disc space-y-1 ps-5 text-xs">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function BimiModal({ is_open, domain, on_close }: BimiModalProps) {
  const { t } = use_i18n();
  const [view, set_view] = useState<BimiView | null>(null);
  const [load_failed, set_load_failed] = useState(false);
  const [step, set_step] = useState<BimiStep>("logo");
  const [busy, set_busy] = useState<BimiBusy>(null);
  const [logo_errors, set_logo_errors] = useState<BimiLogoError[]>([]);
  const [adjustments, set_adjustments] = useState<BimiAdjustment[]>([]);
  const [action_error, set_action_error] = useState<TranslationKey | null>(
    null,
  );
  const [confirm_off, set_confirm_off] = useState(false);
  const [removed_record, set_removed_record] = useState(false);
  const changed_ref = useRef(false);
  const open_ref = useRef(is_open);

  open_ref.current = is_open;

  const apply_view = useCallback((next: BimiView) => {
    set_view(next);
    changed_ref.current = true;
  }, []);

  const load = useCallback(async () => {
    set_load_failed(false);
    set_view(null);
    try {
      const response = await get_bimi(domain.id);

      if (!open_ref.current) return;
      if (response.data) {
        set_view(response.data);
        set_step(initial_step(response.data));
      } else {
        set_load_failed(true);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      if (open_ref.current) set_load_failed(true);
    }
  }, [domain.id]);

  useEffect(() => {
    if (!is_open) return;
    changed_ref.current = false;
    set_busy(null);
    set_logo_errors([]);
    set_adjustments([]);
    set_action_error(null);
    set_confirm_off(false);
    set_removed_record(false);
    load();
  }, [is_open, load]);

  const auto_check_active =
    is_open && step === "manage" && view?.state === "pending";

  useEffect(() => {
    if (!auto_check_active) return;

    const timer = window.setInterval(async () => {
      try {
        const response = await check_bimi(domain.id);

        if (open_ref.current && response.data) apply_view(response.data);
      } catch (err) {
        if (import.meta.env.DEV) console.error(err);
      }
    }, AUTO_CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [auto_check_active, domain.id, apply_view]);

  const close = () => {
    if (busy) return;
    on_close(changed_ref.current);
  };

  const handle_file = async (file: File) => {
    set_logo_errors([]);
    set_adjustments([]);
    set_action_error(null);
    set_removed_record(false);

    const result = await read_bimi_file(file);

    if (!result.ok) {
      set_action_error(result.error);

      return;
    }

    set_busy("upload");
    try {
      const response = await upload_bimi_logo(domain.id, result.svg);

      if (!open_ref.current) return;
      if (response.data) {
        apply_view(response.data.bimi);
        set_adjustments(response.data.adjustments);
      } else if (response.server_code === "BIMI_LOGO_INVALID") {
        set_logo_errors(parse_logo_errors(response.details));
      } else {
        set_action_error(bimi_action_error(response));
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      set_action_error("common.something_went_wrong_try_again");
    } finally {
      set_busy(null);
    }
  };

  const run_action = async (
    kind: Exclude<BimiBusy, "upload" | null>,
    action: () => Promise<ApiResponse<BimiView>>,
  ): Promise<BimiView | null> => {
    set_action_error(null);
    set_busy(kind);
    try {
      const response = await action();

      if (!open_ref.current) return null;
      if (response.data) {
        apply_view(response.data);

        return response.data;
      }
      set_action_error(bimi_action_error(response));
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      set_action_error("common.something_went_wrong_try_again");
    } finally {
      set_busy(null);
    }

    return null;
  };

  const handle_publish = async () => {
    const next = await run_action("publish", () => publish_bimi(domain.id));

    if (next) set_step("manage");
  };

  const handle_check = () => run_action("check", () => check_bimi(domain.id));

  const handle_turn_off = async () => {
    const user_manages_dns = view !== null && !view.managed_dns;
    const next = await run_action("delete", () => delete_bimi(domain.id));

    set_confirm_off(false);
    if (!next) return;
    set_logo_errors([]);
    set_adjustments([]);
    set_removed_record(user_manages_dns);
    set_step("logo");
  };

  const auth_ready = domain.spf_verified && domain.dkim_verified;
  const dmarc_status = view?.dmarc_status ?? null;
  const is_setup =
    view !== null && (view.state === "off" || view.state === "draft");
  const checked_at = format_checked_at(view?.last_checked_at ?? null);
  const error_banner = action_error ? (
    <p className="text-xs text-red-600 dark:text-red-400" role="alert">
      {t(action_error)}
    </p>
  ) : null;

  const render_logo_step = (current: BimiView) => (
    <div className="space-y-4">
      {removed_record && (
        <div
          className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3"
          role="status"
        >
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t("settings.bimi_turn_off_remove_record")}
          </p>
        </div>
      )}
      <BimiLogoPicker on_file={handle_file} uploading={busy === "upload"} />
      {logo_errors.length > 0 && (
        <MessageList
          items={logo_errors.map((code) => t(BIMI_LOGO_ERROR_MESSAGES[code]))}
          title={t("settings.bimi_errors_title")}
          tone="error"
        />
      )}
      {error_banner}
      {current.preview_png && logo_errors.length === 0 && (
        <BimiLogoPreview
          domain_name={domain.domain_name}
          preview_png={current.preview_png}
        />
      )}
      {adjustments.length > 0 && (
        <MessageList
          items={adjustments.map((code) => t(BIMI_ADJUSTMENT_MESSAGES[code]))}
          title={t("settings.bimi_adjustments_title")}
          tone="info"
        />
      )}
      <p className="text-xs text-txt-muted">
        {t("settings.bimi_logo_public_note")}
      </p>
    </div>
  );

  const render_publish_step = (current: BimiView) => (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-txt-muted">
          {t("settings.bimi_requirements_title")}
        </p>
        <ul className="divide-y divide-edge-secondary">
          <RequirementRow
            message={
              auth_ready
                ? t("settings.bimi_req_auth_ok")
                : t("settings.bimi_req_auth_fail")
            }
            outcome={auth_ready ? "pass" : "fail"}
            title={t("settings.bimi_req_auth_title")}
          />
          <RequirementRow
            message={
              dmarc_status
                ? t(BIMI_DMARC_MESSAGES[dmarc_status])
                : t("settings.bimi_req_not_checked")
            }
            outcome={
              dmarc_status === "ready"
                ? "pass"
                : dmarc_status
                  ? "fail"
                  : "unknown"
            }
            title={t("settings.bimi_req_dmarc_title")}
          />
        </ul>
      </div>
      {current.managed_dns && (
        <p className="text-xs text-txt-muted">
          {t("settings.bimi_managed_note")}
        </p>
      )}
      <p className="text-xs text-txt-muted">
        {t("settings.bimi_verified_mark_note")}
      </p>
      {!current.domain_active && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("settings.bimi_error_domain_not_active")}
        </p>
      )}
      {error_banner}
    </div>
  );

  const render_manage = (current: BimiView) => (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BimiStateChip state={current.state} />
            {checked_at && (
              <span className="text-xs text-txt-muted">
                {t("settings.bimi_last_checked", { time: checked_at })}
              </span>
            )}
          </div>
          <p className="text-sm mt-2 text-txt-secondary">
            {t(bimi_row_message(current.state, current.managed_dns))}
          </p>
        </div>
      </div>
      {current.preview_png && (
        <BimiLogoPreview
          domain_name={domain.domain_name}
          preview_png={current.preview_png}
        />
      )}
      {adjustments.length > 0 && (
        <MessageList
          items={adjustments.map((code) => t(BIMI_ADJUSTMENT_MESSAGES[code]))}
          title={t("settings.bimi_adjustments_title")}
          tone="info"
        />
      )}
      {dmarc_status && dmarc_status !== "ready" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t(BIMI_DMARC_MESSAGES[dmarc_status])}
        </p>
      )}
      {current.managed_dns ? (
        <p className="text-xs text-txt-muted">
          {t("settings.bimi_managed_note")}
        </p>
      ) : (
        current.record && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-txt-muted">
              {t("settings.bimi_record_title")}
            </p>
            {current.record_status && (
              <p className="text-xs text-txt-secondary">
                {t(BIMI_RECORD_MESSAGES[current.record_status])}
              </p>
            )}
            <DnsRecordCard
              domain={domain.domain_name}
              record={{
                ...current.record,
                purpose: "bimi",
                is_verified: current.record_status === "published",
                required: true,
              }}
            />
          </div>
        )
      )}
      {error_banner}
    </div>
  );

  const render_body = () => {
    if (load_failed) return <LoadFailedNotice on_retry={load} />;
    if (!view) {
      return (
        <div className="flex justify-center py-10">
          <Spinner size="md" />
        </div>
      );
    }
    if (step === "publish") return render_publish_step(view);
    if (step === "manage") return render_manage(view);

    return render_logo_step(view);
  };

  const render_footer = () => {
    if (!view) {
      return (
        <Button variant="outline" onClick={close}>
          {t("common.close")}
        </Button>
      );
    }

    if (step === "logo") {
      if (is_setup) {
        return (
          <>
            <Button disabled={busy !== null} variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                busy !== null || !view.preview_png || logo_errors.length > 0
              }
              variant="depth"
              onClick={() => {
                set_action_error(null);
                set_step("publish");
              }}
            >
              {t("common.continue")}
            </Button>
          </>
        );
      }

      return (
        <Button
          disabled={busy !== null}
          variant="depth"
          onClick={() => {
            set_action_error(null);
            set_logo_errors([]);
            set_step("manage");
          }}
        >
          {t("common.done")}
        </Button>
      );
    }

    if (step === "publish") {
      return (
        <>
          <Button
            disabled={busy !== null}
            variant="outline"
            onClick={() => {
              set_action_error(null);
              set_step("logo");
            }}
          >
            {t("common.back")}
          </Button>
          <Button
            disabled={busy !== null || !view.domain_active}
            variant="depth"
            onClick={handle_publish}
          >
            {busy === "publish" && <ButtonSpinner />}
            {busy === "publish"
              ? t("settings.bimi_publishing")
              : t("settings.bimi_publish")}
          </Button>
        </>
      );
    }

    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button
          className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
          disabled={busy !== null}
          variant="ghost"
          onClick={() => set_confirm_off(true)}
        >
          {t("settings.bimi_turn_off")}
        </Button>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button
            disabled={busy !== null}
            variant="outline"
            onClick={() => {
              set_action_error(null);
              set_adjustments([]);
              set_step("logo");
            }}
          >
            {t("settings.bimi_replace_logo")}
          </Button>
          <Button
            disabled={busy !== null}
            variant="outline"
            onClick={handle_check}
          >
            {busy === "check" ? (
              <ButtonSpinner />
            ) : (
              <ArrowPathIcon className="w-3.5 h-3.5" />
            )}
            {busy === "check"
              ? t("settings.bimi_checking")
              : t("settings.bimi_check_again")}
          </Button>
          <Button disabled={busy !== null} variant="depth" onClick={close}>
            {t("common.done")}
          </Button>
        </div>
      </div>
    );
  };

  const step_number = step === "publish" ? 2 : 1;

  return (
    <>
      <Modal is_open={is_open} on_close={close} size="lg">
        <ModalHeader>
          <ModalTitle>{t("settings.bimi_title")}</ModalTitle>
          <ModalDescription>
            {is_setup && step !== "manage"
              ? `${t("settings.bimi_step_of", {
                  current: step_number,
                  total: 2,
                })} · ${
                  step === "publish"
                    ? t("settings.bimi_step_publish")
                    : t("settings.bimi_step_logo")
                }`
              : domain.domain_name}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>{render_body()}</ModalBody>
        <ModalFooter>{render_footer()}</ModalFooter>
      </Modal>
      <ConfirmationModal
        confirm_text={t("settings.bimi_turn_off_confirm")}
        is_loading={busy === "delete"}
        is_open={confirm_off}
        message={t("settings.bimi_turn_off_body")}
        on_cancel={() => {
          if (busy !== "delete") set_confirm_off(false);
        }}
        on_confirm={handle_turn_off}
        title={t("settings.bimi_turn_off_title")}
        variant="danger"
      />
    </>
  );
}
