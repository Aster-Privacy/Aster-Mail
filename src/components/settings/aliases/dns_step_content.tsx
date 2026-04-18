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
import type { StepStatus } from "./dns_checklist";

import { use_i18n } from "@/lib/i18n/context";
import { EmailTag } from "@/components/ui/email_tag";
import { DnsRecordCard } from "./dns_record_card";
import type { DnsRecord } from "@/services/api/domains";

interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  instructions: string[];
}

interface DnsStepContentProps {
  step: WizardStep;
  step_index: number;
  total_steps: number;
  records: DnsRecord[];
  status: StepStatus;
  provider: DnsProvider | null;
}

const PROVIDER_INSTRUCTIONS: Record<
  string,
  Record<string, TranslationKey[]>
> = {
  cloudflare: {
    verification: [
      "settings.provider_cf_login",
      "settings.provider_cf_select_domain",
      "settings.provider_cf_add_record",
      "settings.provider_cf_save",
    ],
    mx: [
      "settings.provider_cf_login",
      "settings.provider_cf_select_domain",
      "settings.provider_cf_add_mx",
      "settings.provider_cf_save",
    ],
    spf: [
      "settings.provider_cf_login",
      "settings.provider_cf_select_domain",
      "settings.provider_cf_add_txt_record",
      "settings.provider_cf_save",
    ],
    dkim: [
      "settings.provider_cf_login",
      "settings.provider_cf_select_domain",
      "settings.provider_cf_add_txt_record",
      "settings.provider_cf_save",
    ],
    dmarc: [
      "settings.provider_cf_login",
      "settings.provider_cf_select_domain",
      "settings.provider_cf_add_txt_record",
      "settings.provider_cf_save",
    ],
  },
  godaddy: {
    verification: [
      "settings.provider_gd_login",
      "settings.provider_gd_manage_dns",
      "settings.provider_gd_add_record",
      "settings.provider_gd_save",
    ],
    mx: [
      "settings.provider_gd_login",
      "settings.provider_gd_manage_dns",
      "settings.provider_gd_add_mx",
      "settings.provider_gd_save",
    ],
    spf: [
      "settings.provider_gd_login",
      "settings.provider_gd_manage_dns",
      "settings.provider_gd_add_txt",
      "settings.provider_gd_save",
    ],
    dkim: [
      "settings.provider_gd_login",
      "settings.provider_gd_manage_dns",
      "settings.provider_gd_add_txt",
      "settings.provider_gd_save",
    ],
    dmarc: [
      "settings.provider_gd_login",
      "settings.provider_gd_manage_dns",
      "settings.provider_gd_add_txt",
      "settings.provider_gd_save",
    ],
  },
  namecheap: {
    verification: [
      "settings.provider_nc_login",
      "settings.provider_nc_advanced_dns",
      "settings.provider_nc_add_record",
      "settings.provider_nc_save",
    ],
    mx: [
      "settings.provider_nc_login",
      "settings.provider_nc_advanced_dns",
      "settings.provider_nc_add_mx",
      "settings.provider_nc_save",
    ],
    spf: [
      "settings.provider_nc_login",
      "settings.provider_nc_advanced_dns",
      "settings.provider_nc_add_txt",
      "settings.provider_nc_save",
    ],
    dkim: [
      "settings.provider_nc_login",
      "settings.provider_nc_advanced_dns",
      "settings.provider_nc_add_txt",
      "settings.provider_nc_save",
    ],
    dmarc: [
      "settings.provider_nc_login",
      "settings.provider_nc_advanced_dns",
      "settings.provider_nc_add_txt",
      "settings.provider_nc_save",
    ],
  },
};

function get_provider_instructions(
  provider_key: string,
  step_id: string,
): TranslationKey[] | null {
  return PROVIDER_INSTRUCTIONS[provider_key]?.[step_id] ?? null;
}

const STEP_ERROR_TIPS: Record<string, TranslationKey> = {
  verification: "settings.error_tip_txt",
  mx: "settings.error_tip_mx",
  spf: "settings.error_tip_spf",
  dkim: "settings.error_tip_dkim",
  dmarc: "settings.error_tip_dmarc",
};

export function DnsStepContent({
  step,
  step_index,
  total_steps,
  records,
  status,
  provider,
}: DnsStepContentProps) {
  const { t } = use_i18n();

  const provider_instructions = provider
    ? get_provider_instructions(provider.instructions_key, step.id)
    : null;

  const instructions = provider_instructions
    ? provider_instructions.map((key) => t(key))
    : step.instructions;

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              background: "linear-gradient(to bottom, #4a7aff, #2d5ae0)",
              color: "white",
            }}
          >
            {t("common.step_x_of_y", {
              current: step_index + 1,
              total: total_steps,
            })}
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-surf-tertiary text-txt-muted">
            {step.subtitle}
          </span>
          {status === "verified" && (
            <EmailTag
              icon="check"
              label={t("common.verified")}
              size="sm"
              variant="green"
            />
          )}
          {status === "failed" && (
            <EmailTag
              icon="warning"
              label={t("common.not_detected")}
              size="sm"
              variant="red"
            />
          )}
        </div>
        <h4 className="text-base font-semibold text-txt-primary">
          {step.title}
        </h4>
        <p className="text-sm mt-1 text-txt-muted">{step.description}</p>
      </div>

      <div className="p-3 rounded-lg mb-4 bg-surf-tertiary border border-edge-secondary">
        {provider && (
          <p className="text-xs font-medium mb-2 text-txt-secondary">
            {t("settings.instructions_for_provider", { provider: provider.name })}
          </p>
        )}
        <ol className="space-y-1.5">
          {instructions.map((instruction, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium mt-0.5 bg-surf-secondary text-txt-muted">
                {i + 1}
              </span>
              <span className="text-sm text-txt-secondary">{instruction}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2 mb-4">
        {records.map((record, index) => (
          <DnsRecordCard key={index} record={record} />
        ))}
      </div>

      {status === "failed" && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-red-600">
          <div>
            <p className="font-medium text-white">
              {t("settings.record_not_detected")}
            </p>
            {STEP_ERROR_TIPS[step.id] && (
              <p className="mt-1 text-xs text-red-100">
                {t(STEP_ERROR_TIPS[step.id])}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
