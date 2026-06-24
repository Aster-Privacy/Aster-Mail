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
import { is_native_platform } from "@/native/capacitor_bridge";
import { trigger_download } from "@/services/export/destination";
import type { TranslationKey } from "@/lib/i18n/types";

type Translator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export async function generate_recovery_pdf(
  email: string,
  recovery_codes: string[],
  t: Translator,
): Promise<void> {
  if (is_native_platform()) {
    const content = build_recovery_text(email, recovery_codes, t);
    const { Share } = await import("@capacitor/share");

    await Share.share({
      title: t("common.save_recovery_codes_title"),
      text: content,
      dialogTitle: t("common.save_recovery_codes_dialog"),
    });

    return;
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const page_width = doc.internal.pageSize.getWidth();

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(t("common.recovery_pdf_title"), page_width / 2, 25, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(t("common.recovery_pdf_keep_safe"), page_width / 2, 35, {
    align: "center",
  });

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(20, 45, page_width - 20, 45);

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`${t("common.recovery_pdf_account")} ${email}`, 20, 58);
  doc.text(
    `${t("common.recovery_pdf_generated")} ${new Date().toLocaleString()}`,
    20,
    65,
  );

  doc.setDrawColor(220, 220, 220);
  doc.line(20, 73, page_width - 20, 73);

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text(t("common.recovery_pdf_important_warning"), 20, 86);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9.5);
  const warning_text = [
    `• ${t("common.recovery_pdf_code_used_once")}`,
    `• ${t("common.recovery_pdf_store_secure")}`,
    `• ${t("common.recovery_pdf_no_digital")}`,
    `• ${t("common.recovery_pdf_unrecoverable")}`,
  ];

  warning_text.forEach((line, index) => {
    doc.text(line, 20, 96 + index * 7);
  });

  doc.setDrawColor(220, 220, 220);
  doc.line(20, 125, page_width - 20, 125);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(t("common.recovery_pdf_your_codes"), 20, 138);

  doc.setFontSize(14);
  doc.setFont("courier", "bold");
  doc.setTextColor(0, 0, 0);
  recovery_codes.forEach((code, index) => {
    const y_pos = 155 + index * 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`${index + 1}.`, 20, y_pos);

    doc.setFont("courier", "bold");
    doc.setFontSize(13);
    doc.text(code, 30, y_pos);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`[ ] ${t("common.recovery_pdf_used")}`, page_width - 40, y_pos);
    doc.setTextColor(0, 0, 0);
  });

  doc.setDrawColor(220, 220, 220);
  doc.line(20, 245, page_width - 20, 245);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(t("common.recovery_pdf_footer"), page_width / 2, 256, {
    align: "center",
  });
  doc.text("https://astermail.org", page_width / 2, 263, { align: "center" });

  const blob = doc.output("blob");

  trigger_download(blob, `astermail-recovery-codes-${Date.now()}.pdf`);
}

function build_recovery_text(
  email: string,
  recovery_codes: string[],
  t: Translator,
): string {
  const codes = recovery_codes
    .map((code, i) => `  ${i + 1}. ${code}`)
    .join("\n");
  const used_lines = recovery_codes
    .map((_, i) => `[ ] ${t("common.recovery_text_code_used_on", { number: i + 1 })}`)
    .join("\n");

  return `
${t("common.recovery_text_title")}
${t("common.recovery_text_keep_safe")}

${t("common.recovery_pdf_account")} ${email}
${t("common.recovery_pdf_generated")} ${new Date().toISOString()}

${t("common.recovery_pdf_important_warning")}

• ${t("common.recovery_pdf_code_used_once")}
• ${t("common.recovery_text_store_secure")}
• ${t("common.recovery_text_no_share")}
• ${t("common.recovery_text_unrecoverable")}

${t("common.recovery_text_your_codes")}

${codes}

${t("common.recovery_text_mark_used")}
${used_lines}

${t("common.recovery_pdf_footer")}
`.trim();
}

export async function download_recovery_text(
  email: string,
  recovery_codes: string[],
  t: Translator,
): Promise<void> {
  const content = build_recovery_text(email, recovery_codes, t);

  if (is_native_platform()) {
    const { Share } = await import("@capacitor/share");

    await Share.share({
      title: t("common.save_recovery_codes_title"),
      text: content,
      dialogTitle: t("common.save_recovery_codes_dialog"),
    });

    return;
  }

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `astermail-recovery-codes-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
