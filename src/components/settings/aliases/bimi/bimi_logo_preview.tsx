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
import { use_i18n } from "@/lib/i18n/context";
import { format_time } from "@/utils/date_format";

interface BimiLogoPreviewProps {
  preview_png: string;
  domain_name: string;
}

interface InboxPanelProps {
  src: string;
  label: string;
  domain_name: string;
  subject: string;
  time: string;
  dark: boolean;
}

function InboxPanel({
  src,
  label,
  domain_name,
  subject,
  time,
  dark,
}: InboxPanelProps) {
  const surface = dark
    ? "bg-[#121212] border-[#2a2a2a]"
    : "bg-white border-[#e5e7eb]";
  const divider = dark ? "border-[#242424]" : "border-[#f0f1f3]";
  const strong = dark ? "text-[#f5f5f5]" : "text-[#111827]";
  const muted = dark ? "text-[#a3a3a3]" : "text-[#6b7280]";
  const placeholder = dark ? "bg-[#2a2a2a]" : "bg-[#eceef1]";

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-xs text-txt-muted">{label}</p>
      <div className={`overflow-hidden rounded-lg border ${surface}`}>
        <div
          className={`flex items-center gap-2.5 border-b px-3 py-2.5 ${divider}`}
        >
          <img
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
            draggable={false}
            src={src}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className={`truncate text-[13px] font-semibold ${strong}`}>
                {domain_name}
              </p>
              <span className={`flex-shrink-0 text-[11px] ${muted}`}>
                {time}
              </span>
            </div>
            <p className={`truncate text-xs ${muted}`}>{subject}</p>
          </div>
        </div>
        {[0, 1].map((row) => (
          <div
            key={row}
            className={`flex items-center gap-2.5 px-3 py-2.5 ${row === 0 ? `border-b ${divider}` : ""}`}
          >
            <span
              className={`h-8 w-8 flex-shrink-0 rounded-full ${placeholder}`}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <span
                className={`block h-2 rounded ${placeholder} ${row === 0 ? "w-2/5" : "w-1/3"}`}
              />
              <span
                className={`block h-2 rounded ${placeholder} ${row === 0 ? "w-4/5" : "w-3/5"}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BimiLogoPreview({
  preview_png,
  domain_name,
}: BimiLogoPreviewProps) {
  const { t } = use_i18n();
  const src = `data:image/png;base64,${preview_png}`;
  const subject = t("settings.bimi_preview_inbox_subject");
  const time = format_time(new Date());

  return (
    <section>
      <h3 className="text-sm font-medium text-txt-primary">
        {t("settings.bimi_preview_inbox_title")}
      </h3>
      <img alt={t("settings.bimi_preview_alt")} className="sr-only" src={src} />
      <div aria-hidden="true" className="mt-2 flex flex-col gap-3 sm:flex-row">
        <InboxPanel
          dark={false}
          domain_name={domain_name}
          label={t("settings.bimi_preview_light")}
          src={src}
          subject={subject}
          time={time}
        />
        <InboxPanel
          dark
          domain_name={domain_name}
          label={t("settings.bimi_preview_dark")}
          src={src}
          subject={subject}
          time={time}
        />
      </div>
    </section>
  );
}
