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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArchiveBoxArrowDownIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { RadioRowWithDescription } from "@/components/settings/appearance/radio_row_with_description";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
  type TurnstileWidgetRef,
} from "@/components/auth/turnstile_widget";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { clamp_password } from "@/services/sanitize";
import { get_totp_status } from "@/services/api/totp";
import { derive_step_up_credentials } from "@/services/api/step_up";
import { verify_vanguard_credentials } from "@/services/api/vanguard";
import {
  verify_passphrase_for_export,
  issue_export_token,
  consume_export_token,
} from "@/services/crypto/memory_key_store";
import {
  is_fsa_supported,
  pick_zip_file,
  open_zip_blob,
  suggested_zip_filename,
  sink_write_data_file,
  sink_complete,
  sink_abort,
  type ExportSink,
} from "@/services/export/destination";
import { run_export, type ExportProgress, type ExportSummary } from "@/services/export/pipeline";
import { create_account_message_source } from "@/services/export/message_source";
import { emit_export_event } from "@/services/export/audit";
import { build_account_data_files } from "@/services/export/account_data";

type ExportStep =
  | "reauth"
  | "verify"
  | "warning"
  | "scope"
  | "format"
  | "destination"
  | "progress"
  | "complete";

type ExportFormat = "mbox" | "eml_dir";

interface ExportModalProps {
  is_open: boolean;
  on_close: () => void;
}

function format_bytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

export function ExportModal({ is_open, on_close }: ExportModalProps) {
  const { t } = use_i18n();
  const { user } = use_auth();

  const [step, set_step] = useState<ExportStep>("reauth");
  const [passphrase, set_passphrase] = useState("");
  const [reauth_error, set_reauth_error] = useState(false);
  const [token, set_token] = useState<string | null>(null);

  const [verify_password, set_verify_password] = useState("");
  const [verify_code, set_verify_code] = useState("");
  const [verify_totp_required, set_verify_totp_required] = useState(false);
  const [verify_show_password, set_verify_show_password] = useState(false);
  const [verify_loading, set_verify_loading] = useState(false);
  const [verify_error, set_verify_error] = useState("");
  const verify_submitting_ref = useRef(false);
  const verify_input_ref = useRef<HTMLInputElement>(null);
  const [captcha_token, set_captcha_token] = useState<string | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const [warning_ack, set_warning_ack] = useState(false);
  const [format, set_format] = useState<ExportFormat>("mbox");
  const [include_mail, set_include_mail] = useState(true);
  const [include_contacts, set_include_contacts] = useState(true);
  const [include_settings, set_include_settings] = useState(true);
  const [date_from, set_date_from] = useState("");
  const [date_to, set_date_to] = useState("");
  const [progress, set_progress] = useState<ExportProgress | null>(null);
  const [summary, set_summary] = useState<ExportSummary | null>(null);
  const [destination_label, set_destination_label] = useState<string | null>(
    null,
  );
  const abort_ref = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    set_step("reauth");
    set_passphrase("");
    set_reauth_error(false);
    set_token(null);
    set_verify_password("");
    set_verify_code("");
    set_verify_totp_required(false);
    set_verify_show_password(false);
    set_verify_loading(false);
    set_verify_error("");
    set_captcha_token(null);
    set_warning_ack(false);
    set_format("mbox");
    set_include_mail(true);
    set_include_contacts(true);
    set_include_settings(true);
    set_date_from("");
    set_date_to("");
    set_progress(null);
    set_summary(null);
    set_destination_label(null);
  }, []);

  const handle_close = useCallback(() => {
    if (step === "progress") return;
    reset();
    on_close();
  }, [on_close, reset, step]);

  useEffect(() => {
    if (!is_open) reset();
  }, [is_open, reset]);

  useEffect(() => {
    if (step !== "verify") return;
    get_totp_status()
      .then((res) => {
        if (res.data?.enabled) set_verify_totp_required(true);
      })
      .catch(() => {});
    setTimeout(() => verify_input_ref.current?.focus(), 100);
  }, [step]);

  const handle_reauth_submit = useCallback(() => {
    if (!verify_passphrase_for_export(passphrase)) {
      set_reauth_error(true);
      return;
    }
    const t_str = issue_export_token();
    if (!t_str) {
      set_reauth_error(true);
      return;
    }
    set_token(t_str);
    set_passphrase("");
    set_step("verify");
  }, [passphrase]);

  const verify_can_submit =
    !!verify_password &&
    (!verify_totp_required || verify_code.length === 6) &&
    (!turnstile_required || !!captcha_token) &&
    !verify_loading;

  const handle_verify_submit = useCallback(async () => {
    if (!verify_can_submit || !user?.email || verify_submitting_ref.current) return;

    verify_submitting_ref.current = true;
    set_verify_loading(true);
    set_verify_error("");

    try {
      const credentials = await derive_step_up_credentials(
        user.email,
        verify_password,
        verify_totp_required ? verify_code : undefined,
      );
      const res = await verify_vanguard_credentials({
        ...credentials,
        for_export: true,
        captcha_token: captcha_token ?? undefined,
      });

      if (res.error || !res.data?.valid) {
        set_verify_error(t("common.step_up_error"));
        set_captcha_token(null);
        turnstile_ref.current?.reset();
        return;
      }

      set_verify_password("");
      set_verify_code("");
      set_captcha_token(null);
      set_step("warning");
    } catch (err) {
      set_verify_error(
        err instanceof Error ? err.message : t("common.step_up_error"),
      );
      set_captcha_token(null);
      turnstile_ref.current?.reset();
    } finally {
      verify_submitting_ref.current = false;
      set_verify_loading(false);
    }
  }, [
    t,
    user,
    verify_can_submit,
    verify_code,
    verify_password,
    verify_totp_required,
    captcha_token,
  ]);

  const handle_warning_continue = useCallback(() => {
    if (!warning_ack) return;
    set_step("scope");
  }, [warning_ack]);

  const handle_scope_continue = useCallback(() => {
    if (!include_mail && !include_contacts && !include_settings) return;
    set_step(include_mail ? "format" : "destination");
  }, [include_mail, include_contacts, include_settings]);

  const run_pipeline = useCallback(
    async (sink: ExportSink, dest_label: string) => {
      if (!token || !consume_export_token(token)) {
        show_toast(t("settings.export_error_no_vault"), "error");
        set_step("reauth");
        return;
      }
      set_destination_label(dest_label);
      set_step("progress");

      const controller = new AbortController();
      abort_ref.current = controller;

      const source = create_account_message_source();
      emit_export_event({
        kind: "started",
        count: 0,
        total_bytes: 0,
        format,
      });

      let result: ExportSummary | null = null;
      let fatal = false;
      try {
        if (include_mail) {
          result = await run_export({
            scope: {
              preset: date_from || date_to ? "custom" : "all",
              date_from: date_from || undefined,
              date_to: date_to || undefined,
            },
            format,
            sink,
            source,
            signal: controller.signal,
            on_progress: (p) => set_progress(p),
          });
        }

        if (include_contacts || include_settings) {
          const extras = await build_account_data_files({
            contacts: include_contacts,
            settings: include_settings,
          });
          for (const f of extras) {
            await sink_write_data_file(sink, f.name, f.bytes);
          }
        }

        await sink_complete(sink);
      } catch (err) {
        fatal = true;
        if (import.meta.env.DEV) console.error(err);
        await sink_abort(sink);
        show_toast(t("settings.export_error_write_fatal"), "error");
      }
      emit_export_event({
        kind: fatal || result?.cancelled ? "aborted" : "completed",
        count: result?.processed ?? 0,
        total_bytes: result?.bytes_written ?? 0,
        format,
      });

      set_summary(result);
      set_step("complete");
    },
    [date_from, date_to, format, include_mail, include_contacts, include_settings, t, token],
  );

  const handle_pick_destination = useCallback(async () => {
    const name = suggested_zip_filename();
    if (is_fsa_supported()) {
      const sink = await pick_zip_file(name);
      if (!sink) return;
      await run_pipeline(sink, sink.filename);
    } else {
      const sink = open_zip_blob(name);
      await run_pipeline(sink, name);
    }
  }, [run_pipeline]);

  const handle_cancel_progress = useCallback(() => {
    abort_ref.current?.abort();
  }, []);

  let title = t("settings.export_title");
  let description: string | null = null;
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === "reauth") {
    title = t("settings.export_step_reauth_title");
    description = t("settings.export_reauth_prompt");
    body = (
      <div className="space-y-2">
        <Input
          autoFocus
          className="w-full"
          maxLength={256}
          placeholder="••••••••"
          status={reauth_error ? "error" : "default"}
          type="password"
          value={passphrase}
          onChange={(e) => {
            set_passphrase(e.target.value);
            set_reauth_error(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && handle_reauth_submit()}
        />
        {reauth_error && (
          <p className="text-sm text-red-500">
            {t("settings.export_reauth_failed")}
          </p>
        )}
      </div>
    );
    footer = (
      <>
        <Button variant="outline" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={passphrase.length === 0}
          variant="depth"
          onClick={handle_reauth_submit}
        >
          {t("settings.export_reauth_submit")}
        </Button>
      </>
    );
  } else if (step === "verify") {
    title = t("settings.export_step_verify_title");
    description = t("settings.export_verify_description");
    body = (
      <div className="space-y-4">
        <div>
          <label
            className="text-sm font-medium block mb-2 text-txt-primary"
            htmlFor="export-verify-password"
          >
            {t("settings.password")}
          </label>
          <div className="relative">
            <Input
              ref={verify_input_ref}
              className="w-full pr-10"
              disabled={verify_loading}
              id="export-verify-password"
              maxLength={128}
              placeholder={t("settings.enter_your_password_placeholder")}
              status={verify_error ? "error" : "default"}
              type={verify_show_password ? "text" : "password"}
              value={verify_password}
              onChange={(e) => set_verify_password(clamp_password(e.target.value))}
              onKeyDown={(e) =>
                e["key"] === "Enter" &&
                !verify_totp_required &&
                handle_verify_submit()
              }
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted"
              type="button"
              onClick={() => set_verify_show_password(!verify_show_password)}
            >
              {verify_show_password ? (
                <EyeSlashIcon className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {verify_totp_required && (
          <div>
            <label
              className="text-sm font-medium block mb-2 text-txt-primary"
              htmlFor="export-verify-code"
            >
              {t("settings.authenticator_code")}
            </label>
            <Input
              autoComplete="one-time-code"
              className="text-center text-2xl font-semibold tracking-[0.5em]"
              disabled={verify_loading}
              id="export-verify-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              status={verify_error ? "error" : "default"}
              type="text"
              value={verify_code}
              onChange={(e) =>
                set_verify_code(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={(e) => e["key"] === "Enter" && handle_verify_submit()}
            />
          </div>
        )}

        {turnstile_required && (
          <TurnstileWidget
            ref={turnstile_ref}
            on_verify={set_captcha_token}
            on_expire={() => set_captcha_token(null)}
          />
        )}

        {verify_error && (
          <p className="text-sm text-center text-red-500">{verify_error}</p>
        )}
      </div>
    );
    footer = (
      <>
        <Button disabled={verify_loading} variant="outline" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!verify_can_submit}
          variant="depth"
          onClick={handle_verify_submit}
        >
          {verify_loading ? <Spinner className="mr-2" size="md" /> : null}
          {t("settings.export_verify_submit")}
        </Button>
      </>
    );
  } else if (step === "warning") {
    title = t("settings.export_warning_title");
    body = (
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-500 p-3.5">
          <div className="flex items-start gap-2.5">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-950 mt-[3px]" />
            <p className="text-sm font-semibold text-amber-950 leading-relaxed">
              {t("settings.export_warning_body")}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <Checkbox
            checked={warning_ack}
            onCheckedChange={(v) => set_warning_ack(v === true)}
          />
          <span className="text-sm text-txt-secondary">
            {t("settings.export_warning_confirm")}
          </span>
        </label>
      </div>
    );
    footer = (
      <>
        <Button variant="outline" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!warning_ack}
          variant="depth"
          onClick={handle_warning_continue}
        >
          {t("common.continue")}
        </Button>
      </>
    );
  } else if (step === "scope") {
    const none_selected =
      !include_mail && !include_contacts && !include_settings;
    const Row = ({
      checked,
      on_change,
      title: row_title,
      row_body,
      icon: Icon,
    }: {
      checked: boolean;
      on_change: (v: boolean) => void;
      title: string;
      row_body: string;
      icon: typeof EnvelopeIcon;
    }) => (
      <label
        className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
          checked
            ? "border-brand"
            : "border-edge-secondary hover:bg-surf-secondary/50"
        }`}
      >
        <Icon className="w-5 h-5 mt-0.5 text-txt-secondary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary">{row_title}</p>
          <p className="text-sm mt-0.5 text-txt-muted">{row_body}</p>
        </div>
        <span className="flex-shrink-0">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => on_change(v === true)}
          />
        </span>
      </label>
    );
    title = t("settings.export_step_scope_title");
    body = (
      <div className="space-y-3">
        <Row
          checked={include_mail}
          icon={EnvelopeIcon}
          on_change={set_include_mail}
          row_body={t("settings.export_scope_mail_body")}
          title={t("settings.export_scope_mail_title")}
        />
        <Row
          checked={include_contacts}
          icon={UserGroupIcon}
          on_change={set_include_contacts}
          row_body={t("settings.export_scope_contacts_body")}
          title={t("settings.export_scope_contacts_title")}
        />
        <Row
          checked={include_settings}
          icon={Cog6ToothIcon}
          on_change={set_include_settings}
          row_body={t("settings.export_scope_settings_body")}
          title={t("settings.export_scope_settings_title")}
        />
      </div>
    );
    footer = (
      <>
        <Button variant="outline" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={none_selected}
          variant="depth"
          onClick={handle_scope_continue}
        >
          {t("common.continue")}
        </Button>
      </>
    );
  } else if (step === "format") {
    title = t("settings.export_step_format_title");
    body = (
      <div className="space-y-5">
        <div className="space-y-3">
          <RadioRowWithDescription
            description={t("settings.export_format_mbox_hint")}
            is_selected={format === "mbox"}
            label={t("settings.export_format_mbox_name")}
            on_select={() => set_format("mbox")}
          />
          <RadioRowWithDescription
            description={t("settings.export_format_eml_hint")}
            is_selected={format === "eml_dir"}
            label={t("settings.export_format_eml_name")}
            on_select={() => set_format("eml_dir")}
          />
        </div>

        <div>
          <p className="text-xs font-medium text-txt-muted mb-2">
            {t("settings.export_scope_date_range")}
          </p>
          <div className="grid grid-cols-2 gap-3 rounded-[16px] border border-edge-secondary p-3">
            <div>
              <label className="text-xs text-txt-muted">
                {t("settings.export_scope_date_from")}
              </label>
              <Input
                className="w-full mt-1"
                type="date"
                value={date_from}
                onChange={(e) => set_date_from(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-txt-muted">
                {t("settings.export_scope_date_to")}
              </label>
              <Input
                className="w-full mt-1"
                type="date"
                value={date_to}
                onChange={(e) => set_date_to(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    );
    footer = (
      <>
        <Button variant="outline" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button variant="depth" onClick={() => set_step("destination")}>
          {t("common.continue")}
        </Button>
      </>
    );
  } else if (step === "destination") {
    const fsa = is_fsa_supported();
    const action_label = fsa
      ? t("settings.export_destination_pick_file")
      : t("common.download");
    title = t("settings.export_step_destination_title");
    body = (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-dashed border-edge-secondary bg-surf-secondary/40">
          <ArchiveBoxArrowDownIcon className="w-10 h-10 text-txt-secondary" />
          <p className="text-xs text-txt-secondary text-center">
            {suggested_zip_filename()}
          </p>
        </div>
        {!fsa && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-surf-secondary/60 border border-edge-secondary">
            <InformationCircleIcon className="w-4 h-4 mt-0.5 text-txt-muted flex-shrink-0" />
            <p className="text-xs text-txt-muted leading-relaxed">
              {t("settings.export_destination_fallback_notice")}
            </p>
          </div>
        )}
      </div>
    );
    footer = (
      <>
        <Button variant="outline" onClick={handle_close}>
          {t("common.cancel")}
        </Button>
        <Button variant="depth" onClick={handle_pick_destination}>
          {action_label}
        </Button>
      </>
    );
  } else if (step === "progress") {
    const total = progress?.total ?? 0;
    const processed = progress?.processed ?? 0;
    const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    title = t("settings.export_step_progress_title");
    body = (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-txt-secondary">
          <Spinner className="text-brand" size="sm" />
          <span>
            {t("settings.export_progress_messages", {
              processed: String(processed),
              total: String(total),
            })}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surf-tertiary overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: percent + "%",
              background: "var(--color-brand)",
              transition: "width 0.4s ease-out",
            }}
          />
        </div>
        <p className="text-xs text-txt-muted">
          {t("settings.export_progress_bytes_written", {
            bytes: format_bytes(progress?.bytes_written ?? 0),
          })}
        </p>
      </div>
    );
    footer = (
      <Button variant="outline" onClick={handle_cancel_progress}>
        {t("settings.export_cancel")}
      </Button>
    );
  } else {
    title = t("settings.export_step_complete_title");
    body = (
      <div className="py-8 text-center">
        <CheckCircleIcon
          className="w-16 h-16 mx-auto mb-4"
          style={{ color: "var(--color-success)" }}
        />
        <h3 className="text-lg font-semibold mb-2 text-txt-primary">
          {t("settings.export_complete_summary", {
            count: String(summary?.processed ?? 0),
            total: String(summary?.total ?? 0),
          })}
        </h3>
        <div className="space-y-1">
          <p className="text-sm text-txt-secondary">
            {t("settings.export_complete_bytes", {
              bytes: format_bytes(summary?.bytes_written ?? 0),
            })}
          </p>
          {destination_label && (
            <p className="text-xs text-txt-muted">
              {t("settings.export_complete_location", {
                location: destination_label,
              })}
            </p>
          )}
          {summary && summary.errors.length > 0 && (
            <p className="text-xs text-red-500 mt-2">
              {t("settings.export_complete_errors", {
                count: String(summary.errors.length),
              })}
            </p>
          )}
        </div>
      </div>
    );
    footer = (
      <Button variant="depth" onClick={handle_close}>
        {t("common.done")}
      </Button>
    );
  }

  return (
    <Modal
      is_open={is_open}
      on_close={handle_close}
      close_on_overlay={false}
      show_close_button={step !== "progress"}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        {description && <ModalDescription>{description}</ModalDescription>}
      </ModalHeader>
      <ModalBody>{body}</ModalBody>
      <ModalFooter>{footer}</ModalFooter>
    </Modal>
  );
}
