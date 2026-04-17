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

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardDocumentIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  StarIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { show_toast } from "@/components/toast/simple_toast";
import {
  add_domain,
  trigger_verification,
  validate_domain_name,
  type DnsRecord,
  type AddDomainResponse,
} from "@/services/api/domains";

function get_wizard_steps(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  return [
    {
      id: "verification",
      title: t("settings.domain_ownership_verification"),
      subtitle: t("settings.txt_record"),
      description: t("settings.verification_description"),
      instructions: [
        t("settings.dns_instruction_login"),
        t("settings.dns_instruction_navigate"),
        t("settings.dns_instruction_add_txt"),
        t("settings.dns_instruction_save_wait"),
      ],
    },
    {
      id: "mx",
      title: t("settings.mail_routing"),
      subtitle: t("settings.mx_record"),
      description: t("settings.mx_description"),
      instructions: [
        t("settings.dns_instruction_add_mx"),
        t("settings.set_host_root"),
        t("settings.dns_instruction_set_priority"),
        t("settings.dns_instruction_save"),
      ],
    },
    {
      id: "spf",
      title: t("settings.sender_policy_framework"),
      subtitle: t("settings.spf_record"),
      description: t("settings.spf_description"),
      instructions: [
        t("settings.dns_instruction_add_txt_settings"),
        t("settings.set_host_root"),
        t("settings.dns_instruction_set_spf"),
        t("settings.dns_instruction_merge_spf"),
      ],
    },
    {
      id: "dkim",
      title: t("settings.email_signing"),
      subtitle: t("settings.dkim_record"),
      description: t("settings.dkim_description"),
      instructions: [
        t("settings.dns_instruction_add_txt_settings"),
        t("settings.use_exact_host"),
        t("settings.dns_instruction_set_dkim"),
        t("settings.dns_instruction_save"),
      ],
    },
    {
      id: "dmarc",
      title: t("settings.email_authentication_policy"),
      subtitle: t("settings.dmarc_record"),
      description: t("settings.dmarc_description"),
      instructions: [
        t("settings.dns_instruction_add_txt_settings"),
        t("settings.dns_instruction_set_dmarc_host"),
        t("settings.dns_instruction_set_dmarc_value"),
        t("settings.dns_instruction_save"),
      ],
    },
  ];
}

type StepStatus = "pending" | "verified" | "failed" | "checking";

interface DomainSetupModalProps {
  is_open: boolean;
  mode: "input" | "dns";
  domain_id: string | null;
  domain_name: string;
  dns_records: DnsRecord[];
  max_domains: number;
  current_count: number;
  on_close: () => void;
  on_domain_added: (response: AddDomainResponse) => void;
  on_domains_changed: () => void;
}

export function DomainSetupModal({
  is_open,
  mode,
  domain_id,
  domain_name,
  dns_records,
  max_domains,
  current_count,
  on_close,
  on_domain_added,
  on_domains_changed,
}: DomainSetupModalProps) {
  const { t } = use_i18n();
  const wizard_steps = useMemo(() => get_wizard_steps(t), [t]);
  const [domain_input, set_domain_input] = useState("");
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [current_step, set_current_step] = useState(0);
  const [step_statuses, set_step_statuses] = useState<StepStatus[]>(
    wizard_steps.map(() => "pending"),
  );
  const [is_verifying, set_is_verifying] = useState(false);
  const [verification_message, set_verification_message] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (is_open && mode === "input") {
      set_domain_input("");
      set_error(null);
    }
    if (is_open) {
      set_current_step(0);
      set_step_statuses(wizard_steps.map(() => "pending"));
      set_verification_message(null);
    }
  }, [is_open, mode]);

  const handle_add = async () => {
    const validation = validate_domain_name(domain_input);

    if (!validation.valid) {
      set_error(validation.error || t("settings.invalid_domain"));

      return;
    }

    set_saving(true);
    set_error(null);

    try {
      const response = await add_domain(domain_input);

      if (response.error) {
        set_error(response.error);
      } else if (response.data) {
        on_domain_added(response.data);
      }
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : t("settings.failed_add_domain"),
      );
    } finally {
      set_saving(false);
    }
  };

  const copy_to_clipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        show_toast(t("settings.copied_to_clipboard"), "success");
      })
      .catch(() => {});
  };

  const get_records_for_step = (step_id: string): DnsRecord[] => {
    return dns_records.filter((r) => r.purpose === step_id);
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

        set_step_statuses([
          result.txt_verified ? "verified" : "failed",
          result.mx_verified ? "verified" : "failed",
          result.spf_verified ? "verified" : "failed",
          result.dkim_verified ? "verified" : "failed",
          result.dmarc_configured ? "verified" : "failed",
        ]);
        set_verification_message(result.message);
        on_domains_changed();
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
    } finally {
      set_is_verifying(false);
    }
  };

  const at_limit = max_domains !== -1 && current_count >= max_domains;
  const all_verified = step_statuses.every((s) => s === "verified");
  const any_checked = step_statuses.some(
    (s) => s === "verified" || s === "failed",
  );

  if (mode === "input") {
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
            <div className="flex items-center gap-3 p-4 rounded-lg bg-surf-tertiary border border-edge-secondary">
              <StarIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
              <p className="text-sm text-txt-secondary">
                {t("settings.upgrade_plan_more_domains")}
              </p>
            </div>
          ) : (
            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="domain-name"
              >
                {t("settings.domain_name_label")}
              </label>
              <input
                autoFocus
                className="w-full h-10 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none"
                id="domain-name"
                placeholder="example.com"
                value={domain_input}
                onChange={(e) =>
                  set_domain_input(e.target.value.toLowerCase().trim())
                }
                onKeyDown={(e) => e["key"] === "Enter" && handle_add()}
              />
              {domain_input && !validate_domain_name(domain_input).valid && (
                <p className="text-xs mt-1.5 text-red-500">
                  {validate_domain_name(domain_input).error}
                </p>
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
                !domain_input ||
                !validate_domain_name(domain_input).valid
              }
              variant="depth"
              onClick={handle_add}
            >
              {saving ? (
                t("common.adding")
              ) : (
                <>
                  {t("common.continue")}
                  <ArrowRightIcon className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    );
  }

  const step = wizard_steps[current_step];
  const step_records = get_records_for_step(step.id);
  const step_status = step_statuses[current_step];

  return (
    <Modal is_open={is_open} on_close={on_close} size="xl">
      <ModalHeader>
        <ModalTitle>
          {t("settings.configure_dns_for", { domain: domain_name })}
        </ModalTitle>
        <ModalDescription>
          {t("settings.configure_dns_description")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody>
        <div className="flex items-center justify-center gap-1 mb-6">
          {wizard_steps.map((s, index) => (
            <div key={s.id} className="flex items-center">
              <button
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                disabled={is_verifying}
                style={{
                  background:
                    step_statuses[index] === "verified"
                      ? "linear-gradient(to bottom, #22c55e, #16a34a)"
                      : step_statuses[index] === "failed"
                        ? "linear-gradient(to bottom, #f87171, #dc2626)"
                        : index === current_step
                          ? "linear-gradient(to bottom, #4a7aff, #2d5ae0)"
                          : "var(--bg-tertiary)",
                  color:
                    step_statuses[index] === "verified" ||
                    step_statuses[index] === "failed" ||
                    index === current_step
                      ? "white"
                      : "var(--text-muted)",
                  boxShadow:
                    index === current_step &&
                    step_statuses[index] !== "verified" &&
                    step_statuses[index] !== "failed"
                      ? "0 2px 8px rgba(74, 122, 255, 0.35)"
                      : step_statuses[index] === "verified"
                        ? "0 2px 8px rgba(22, 163, 74, 0.3)"
                        : "none",
                  opacity: is_verifying ? 0.6 : 1,
                  cursor: is_verifying ? "default" : "pointer",
                }}
                onClick={() => !is_verifying && set_current_step(index)}
              >
                {step_statuses[index] === "verified" ? (
                  <CheckIcon className="w-4 h-4" />
                ) : step_statuses[index] === "failed" ? (
                  <XCircleIcon className="w-4 h-4" />
                ) : step_statuses[index] === "checking" ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  index + 1
                )}
              </button>
              {index < wizard_steps.length - 1 && (
                <div
                  className="w-6 h-0.5 mx-0.5 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor:
                      step_statuses[index] === "verified"
                        ? "#22c55e"
                        : "var(--bg-tertiary)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current_step}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            initial={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded"
                  style={{
                    background: "linear-gradient(to bottom, #4a7aff, #2d5ae0)",
                    color: "white",
                  }}
                >
                  {t("common.step_x_of_y", {
                    current: current_step + 1,
                    total: wizard_steps.length,
                  })}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-surf-tertiary text-txt-muted">
                  {step.subtitle}
                </span>
                {step_status === "verified" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-500/10 text-green-600">
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

            <div className="p-3 rounded-lg mb-4 bg-surf-tertiary border border-edge-secondary">
              <ol className="space-y-1.5">
                {step.instructions.map((instruction, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium mt-0.5 bg-surf-secondary text-txt-muted">
                      {i + 1}
                    </span>
                    <span className="text-sm text-txt-secondary">
                      {instruction}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-2 mb-4">
              {step_records.map((record, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-surf-secondary"
                  style={{
                    border: `1px solid ${step_status === "verified" ? "#16a34a" : "var(--border-secondary)"}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-surf-tertiary text-txt-secondary">
                      {record.record_type}
                    </span>
                    {record.priority != null && (
                      <span className="text-xs text-txt-muted">
                        {t("common.priority")}: {record.priority}
                      </span>
                    )}
                  </div>
                  <div className="mb-2">
                    <label className="text-xs block mb-1 text-txt-muted">
                      {t("common.host_name")}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded text-xs font-mono break-all bg-surf-tertiary text-txt-primary">
                        {record.host}
                      </code>
                      <Button
                        className="h-7 w-7 flex-shrink-0"
                        size="icon"
                        variant="ghost"
                        onClick={() => copy_to_clipboard(record.host)}
                      >
                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs block mb-1 text-txt-muted">
                      {t("common.value")}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded text-xs font-mono break-all bg-surf-tertiary text-txt-primary">
                        {record.value}
                      </code>
                      <Button
                        className="h-7 w-7 flex-shrink-0"
                        size="icon"
                        variant="ghost"
                        onClick={() => copy_to_clipboard(record.value)}
                      >
                        <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {verification_message && (
              <div
                className="flex items-start gap-2 p-3 rounded-lg text-sm mb-2"
                style={{
                  backgroundColor: all_verified
                    ? "rgba(22, 163, 74, 0.1)"
                    : "var(--bg-tertiary)",
                  border: `1px solid ${all_verified ? "#16a34a" : "var(--border-secondary)"}`,
                }}
              >
                {all_verified ? (
                  <CheckCircleIcon className="w-5 h-5 flex-shrink-0 text-green-500 mt-0.5" />
                ) : any_checked ? (
                  <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-yellow-500 mt-0.5" />
                ) : null}
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
          </motion.div>
        </AnimatePresence>
      </ModalBody>

      <ModalFooter>
        <div className="flex items-center justify-between w-full">
          <Button
            disabled={current_step === 0 || is_verifying}
            variant="ghost"
            onClick={() => set_current_step((s) => s - 1)}
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            {t("common.previous")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              disabled={is_verifying}
              variant="outline"
              onClick={run_verification}
            >
              {is_verifying ? (
                <ArrowPathIcon className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <ArrowPathIcon className="w-4 h-4 mr-1" />
              )}
              {is_verifying ? t("common.checking") : t("common.verify")}
            </Button>
            {current_step < wizard_steps.length - 1 ? (
              <Button
                disabled={is_verifying}
                variant="depth"
                onClick={() => set_current_step((s) => s + 1)}
              >
                {t("common.next")}
                <ArrowRightIcon className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button variant="depth" onClick={on_close}>
                {all_verified ? t("common.done") : t("common.close")}
              </Button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
