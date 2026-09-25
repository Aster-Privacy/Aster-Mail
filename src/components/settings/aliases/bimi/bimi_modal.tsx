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
  ClockIcon,
  EyeIcon,
  InformationCircleIcon,
  MinusCircleIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import { Button } from "@aster/ui";

import { BimiAlert } from "./bimi_alert";
import { BimiLogoPicker, read_bimi_file } from "./bimi_logo_picker";
import { BimiLogoPreview } from "./bimi_logo_preview";
import { BimiNote } from "./bimi_note";
import { BimiRecordRows } from "./bimi_record_rows";
import { BimiRulesList } from "./bimi_rules_list";
import { BimiStateChip } from "./bimi_state_chip";
import { BimiStepper } from "./bimi_stepper";
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
  type BimiState,
  type BimiView,
} from "@/services/api/bimi";

const AUTO_CHECK_INTERVAL_MS = 20_000;
const SPINNER_DELAY_MS = 250;
const AUTO_CHECK_STATES: BimiState[] = ["pending", "attention"];

type BimiStep = "logo" | "publish" | "manage";
type BimiBusy = "upload" | "publish" | "check" | "delete" | null;
type RequirementOutcome = "pass" | "fail" | "unknown";

interface BimiModalProps {
  is_open: boolean;
  domain: CustomDomain;
  on_close: (changed: boolean) => void;
}

const OUTCOME_ICONS = {
  pass: { Icon: CheckCircleIcon, tone: "text-green-500" },
  fail: { Icon: XCircleIcon, tone: "text-red-500" },
  unknown: { Icon: MinusCircleIcon, tone: "text-txt-muted" },
};

function initial_step(view: BimiView): BimiStep {
  if (view.state === "off") return "logo";
  if (view.state === "draft") return "publish";

  return "manage";
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
  const { Icon, tone } = OUTCOME_ICONS[outcome];

  return (
    <li className="flex items-start gap-3 py-3">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 w-4 h-4 flex-shrink-0 ${tone}`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        <p className="text-sm mt-0.5 text-txt-muted">{message}</p>
      </div>
    </li>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-sm font-medium text-txt-primary">{children}</h3>;
}

export function BimiModal({ is_open, domain, on_close }: BimiModalProps) {
  const { t } = use_i18n();
  const [view, set_view] = useState<BimiView | null>(null);
  const [load_failed, set_load_failed] = useState(false);
  const [step, set_step] = useState<BimiStep>("logo");
  const [busy, set_busy] = useState<BimiBusy>(null);
  const [logo_errors, set_logo_errors] = useState<BimiLogoError[]>([]);
  const [adjustments, set_adjustments] = useState<BimiAdjustment[]>([]);
  const [show_adjustments, set_show_adjustments] = useState(false);
  const [action_error, set_action_error] = useState<TranslationKey | null>(
    null,
  );
  const [confirm_off, set_confirm_off] = useState(false);
  const [removed_record, set_removed_record] = useState(false);
  const [show_spinner, set_show_spinner] = useState(false);
  const changed_ref = useRef(false);
  const open_ref = useRef(is_open);
  const epoch_ref = useRef(0);
  const busy_ref = useRef<BimiBusy>(null);

  open_ref.current = is_open;
  busy_ref.current = busy;

  const apply_view = useCallback((next: BimiView) => {
    set_view(next);
    changed_ref.current = true;
  }, []);

  const is_current = (epoch: number) =>
    open_ref.current && epoch === epoch_ref.current;

  const load = useCallback(async () => {
    const epoch = ++epoch_ref.current;

    set_load_failed(false);
    set_view(null);
    try {
      const response = await get_bimi(domain.id);

      if (!open_ref.current || epoch !== epoch_ref.current) return;
      if (response.data) {
        set_view(response.data);
        set_step(initial_step(response.data));
      } else {
        set_load_failed(true);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      if (open_ref.current && epoch === epoch_ref.current) {
        set_load_failed(true);
      }
    }
  }, [domain.id]);

  useEffect(() => {
    if (!is_open) {
      epoch_ref.current += 1;

      return;
    }
    changed_ref.current = false;
    set_busy(null);
    set_logo_errors([]);
    set_adjustments([]);
    set_show_adjustments(false);
    set_action_error(null);
    set_confirm_off(false);
    set_removed_record(false);
    load();
  }, [is_open, load]);

  const waiting = is_open && view === null && !load_failed;

  useEffect(() => {
    if (!waiting) {
      set_show_spinner(false);

      return;
    }

    const timer = window.setTimeout(
      () => set_show_spinner(true),
      SPINNER_DELAY_MS,
    );

    return () => window.clearTimeout(timer);
  }, [waiting]);

  const auto_check_active =
    is_open &&
    step === "manage" &&
    !confirm_off &&
    view !== null &&
    AUTO_CHECK_STATES.includes(view.state);

  useEffect(() => {
    if (!auto_check_active) return;

    const timer = window.setInterval(async () => {
      if (busy_ref.current) return;

      const epoch = ++epoch_ref.current;

      try {
        const response = await check_bimi(domain.id);

        if (
          open_ref.current &&
          epoch === epoch_ref.current &&
          !busy_ref.current &&
          response.data
        ) {
          apply_view(response.data);
        }
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

  const reset_logo_feedback = () => {
    set_logo_errors([]);
    set_adjustments([]);
    set_show_adjustments(false);
  };

  const go_to = (next: BimiStep) => {
    set_action_error(null);
    set_step(next);
  };

  const handle_file = async (file: File) => {
    reset_logo_feedback();
    set_action_error(null);
    set_removed_record(false);

    const epoch = ++epoch_ref.current;

    set_busy("upload");
    try {
      const result = await read_bimi_file(file);

      if (!is_current(epoch)) return;
      if (!result.ok) {
        set_action_error(result.error);

        return;
      }
      const response = await upload_bimi_logo(domain.id, result.svg);

      if (!is_current(epoch)) return;
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
      if (is_current(epoch)) {
        set_action_error("common.something_went_wrong_try_again");
      }
    } finally {
      if (is_current(epoch)) set_busy(null);
    }
  };

  const run_action = async (
    kind: Exclude<BimiBusy, "upload" | null>,
    action: () => Promise<ApiResponse<BimiView>>,
  ): Promise<BimiView | null> => {
    const epoch = ++epoch_ref.current;

    set_action_error(null);
    set_busy(kind);
    try {
      const response = await action();

      if (!is_current(epoch)) return null;
      if (response.data) {
        apply_view(response.data);

        return response.data;
      }
      set_action_error(bimi_action_error(response));
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      if (is_current(epoch)) {
        set_action_error("common.something_went_wrong_try_again");
      }
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
    reset_logo_feedback();
    set_removed_record(user_manages_dns);
    set_step("logo");
  };

  const auth_ready = domain.spf_verified && domain.dkim_verified;
  const dmarc_status = view?.dmarc_status ?? null;
  const is_setup =
    view !== null && (view.state === "off" || view.state === "draft");
  const checked_at = format_checked_at(view?.last_checked_at ?? null);
  const error_alert = action_error ? (
    <BimiAlert tone="error">{t(action_error)}</BimiAlert>
  ) : null;
  const inactive_alert =
    view && !view.domain_active ? (
      <BimiAlert tone="warning">
        {t("settings.bimi_error_domain_not_active")}
      </BimiAlert>
    ) : null;

  const render_adjustments = () =>
    adjustments.length > 0 && (
      <div>
        <button
          aria-expanded={show_adjustments}
          className="flex items-start gap-2 text-start text-sm text-txt-secondary transition-colors hover:text-txt-primary"
          type="button"
          onClick={() => set_show_adjustments((value) => !value)}
        >
          <InformationCircleIcon
            aria-hidden="true"
            className="mt-0.5 w-4 h-4 flex-shrink-0 text-txt-muted"
          />
          <span>
            {t("settings.bimi_adjustments_title")}{" "}
            <span className="text-brand">
              {show_adjustments
                ? t("common.hide_details")
                : t("common.show_details")}
            </span>
          </span>
        </button>
        {show_adjustments && (
          <ul className="mt-2 space-y-1 ps-6">
            {adjustments.map((code) => (
              <li key={code} className="text-sm text-txt-muted">
                {t(BIMI_ADJUSTMENT_MESSAGES[code])}
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  const render_logo_step = (current: BimiView) => {
    const has_logo = current.preview_png !== null && logo_errors.length === 0;

    return (
      <div className="space-y-5">
        {is_setup && <BimiStepper current={1} />}
        {removed_record && (
          <BimiAlert tone="warning">
            {t("settings.bimi_turn_off_remove_record")}
          </BimiAlert>
        )}
        <BimiLogoPicker
          on_file={handle_file}
          preview_png={has_logo ? current.preview_png : null}
          uploading={busy === "upload"}
        />
        {logo_errors.length > 0 && (
          <BimiAlert
            items={logo_errors.map((code) => t(BIMI_LOGO_ERROR_MESSAGES[code]))}
            title={t("settings.bimi_errors_title")}
            tone="error"
          />
        )}
        {error_alert}
        <BimiRulesList errors={logo_errors} has_logo={has_logo} />
        {has_logo && current.preview_png && (
          <BimiLogoPreview
            domain_name={domain.domain_name}
            preview_png={current.preview_png}
          />
        )}
        {render_adjustments()}
        <BimiNote icon={EyeIcon}>
          {t("settings.bimi_logo_public_note")}
        </BimiNote>
      </div>
    );
  };

  const render_publish_step = (current: BimiView) => (
    <div className="space-y-5">
      <BimiStepper current={2} />
      {inactive_alert}
      <section>
        <SectionTitle>{t("settings.bimi_requirements_title")}</SectionTitle>
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
      </section>
      <div className="space-y-2">
        {current.managed_dns && (
          <BimiNote icon={ServerStackIcon}>
            {t("settings.bimi_managed_note")}
          </BimiNote>
        )}
        <BimiNote icon={ShieldCheckIcon}>
          {t("settings.bimi_verified_mark_note")}
        </BimiNote>
      </div>
      {error_alert}
    </div>
  );

  const render_record_status = (current: BimiView) => {
    const status = current.record_status;

    if (status === "published") {
      return (
        <BimiNote icon={CheckCircleIcon} tone="success">
          {t(BIMI_RECORD_MESSAGES.published)}
        </BimiNote>
      );
    }
    if (status === "conflict" || status === "external") {
      return (
        <BimiAlert tone="warning">{t(BIMI_RECORD_MESSAGES[status])}</BimiAlert>
      );
    }

    return (
      <div className="space-y-2">
        {current.state === "attention" ? (
          <BimiAlert tone="warning">
            {t("settings.bimi_record_removed")}
          </BimiAlert>
        ) : (
          <BimiNote icon={ClockIcon}>
            {t(BIMI_RECORD_MESSAGES.missing)}
          </BimiNote>
        )}
        {auto_check_active && (
          <BimiNote icon={ArrowPathIcon}>
            {t("settings.bimi_auto_checking")}
          </BimiNote>
        )}
      </div>
    );
  };

  const render_manage = (current: BimiView) => (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-lg border border-edge-secondary px-4 py-3">
        {current.preview_png && (
          <img
            alt={t("settings.bimi_preview_alt")}
            className="h-11 w-11 flex-shrink-0 rounded-full border border-edge-secondary object-cover"
            draggable={false}
            src={`data:image/png;base64,${current.preview_png}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-txt-primary">
              {domain.domain_name}
            </p>
            <BimiStateChip state={current.state} />
          </div>
          {checked_at && (
            <p className="mt-1 flex items-center gap-1 text-xs text-txt-muted">
              <ClockIcon aria-hidden="true" className="w-3.5 h-3.5" />
              {t("settings.bimi_last_checked", { time: checked_at })}
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-txt-secondary">
        {t(bimi_row_message(current.state, current.managed_dns))}
      </p>
      {inactive_alert}
      {dmarc_status && dmarc_status !== "ready" && (
        <BimiAlert tone="warning">
          {t(BIMI_DMARC_MESSAGES[dmarc_status])}
        </BimiAlert>
      )}
      {error_alert}
      {current.managed_dns ? (
        <BimiNote icon={ServerStackIcon}>
          {t("settings.bimi_managed_note")}
        </BimiNote>
      ) : (
        current.record && (
          <section className="space-y-3">
            <SectionTitle>{t("settings.bimi_record_title")}</SectionTitle>
            <BimiRecordRows record={current.record} />
            {render_record_status(current)}
          </section>
        )
      )}
      {current.preview_png && (
        <BimiLogoPreview
          domain_name={domain.domain_name}
          preview_png={current.preview_png}
        />
      )}
      {render_adjustments()}
      <BimiNote icon={ShieldCheckIcon}>
        {t("settings.bimi_verified_mark_note")}
      </BimiNote>
      <div className="flex items-center gap-4 border-t border-edge-secondary pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.bimi_turn_off")}
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("settings.bimi_turn_off_description")}
          </p>
        </div>
        <Button
          className="disabled:opacity-50"
          disabled={busy !== null}
          variant="depth_destructive"
          onClick={() => set_confirm_off(true)}
        >
          {t("settings.bimi_turn_off")}
        </Button>
      </div>
    </div>
  );

  const render_body = () => {
    if (load_failed) return <LoadFailedNotice on_retry={load} />;
    if (!view) {
      return (
        <div
          aria-busy="true"
          className="flex min-h-[240px] items-center justify-center"
        >
          {show_spinner && <Spinner size="md" />}
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
        <Button
          className="disabled:opacity-50"
          variant="outline"
          onClick={close}
        >
          {t("common.close")}
        </Button>
      );
    }

    if (step === "logo") {
      const can_continue =
        busy === null && view.preview_png !== null && logo_errors.length === 0;

      return (
        <>
          <Button
            className="disabled:opacity-50"
            disabled={busy !== null}
            variant="outline"
            onClick={() => {
              if (is_setup) {
                close();

                return;
              }
              reset_logo_feedback();
              go_to("manage");
            }}
          >
            {is_setup ? t("common.cancel") : t("common.back")}
          </Button>
          <Button
            className="disabled:opacity-50"
            disabled={!can_continue}
            variant="depth"
            onClick={() => go_to(is_setup ? "publish" : "manage")}
          >
            {is_setup ? t("common.continue") : t("common.done")}
          </Button>
        </>
      );
    }

    if (step === "publish") {
      return (
        <>
          <Button
            className="disabled:opacity-50"
            disabled={busy !== null}
            variant="outline"
            onClick={() => go_to("logo")}
          >
            {t("common.back")}
          </Button>
          <Button
            className="disabled:opacity-50"
            disabled={busy !== null || !view.domain_active || !view.preview_png}
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
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Button
          className="disabled:opacity-50"
          disabled={busy !== null}
          variant="outline"
          onClick={() => {
            reset_logo_feedback();
            go_to("logo");
          }}
        >
          {t("settings.bimi_replace_logo")}
        </Button>
        <Button
          className="disabled:opacity-50"
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
        <Button
          className="disabled:opacity-50"
          disabled={busy !== null}
          variant="depth"
          onClick={close}
        >
          {t("common.done")}
        </Button>
      </div>
    );
  };

  return (
    <>
      <Modal is_open={is_open} on_close={close} size="lg">
        <ModalHeader>
          <ModalTitle>{t("settings.bimi_title")}</ModalTitle>
          <ModalDescription>{domain.domain_name}</ModalDescription>
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
