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
import type { DnsProvider } from "@/data/dns_providers";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  add_domain,
  trigger_verification,
  validate_domain_name,
  type DnsRecord,
  type AddDomainResponse,
} from "@/services/api/domains";
import { detect_dns_provider } from "@/data/dns_providers";
import { DnsChecklist, type StepStatus, type ChecklistStep } from "./dns_checklist";
import { DnsStepContent } from "./dns_step_content";

function get_wizard_steps(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  return [
    {
      id: "verification",
      title: t("settings.domain_ownership_verification"),
      subtitle: t("settings.txt_record"),
      record_type: "TXT",
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
      record_type: "MX",
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
      record_type: "SPF",
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
      record_type: "DKIM",
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
      record_type: "DMARC",
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

interface DomainSetupWizardProps {
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

export function DomainSetupWizard({
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
}: DomainSetupWizardProps) {
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
  const [detected_provider, set_detected_provider] =
    useState<DnsProvider | null>(null);

  useEffect(() => {
    if (is_open && mode === "input") {
      set_domain_input("");
      set_error(null);
      set_detected_provider(null);
    }
    if (is_open) {
      set_current_step(0);
      set_step_statuses(wizard_steps.map(() => "pending"));
      set_verification_message(null);
    }
  }, [is_open, mode, wizard_steps]);

  useEffect(() => {
    if (mode === "dns" && domain_name && is_open) {
      detect_dns_provider(domain_name).then((provider) => {
        set_detected_provider(provider);
      });
    }
  }, [mode, domain_name, is_open]);

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

  const get_records_for_step = useCallback(
    (step_id: string): DnsRecord[] => {
      return dns_records.filter((r) => r.purpose === step_id);
    },
    [dns_records],
  );

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
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
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
  const is_last_step = current_step === wizard_steps.length - 1;
  const is_first_step = current_step === 0;

  if (mode === "input") {
    return (
      <Modal is_open={is_open} on_close={on_close} size="xl">
        <ModalHeader>
          <ModalTitle>
            {at_limit
              ? t("settings.domain_limit_reached")
              : t("settings.add_custom_domain")}
          </ModalTitle>
        </ModalHeader>

        <ModalBody>
          {at_limit ? (
            <div>
              <p className="text-sm text-txt-secondary mb-4">
                {t("settings.domain_limit_all_used", { count: max_domains })}
              </p>
              <p className="text-sm text-txt-muted">
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
                placeholder={t("settings.enter_domain_placeholder")}
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
              <p className="text-xs mt-2 text-txt-muted">
                {t("settings.domain_without_www_note")}
              </p>
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

  const checklist_steps: ChecklistStep[] = wizard_steps.map((s, i) => ({
    id: s.id,
    title: s.title,
    record_type: s.record_type,
    status: step_statuses[i],
  }));

  return (
    <Modal is_open={is_open} on_close={on_close} size="2xl">
      <ModalHeader>
        <ModalTitle>
          {t("settings.configure_dns_for", { domain: domain_name })}
        </ModalTitle>
      </ModalHeader>

      <ModalBody>
        <div>
          <p className="text-[13px] text-txt-muted mb-4">
            {t("settings.configure_dns_description")}
          </p>
          <div className="mb-4">
            <DnsChecklist
              active_step={current_step}
              disabled={is_verifying}
              layout="horizontal"
              steps={checklist_steps}
              on_step_click={set_current_step}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={current_step}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              initial={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <DnsStepContent
                provider={detected_provider}
                records={step_records}
                status={step_statuses[current_step]}
                step={step}
                step_index={current_step}
                total_steps={wizard_steps.length}
              />
            </motion.div>
          </AnimatePresence>

        </div>

        {verification_message && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-sm mt-4"
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
      </ModalBody>

      <ModalFooter className="flex-col items-stretch">
        <Button
          className="w-full"
          disabled={is_verifying}
          variant="depth"
          onClick={run_verification}
        >
          {is_verifying ? (
            <ArrowPathIcon className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <ArrowPathIcon className="w-4 h-4 mr-1.5" />
          )}
          {is_verifying
            ? t("common.checking")
            : t("settings.verify_all_records")}
        </Button>
        <div className="flex items-center justify-between w-full mt-2">
          <Button
            disabled={is_first_step || is_verifying}
            variant="outline"
            onClick={() => set_current_step((s) => s - 1)}
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            {t("common.previous")}
          </Button>
          <p className="text-xs text-txt-muted">
            {t("common.dns_propagation_note")}
          </p>
          <Button
            disabled={is_last_step || is_verifying}
            variant="outline"
            onClick={() => set_current_step((s) => s + 1)}
          >
            {t("common.next")}
            <ArrowRightIcon className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
