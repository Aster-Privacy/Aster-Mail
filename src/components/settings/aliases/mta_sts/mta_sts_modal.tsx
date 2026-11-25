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
import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { Button } from "@aster/ui";

import { BimiAlert } from "../bimi/bimi_alert";

import { MtaStsRecordList } from "./mta_sts_record_list";
import { MtaStsStateChip } from "./mta_sts_state_chip";
import {
  MTA_STS_AUTO_CHECK_STATES,
  mta_sts_action_error,
  mta_sts_attention_message,
  mta_sts_change_committed,
} from "./mta_sts_copy";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio_group";
import { ButtonSpinner, Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { format_date, format_time } from "@/utils/date_format";
import {
  MTA_STS_MODES,
  check_mta_sts,
  disable_mta_sts,
  enable_mta_sts,
  get_mta_sts,
  type MtaStsMode,
  type MtaStsView,
} from "@/services/api/mta_sts";

const AUTO_CHECK_INTERVAL_MS = 20_000;
const SPINNER_DELAY_MS = 250;

type MtaStsBusy = "enable" | "check" | "disable" | null;

interface MtaStsModalProps {
  is_open: boolean;
  domain: CustomDomain;
  on_close: (changed: boolean) => void;
}

const MODE_COPY: Record<
  MtaStsMode,
  { label: TranslationKey; description: TranslationKey }
> = {
  testing: {
    label: "settings.mta_sts_mode_testing",
    description: "settings.mta_sts_mode_testing_description",
  },
  enforce: {
    label: "settings.mta_sts_mode_enforce",
    description: "settings.mta_sts_mode_enforce_description",
  },
};

function format_timestamp(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return `${format_date(date)} ${format_time(date)}`;
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-sm font-medium text-txt-primary">{children}</h3>;
}

export function MtaStsModal({ is_open, domain, on_close }: MtaStsModalProps) {
  const { t } = use_i18n();
  const [view, set_view] = useState<MtaStsView | null>(null);
  const [load_failed, set_load_failed] = useState(false);
  const [mode, set_mode] = useState<MtaStsMode>("testing");
  const [busy, set_busy] = useState<MtaStsBusy>(null);
  const [action_error, set_action_error] = useState<TranslationKey | null>(
    null,
  );
  const [confirm_off, set_confirm_off] = useState(false);
  const [show_spinner, set_show_spinner] = useState(false);
  const changed_ref = useRef(false);
  const open_ref = useRef(is_open);
  const epoch_ref = useRef(0);
  const busy_ref = useRef<MtaStsBusy>(null);

  open_ref.current = is_open;
  busy_ref.current = busy;

  const is_current = (epoch: number) =>
    open_ref.current && epoch === epoch_ref.current;

  const apply_view = useCallback((next: MtaStsView) => {
    set_view(next);
    if (next.mode) set_mode(next.mode);
    changed_ref.current = true;
  }, []);

  const load = useCallback(async () => {
    const epoch = ++epoch_ref.current;

    set_load_failed(false);
    set_view(null);
    try {
      const response = await get_mta_sts(domain.id);

      if (!open_ref.current || epoch !== epoch_ref.current) return;
      if (response.data) {
        set_view(response.data);
        set_mode(response.data.mode ?? "testing");
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
    set_action_error(null);
    set_confirm_off(false);
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
    !confirm_off &&
    view !== null &&
    MTA_STS_AUTO_CHECK_STATES.includes(view.state);

  useEffect(() => {
    if (!auto_check_active) return;

    const timer = window.setInterval(async () => {
      if (busy_ref.current) return;

      const epoch = ++epoch_ref.current;

      try {
        const response = await check_mta_sts(domain.id);

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

  const run_action = async (
    kind: Exclude<MtaStsBusy, null>,
    action: () => Promise<ApiResponse<MtaStsView>>,
  ): Promise<MtaStsView | null> => {
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
      set_action_error(mta_sts_action_error(response));
      if (mta_sts_change_committed(response)) {
        const latest = await get_mta_sts(domain.id);

        if (is_current(epoch) && latest.data) {
          set_view(latest.data);
          changed_ref.current = true;
        }
      }
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

  const handle_enable = () =>
    run_action("enable", () => enable_mta_sts(domain.id, mode));

  const handle_check = () =>
    run_action("check", () => check_mta_sts(domain.id));

  const handle_turn_off = async () => {
    await run_action("disable", () => disable_mta_sts(domain.id));
    set_confirm_off(false);
  };

  const is_setup =
    view !== null && (view.state === "off" || view.state === "retiring");
  const mode_changed = view !== null && view.enabled && view.mode !== mode;
  const checked_at = format_timestamp(view?.last_checked_at ?? null);
  const retire_date = format_timestamp(view?.retire_until ?? null);

  const render_mode_picker = () => (
    <section className="space-y-2">
      <SectionTitle>{t("settings.mta_sts_mode_label")}</SectionTitle>
      <RadioGroup
        className="space-y-1"
        value={mode}
        onValueChange={(value) => {
          if ((MTA_STS_MODES as readonly string[]).includes(value)) {
            set_mode(value as MtaStsMode);
          }
        }}
      >
        {MTA_STS_MODES.map((option) => (
          <label
            key={option}
            className="flex items-start gap-3 rounded-lg py-2 cursor-pointer"
            data-testid={`mta-sts-mode-${option}`}
            htmlFor={`mta_sts_mode_${option}`}
          >
            <RadioGroupItem
              className="mt-0.5"
              disabled={busy !== null}
              id={`mta_sts_mode_${option}`}
              value={option}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-txt-primary">
                {t(MODE_COPY[option].label)}
              </span>
              <span className="block text-sm mt-0.5 text-txt-muted">
                {t(MODE_COPY[option].description)}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </section>
  );

  const render_status_alert = (current: MtaStsView) => {
    if (current.state === "attention") {
      return (
        <BimiAlert tone="warning">
          {t(mta_sts_attention_message(current))}
        </BimiAlert>
      );
    }
    if (current.state === "pending_certificate") {
      return (
        <p className="text-sm text-txt-muted">
          {t("settings.mta_sts_certificate_pending")}
        </p>
      );
    }
    if (current.state === "live" && current.policy_url) {
      return (
        <BimiAlert tone="success">
          {t("settings.mta_sts_live_message", { url: current.policy_url })}
        </BimiAlert>
      );
    }

    return null;
  };

  const render_body = () => {
    if (load_failed) return <LoadFailedNotice on_retry={load} />;

    if (!view) {
      return (
        <div className="flex min-h-[160px] items-center justify-center">
          {show_spinner && <Spinner size="md" />}
        </div>
      );
    }

    const error_alert = action_error ? (
      <BimiAlert tone="error">{t(action_error)}</BimiAlert>
    ) : null;

    if (is_setup) {
      return (
        <div className="space-y-5" data-testid="mta-sts-setup">
          {view.state === "retiring" && retire_date && (
            <BimiAlert tone="warning">
              {t("settings.mta_sts_retiring_message", { date: retire_date })}
            </BimiAlert>
          )}
          <p className="text-sm text-txt-secondary">
            {t("settings.mta_sts_intro")}
          </p>
          {!view.domain_active && (
            <BimiAlert tone="warning">
              {t("settings.mta_sts_error_not_verified")}
            </BimiAlert>
          )}
          {render_mode_picker()}
          {error_alert}
        </div>
      );
    }

    return (
      <div className="space-y-5" data-testid="mta-sts-manage">
        <div className="flex flex-wrap items-center gap-2">
          <MtaStsStateChip state={view.state} />
          {checked_at && (
            <span className="text-xs text-txt-muted">
              {t("settings.mta_sts_last_checked", { date: checked_at })}
            </span>
          )}
        </div>
        {render_status_alert(view)}
        {error_alert}
        <section className="space-y-2">
          <SectionTitle>{t("settings.mta_sts_records_title")}</SectionTitle>
          <p className="text-sm text-txt-muted">
            {view.managed_by_registrar
              ? t("settings.mta_sts_records_managed")
              : t("settings.mta_sts_records_description")}
          </p>
          <MtaStsRecordList records={view.records} />
          <p className="text-xs text-txt-muted">
            {t("settings.mta_sts_tls_reporting_description")}
          </p>
        </section>
        {render_mode_picker()}
        {view.preview && (
          <section className="space-y-2">
            <SectionTitle>{t("settings.mta_sts_policy_preview")}</SectionTitle>
            <pre
              className="overflow-x-auto rounded-lg border border-edge-secondary px-3 py-2.5 font-mono text-[13px] text-txt-primary whitespace-pre"
              data-testid="mta-sts-preview"
            >
              {view.preview}
            </pre>
          </section>
        )}
        <section className="space-y-1">
          <SectionTitle>{t("settings.mta_sts_turn_off")}</SectionTitle>
          <p className="text-sm text-txt-muted">
            {t("settings.mta_sts_turn_off_description")}
          </p>
          <div className="pt-1">
            <Button
              className="disabled:opacity-50"
              disabled={busy !== null}
              variant="depth_destructive"
              onClick={() => set_confirm_off(true)}
            >
              {t("settings.mta_sts_turn_off")}
            </Button>
          </div>
        </section>
      </div>
    );
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

    if (is_setup) {
      return (
        <>
          <Button
            className="disabled:opacity-50"
            disabled={busy !== null}
            variant="outline"
            onClick={close}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="disabled:opacity-50"
            data-testid="mta-sts-turn-on"
            disabled={busy !== null || !view.domain_active || !view.entitled}
            variant="depth"
            onClick={handle_enable}
          >
            {busy === "enable" && <ButtonSpinner />}
            {busy === "enable"
              ? t("settings.mta_sts_turning_on")
              : t("settings.mta_sts_turn_on")}
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
          onClick={handle_check}
        >
          {busy === "check" ? (
            <ButtonSpinner />
          ) : (
            <ArrowPathIcon className="w-3.5 h-3.5" />
          )}
          {busy === "check"
            ? t("settings.mta_sts_checking")
            : t("settings.mta_sts_check_again")}
        </Button>
        {mode_changed ? (
          <Button
            className="disabled:opacity-50"
            data-testid="mta-sts-save-mode"
            disabled={busy !== null || !view.entitled}
            variant="depth"
            onClick={handle_enable}
          >
            {busy === "enable" && <ButtonSpinner />}
            {t("settings.mta_sts_save_mode")}
          </Button>
        ) : (
          <Button
            className="disabled:opacity-50"
            disabled={busy !== null}
            variant="depth"
            onClick={close}
          >
            {t("common.done")}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <Modal is_open={is_open} on_close={close} size="lg">
        <ModalHeader>
          <ModalTitle>{t("settings.mta_sts_title")}</ModalTitle>
          <ModalDescription>{domain.domain_name}</ModalDescription>
        </ModalHeader>
        <ModalBody>{render_body()}</ModalBody>
        <ModalFooter>{render_footer()}</ModalFooter>
      </Modal>
      <ConfirmationModal
        confirm_text={t("settings.mta_sts_turn_off_confirm")}
        is_loading={busy === "disable"}
        is_open={confirm_off}
        message={t("settings.mta_sts_turn_off_body")}
        on_cancel={() => {
          if (busy !== "disable") set_confirm_off(false);
        }}
        on_confirm={handle_turn_off}
        title={t("settings.mta_sts_turn_off_title")}
        variant="danger"
      />
    </>
  );
}
