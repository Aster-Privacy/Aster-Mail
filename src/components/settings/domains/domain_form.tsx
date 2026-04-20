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

import { useState, useEffect, useMemo, useRef } from "react";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";
import {
  ClipboardDocumentIcon,
  CheckIcon,
  XCircleIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  add_domain,
  trigger_verification,
  validate_domain_name,
  type CustomDomain,
  type DnsRecord,
  type VerificationResult,
} from "@/services/api/domains";

function get_dns_steps(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  return [
    {
      id: "verification",
      record_key: "txt_verified",
      title: t("settings.domain_ownership_verification"),
      subtitle: t("settings.txt_record"),
      description: t("settings.verification_description"),
      instructions: [
        t("settings.dns_instruction_login"),
        t("settings.dns_instruction_navigate"),
        t("settings.dns_instruction_add_txt"),
        t("settings.dns_instruction_save_wait"),
      ],
      help: t("settings.verification_help"),
    },
    {
      id: "mx",
      record_key: "mx_verified",
      title: t("settings.mail_routing"),
      subtitle: t("settings.mx_record"),
      description: t("settings.mx_description"),
      instructions: [
        t("settings.dns_instruction_add_mx"),
        t("settings.set_host_root"),
        t("settings.dns_instruction_set_priority"),
        t("settings.dns_instruction_save"),
      ],
      help: t("settings.mx_help"),
    },
    {
      id: "spf",
      record_key: "spf_verified",
      title: t("settings.sender_policy_framework"),
      subtitle: t("settings.spf_record"),
      description: t("settings.spf_description"),
      instructions: [
        t("settings.dns_instruction_add_txt_settings"),
        t("settings.set_host_root"),
        t("settings.dns_instruction_set_spf"),
        t("settings.dns_instruction_merge_spf"),
      ],
      help: t("settings.spf_help"),
    },
    {
      id: "dkim",
      record_key: "dkim_verified",
      title: t("settings.email_signing"),
      subtitle: t("settings.dkim_record"),
      description: t("settings.dkim_description"),
      instructions: [
        t("settings.dns_instruction_add_txt_settings"),
        t("settings.use_exact_host"),
        t("settings.dns_instruction_set_dkim"),
        t("settings.dns_instruction_save"),
      ],
      help: t("settings.dkim_help"),
    },
    {
      id: "dmarc",
      record_key: "dmarc_configured",
      title: t("settings.email_authentication_policy"),
      subtitle: t("settings.dmarc_record"),
      description: t("settings.dmarc_description"),
      instructions: [
        t("settings.dns_instruction_add_txt_settings"),
        t("settings.dns_instruction_set_dmarc_host"),
        t("settings.dns_instruction_set_dmarc_value"),
        t("settings.dns_instruction_save"),
      ],
      help: t("settings.dmarc_help"),
    },
  ];
}

type StepStatus = "pending" | "verified" | "failed" | "checking";

interface DomainFormProps {
  is_open: boolean;
  on_close: () => void;
  mode: "create" | "setup";
  domain_name?: string;
  domain_id?: string;
  records?: DnsRecord[];
  max_domains: number;
  current_count: number;
  on_domain_created: (domain: CustomDomain, records: DnsRecord[]) => void;
  on_verification_complete: (
    domain_id: string,
    result: VerificationResult,
  ) => void;
}

export function DomainForm({
  is_open,
  on_close,
  mode,
  domain_name: initial_domain_name,
  domain_id: initial_domain_id,
  records: initial_records,
  max_domains,
  current_count,
  on_domain_created,
  on_verification_complete,
}: DomainFormProps) {
  const { t } = use_i18n();
  const dns_steps = useMemo(() => get_dns_steps(t), [t]);
  const [wizard_step, set_wizard_step] = useState<"input" | "dns">(
    mode === "create" ? "input" : "dns",
  );
  const [domain_name, set_domain_name] = useState("");
  const [domain_id, set_domain_id] = useState<string | null>(
    initial_domain_id || null,
  );
  const [dns_records, set_dns_records] = useState<DnsRecord[]>(
    initial_records || [],
  );
  const [current_dns_step, set_current_dns_step] = useState(0);
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [step_statuses, set_step_statuses] = useState<StepStatus[]>(
    dns_steps.map(() => "pending"),
  );
  const [is_verifying, set_is_verifying] = useState(false);
  const [verification_message, set_verification_message] = useState<
    string | null
  >(null);
  const [captcha_token, set_captcha_token] = useState<string | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (is_open) {
      if (mode === "create") {
        set_wizard_step("input");
        set_domain_name("");
        set_domain_id(null);
        set_dns_records([]);
        set_error(null);
      } else {
        set_wizard_step("dns");
        set_domain_id(initial_domain_id || null);
        set_dns_records(initial_records || []);
      }
      set_current_dns_step(0);
      set_step_statuses(dns_steps.map(() => "pending"));
      set_verification_message(null);
      set_saving(false);
      set_is_verifying(false);
      set_captcha_token(null);
      turnstile_ref.current?.reset();
    }
  }, [is_open, mode, initial_domain_id, initial_records]);

  const copy_to_clipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        show_toast(t("settings.copied_to_clipboard"), "success");
      })
      .catch(() => {});
  };

  const handle_create_domain = async () => {
    const trimmed = domain_name.trim().toLowerCase();
    const validation = validate_domain_name(trimmed);

    if (!validation.valid) {
      set_error(validation.error || t("settings.invalid_domain"));

      return;
    }

    set_saving(true);
    set_error(null);

    try {
      const response = await add_domain(trimmed, captcha_token ?? undefined);

      if (response.error) {
        set_error(response.error);
        set_saving(false);
        set_captcha_token(null);
        turnstile_ref.current?.reset();

        return;
      }

      if (response.data) {
        const new_domain: CustomDomain = {
          id: response.data.id,
          domain_name: response.data.domain_name,
          status: "pending",
          txt_verified: false,
          mx_verified: false,
          spf_verified: false,
          dkim_verified: false,
          dmarc_configured: false,
          catch_all_enabled: false,
          is_primary: false,
          health_status: "unknown",
          verification_token: response.data.verification_token,
          created_at: response.data.created_at,
        };

        set_domain_id(response.data.id);
        set_dns_records(response.data.dns_records);
        set_domain_name(response.data.domain_name);
        on_domain_created(new_domain, response.data.dns_records);
        set_wizard_step("dns");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_error(t("settings.failed_add_domain"));
    }

    set_saving(false);
  };

  const run_verification = async () => {
    if (!domain_id) return;

    set_is_verifying(true);
    set_verification_message(null);
    set_step_statuses((prev) => prev.map(() => "checking"));

    try {
      const response = await trigger_verification(domain_id);

      if (response.data) {
        const result = response.data;

        const new_statuses: StepStatus[] = [
          result.txt_verified ? "verified" : "failed",
          result.mx_verified ? "verified" : "failed",
          result.spf_verified ? "verified" : "failed",
          result.dkim_verified ? "verified" : "failed",
          result.dmarc_configured ? "verified" : "failed",
        ];

        set_step_statuses(new_statuses);
        set_verification_message(result.message);
        on_verification_complete(domain_id, result);
      } else {
        set_step_statuses((prev) => prev.map(() => "pending"));
        set_verification_message(
          response.error || t("settings.verification_failed_retry"),
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_step_statuses((prev) => prev.map(() => "pending"));
      set_verification_message(t("settings.verification_failed_retry"));
    }

    set_is_verifying(false);
  };

  const get_records_for_step = (step_id: string): DnsRecord[] => {
    return dns_records.filter((r) => r.purpose === step_id);
  };

  const display_domain_name = domain_name || initial_domain_name || "";
  const at_limit = current_count >= max_domains && mode === "create";

  if (wizard_step === "input") {
    return (
      <Modal is_open={is_open} on_close={on_close} size="xl">
        <ModalHeader>
          <ModalTitle>
            {at_limit
              ? t("settings.domain_limit_reached")
              : t("settings.add_custom_domain")}
          </ModalTitle>
          <ModalDescription>
            {at_limit
              ? t("settings.domain_limit_all_used", { count: max_domains })
              : t("settings.domain_input_description")}
          </ModalDescription>
        </ModalHeader>

        <ModalBody>
          {at_limit ? (
            <p className="text-sm text-txt-secondary">
              {t("settings.upgrade_plan_more_domains")}
            </p>
          ) : (
            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="domain-name-input"
              >
                {t("settings.domain_name_label")}
              </label>
              <Input
                autoFocus
                id="domain-name-input"
                placeholder="example.com"
                size="lg"
                status={
                  domain_name && !validate_domain_name(domain_name).valid
                    ? "error"
                    : domain_name && validate_domain_name(domain_name).valid
                      ? "success"
                      : "default"
                }
                value={domain_name}
                onChange={(e) =>
                  set_domain_name(e.target.value.toLowerCase().trim())
                }
                onKeyDown={(e) =>
                  e["key"] === "Enter" &&
                  !saving &&
                  domain_name &&
                  validate_domain_name(domain_name).valid &&
                  handle_create_domain()
                }
              />
              <p className="text-xs mt-1.5 text-txt-muted">
                {t("settings.domain_without_www_note")}
              </p>
              {domain_name && !validate_domain_name(domain_name).valid && (
                <p className="text-xs mt-1.5 text-red-500">
                  {validate_domain_name(domain_name).error}
                </p>
              )}
              {turnstile_required && (
                <div className="flex justify-center mt-4">
                  <TurnstileWidget
                    ref={turnstile_ref}
                    on_expire={() => set_captcha_token(null)}
                    on_verify={set_captcha_token}
                  />
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        </ModalBody>

        <ModalFooter>
          <Button variant={at_limit ? "outline" : "ghost"} onClick={on_close}>
            {t("common.cancel")}
          </Button>
          {at_limit ? (
            <Button
              variant="depth"
              onClick={() => {
                on_close();
                window.dispatchEvent(
                  new CustomEvent("navigate-settings", { detail: "billing" }),
                );
              }}
            >
              {t("common.upgrade_plan")}
            </Button>
          ) : (
            <Button
              disabled={
                saving ||
                !domain_name ||
                !validate_domain_name(domain_name).valid ||
                (turnstile_required && !captcha_token)
              }
              variant="depth"
              onClick={handle_create_domain}
            >
              {saving ? (
                <>
                  <Spinner size="xs" />
                  {t("common.adding")}
                </>
              ) : (
                <>
                  {t("common.continue")}
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    );
  }

  const step = dns_steps[current_dns_step];
  const step_records = get_records_for_step(step.id);
  const step_status = step_statuses[current_dns_step];
  const all_verified = step_statuses.every((s) => s === "verified");
  const any_checked = step_statuses.some(
    (s) => s === "verified" || s === "failed",
  );

  return (
    <Modal is_open={is_open} on_close={on_close} size="xl">
      <ModalHeader>
        <ModalTitle>
          {t("settings.configure_dns_for", { domain: display_domain_name })}
        </ModalTitle>
        <ModalDescription>
          {t("settings.configure_dns_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="flex items-center justify-center gap-1 mb-6">
          {dns_steps.map((s, index) => (
            <div key={s.id} className="flex items-center">
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all"
                disabled={is_verifying}
                style={{
                  backgroundColor:
                    step_statuses[index] === "verified"
                      ? "var(--color-green-600, #16a34a)"
                      : step_statuses[index] === "failed"
                        ? "var(--color-red-600, #dc2626)"
                        : index === current_dns_step
                          ? "var(--text-muted)"
                          : "var(--bg-tertiary)",
                  color:
                    step_statuses[index] === "verified" ||
                    step_statuses[index] === "failed" ||
                    index === current_dns_step
                      ? "white"
                      : "var(--text-muted)",
                  opacity: is_verifying ? 0.6 : 1,
                  cursor: is_verifying ? "default" : "pointer",
                }}
                onClick={() => !is_verifying && set_current_dns_step(index)}
              >
                {step_statuses[index] === "verified" ? (
                  <CheckIcon className="w-3.5 h-3.5" />
                ) : step_statuses[index] === "failed" ? (
                  <XCircleIcon className="w-3.5 h-3.5" />
                ) : step_statuses[index] === "checking" ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  index + 1
                )}
              </button>
              {index < dns_steps.length - 1 && (
                <div
                  className="w-5 h-0.5 mx-0.5"
                  style={{
                    backgroundColor:
                      step_statuses[index] === "verified"
                        ? "var(--color-green-600, #16a34a)"
                        : "var(--bg-tertiary)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-surf-tertiary text-txt-muted">
              {t("common.step_x_of_y", {
                current: current_dns_step + 1,
                total: dns_steps.length,
              })}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-surf-tertiary text-txt-muted">
              {step.subtitle}
            </span>
            {step_status === "verified" && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded"
                style={{ backgroundColor: "#16a34a", color: "#fff" }}
              >
                {t("common.verified")}
              </span>
            )}
            {step_status === "failed" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/10 text-red-600">
                {t("common.not_detected")}
              </span>
            )}
          </div>
          <h4 className="text-base font-semibold text-txt-primary">
            {step.title}
          </h4>
          <p className="text-sm mt-1 text-txt-muted">{step.description}</p>
        </div>

        <div className="p-3 rounded-lg mb-4 bg-surf-secondary border border-edge-secondary">
          <p className="text-sm font-medium mb-2 text-txt-primary">
            {t("common.instructions")}
          </p>
          <ol className="space-y-1.5">
            {step.instructions.map((instruction, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-medium mt-0.5 bg-surf-tertiary text-txt-muted">
                  {i + 1}
                </span>
                <span className="text-sm text-txt-secondary">
                  {instruction}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3 mb-4">
          <p className="text-sm font-medium text-txt-primary">
            {t("common.dns_records_to_add")}
          </p>
          {step_records.map((record, index) => (
            <div
              key={index}
              className="p-3 rounded-lg bg-surf-secondary"
              style={{
                border: `1px solid ${step_status === "verified" ? "var(--color-green-600, #16a34a)" : "var(--border-secondary)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-surf-tertiary text-txt-secondary">
                  {record.record_type}
                </span>
                {record.priority !== undefined && (
                  <span className="text-xs text-txt-muted">
                    {t("common.priority")}: {record.priority}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs mb-0.5 font-medium text-txt-muted">
                    {t("common.host_name")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono break-all flex-1 text-txt-primary">
                      {record.host}
                    </p>
                    <Button
                      className="h-6 w-6 flex-shrink-0"
                      size="icon"
                      variant="ghost"
                      onClick={() => copy_to_clipboard(record.host)}
                    >
                      <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs mb-0.5 font-medium text-txt-muted">
                    {t("common.value_points_to")}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono break-all flex-1 text-txt-primary">
                      {record.value}
                    </p>
                    <Button
                      className="h-6 w-6 flex-shrink-0"
                      size="icon"
                      variant="ghost"
                      onClick={() => copy_to_clipboard(record.value)}
                    >
                      <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-lg text-sm mb-4 bg-surf-secondary border border-edge-secondary text-txt-secondary">
          <p className="font-medium mb-1 text-txt-primary">{t("common.tip")}</p>
          <p>{step.help}</p>
        </div>

        {verification_message && (
          <div
            className="flex items-start gap-3 p-3 rounded-lg text-sm"
            style={{
              backgroundColor: all_verified ? "#16a34a" : "var(--bg-secondary)",
              color: all_verified ? "#fff" : undefined,
              border: `1px solid ${all_verified ? "#16a34a" : "var(--border-secondary)"}`,
            }}
          >
            {all_verified ? (
              <CheckCircleIcon
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                style={{ color: "#fff" }}
              />
            ) : any_checked ? (
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-yellow-500 mt-0.5" />
            ) : (
              <ClockIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-txt-primary">{verification_message}</p>
              {!all_verified && any_checked && (
                <p className="mt-1 text-xs text-txt-muted">
                  {t("settings.dns_propagation_close_note")}
                </p>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button
          disabled={current_dns_step === 0 || is_verifying}
          variant="ghost"
          onClick={() => set_current_dns_step((s) => s - 1)}
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          {t("common.previous")}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            disabled={is_verifying}
            variant="ghost"
            onClick={run_verification}
          >
            {is_verifying ? (
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowPathIcon className="w-3.5 h-3.5" />
            )}
            {is_verifying ? t("common.checking") : t("common.verify")}
          </Button>

          {current_dns_step < dns_steps.length - 1 ? (
            <Button
              disabled={is_verifying}
              variant="depth"
              onClick={() => set_current_dns_step((s) => s + 1)}
            >
              {t("common.next")}
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button disabled={is_verifying} variant="depth" onClick={on_close}>
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              {all_verified ? t("common.done") : t("common.close_verify_later")}
            </Button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}
