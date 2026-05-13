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
import type { ImportJob, ImportSource } from "@/services/api/email_import";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { InformationCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { FaMicrosoft, FaYahoo } from "react-icons/fa6";
import { SiGmail, SiIcloud, SiProtonmail } from "react-icons/si";

import { SettingsGroup, SettingsHeader } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  list_import_jobs,
  delete_import_job,
} from "@/services/api/email_import";
import { ImportModal } from "@/components/settings/import_modal";

export function ImportSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const [jobs, set_jobs] = useState<ImportJob[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [selected_provider, set_selected_provider] =
    useState<ImportSource | null>(null);

  const mobile_providers: {
    id: ImportSource;
    icon: ReactNode;
    label: string;
  }[] = [
    {
      id: "gmail",
      icon: <SiGmail className="w-5 h-5" color="#EA4335" />,
      label: t("settings.gmail_import"),
    },
    {
      id: "outlook",
      icon: <FaMicrosoft className="w-5 h-5" color="#0078D4" />,
      label: t("settings.outlook_import"),
    },
    {
      id: "yahoo",
      icon: <FaYahoo className="w-5 h-5" color="#6001D2" />,
      label: t("settings.yahoo_import"),
    },
    {
      id: "icloud",
      icon: <SiIcloud className="w-5 h-5 text-[var(--mobile-text-muted)]" />,
      label: t("settings.icloud_import"),
    },
    {
      id: "protonmail",
      icon: <SiProtonmail className="w-5 h-5" color="#6D4AFF" />,
      label: t("settings.protonmail_import"),
    },
  ];

  const load_jobs = useCallback(async () => {
    set_is_loading(true);
    try {
      const res = await list_import_jobs();

      if (res.data?.jobs) set_jobs(res.data.jobs);
    } catch {
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_jobs();
  }, [load_jobs]);

  const handle_import_close = useCallback(() => {
    set_selected_provider(null);
    load_jobs();
  }, [load_jobs]);

  const handle_delete_job = useCallback(async (id: string) => {
    await delete_import_job(id);
    set_jobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const status_color = (status: string) => {
    if (status === "completed") return "text-[var(--color-success,#22c55e)]";
    if (status === "failed") return "text-[var(--mobile-danger)]";
    if (status === "processing") return "text-[var(--mobile-accent)]";

    return "text-[var(--mobile-text-muted)]";
  };

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("common.import")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4 space-y-4">
          <p className="text-[14px] text-[var(--mobile-text-muted)]">
            {t("settings.import_emails_description")}
          </p>

          <div className="space-y-3">
            {mobile_providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-[var(--mobile-bg-card)] border-[var(--mobile-border)]"
              >
                <div className="flex-shrink-0">{provider.icon}</div>
                <span className="flex-1 text-[14px] font-medium text-[var(--mobile-text-primary)]">
                  {provider.label}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="md"
                    variant="outline"
                    onClick={() => set_selected_provider(provider.id)}
                  >
                    {t("settings.import_manual_button")}
                  </Button>
                  <Button
                    disabled
                    size="md"
                    title={t("settings.import_oauth_coming_soon")}
                    variant="depth"
                  >
                    {t("settings.import_oauth_button")}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border p-3 space-y-3 bg-[var(--mobile-bg-card)] border-[var(--mobile-border)]">
            <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--mobile-text-primary)]">
              <InformationCircleIcon className="w-4 h-4 text-[var(--mobile-text-muted)] flex-shrink-0" />
              {t("settings.import_how_it_works")}
            </h4>

            <div className="space-y-1">
              <p className="text-[12px] font-medium text-[var(--mobile-text-secondary)]">
                {t("settings.import_oauth_title")}
              </p>
              <p className="text-[12px] text-[var(--mobile-text-muted)] leading-relaxed">
                {t("settings.import_oauth_description")}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-[var(--mobile-text-secondary)]">
                {t("settings.import_manual_title")}
              </p>
              <ol className="list-none space-y-1 text-[12px] text-[var(--mobile-text-muted)] leading-relaxed">
                <li className="flex gap-2">
                  <span className="font-medium text-[var(--mobile-text-secondary)] flex-shrink-0">
                    1.
                  </span>
                  {t("settings.import_manual_step_1")}
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-[var(--mobile-text-secondary)] flex-shrink-0">
                    2.
                  </span>
                  {t("settings.import_manual_step_2")}
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-[var(--mobile-text-secondary)] flex-shrink-0">
                    3.
                  </span>
                  {t("settings.import_manual_step_3")}
                </li>
                <li className="flex gap-2">
                  <span className="font-medium text-[var(--mobile-text-secondary)] flex-shrink-0">
                    4.
                  </span>
                  {t("settings.import_manual_step_4")}
                </li>
              </ol>
            </div>
          </div>
        </div>

        {is_loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : (
          jobs.length > 0 && (
            <SettingsGroup title={t("settings.recent_imports")}>
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-[var(--mobile-text-primary)] capitalize">
                      {job.source}
                    </p>
                    <p className="text-[12px] text-[var(--mobile-text-muted)]">
                      {job.processed_emails}/{job.total_emails}{" "}
                      {t("settings.emails_count", { count: job.total_emails })}
                    </p>
                  </div>
                  <span
                    className={`text-[12px] font-medium capitalize ${status_color(job.status)}`}
                  >
                    {t(`settings.import_status_${job.status}` as any)}
                  </span>
                  {(job.status === "completed" || job.status === "failed") && (
                    <button
                      type="button"
                      onClick={() => handle_delete_job(job.id)}
                    >
                      <TrashIcon className="h-4 w-4 text-[var(--mobile-text-muted)]" />
                    </button>
                  )}
                </div>
              ))}
            </SettingsGroup>
          )
        )}
      </div>
      {selected_provider && (
        <ImportModal
          is_open={true}
          on_close={handle_import_close}
          provider={selected_provider}
        />
      )}
    </div>
  );
}
