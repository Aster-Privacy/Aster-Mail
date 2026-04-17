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
import { jsPDF } from "jspdf";

import { is_native_platform } from "@/native/capacitor_bridge";

export async function generate_recovery_pdf(
  email: string,
  recovery_codes: string[],
): Promise<void> {
  if (is_native_platform()) {
    const content = build_recovery_text(email, recovery_codes);
    const { Share } = await import("@capacitor/share");

    await Share.share({
      title: "Aster Mail Recovery Codes",
      text: content,
      dialogTitle: "Save Recovery Codes",
    });

    return;
  }

  const doc = new jsPDF();
  const page_width = doc.internal.pageSize.getWidth();

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Aster Mail Recovery Codes", page_width / 2, 25, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("KEEP THIS DOCUMENT SAFE AND SECURE", page_width / 2, 35, {
    align: "center",
  });

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(20, 45, page_width - 20, 45);

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Account: ${email}`, 20, 58);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 65);

  doc.setDrawColor(220, 220, 220);
  doc.line(20, 73, page_width - 20, 73);

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("IMPORTANT WARNING", 20, 86);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9.5);
  const warning_text = [
    "• Each recovery code can only be used ONCE",
    "• Store this document in a secure location (safe, safety deposit box)",
    "• Do NOT store digitally or share with anyone",
    "• Without these codes, your account is UNRECOVERABLE if you forget your password",
  ];

  warning_text.forEach((line, index) => {
    doc.text(line, 20, 96 + index * 7);
  });

  doc.setDrawColor(220, 220, 220);
  doc.line(20, 125, page_width - 20, 125);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Your Recovery Codes", 20, 138);

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
    doc.text("[ ] Used", page_width - 40, y_pos);
    doc.setTextColor(0, 0, 0);
  });

  doc.setDrawColor(220, 220, 220);
  doc.line(20, 245, page_width - 20, 245);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Aster Mail - End-to-End Encrypted Email", page_width / 2, 256, {
    align: "center",
  });
  doc.text("https://astermail.org", page_width / 2, 263, { align: "center" });

  doc.save(`astermail-recovery-codes-${Date.now()}.pdf`);
}

function build_recovery_text(email: string, recovery_codes: string[]): string {
  return `
╔══════════════════════════════════════════════════════════════╗
║           ASTERMAIL RECOVERY CODES                            ║
║           KEEP THIS FILE SAFE AND SECURE                      ║
╚══════════════════════════════════════════════════════════════╝

Account: ${email}
Generated: ${new Date().toISOString()}

═══════════════════════════════════════════════════════════════

⚠️  IMPORTANT WARNING:

• Each recovery code can only be used ONCE
• Store this file in a secure location
• Do NOT share with anyone
• Without these codes, your account is UNRECOVERABLE
  if you forget your password

═══════════════════════════════════════════════════════════════

YOUR RECOVERY CODES:

${recovery_codes.map((code, i) => `  ${i + 1}. ${code}`).join("\n")}

═══════════════════════════════════════════════════════════════

Mark codes as used:
[ ] Code 1 used on: ____________
[ ] Code 2 used on: ____________
[ ] Code 3 used on: ____________
[ ] Code 4 used on: ____________
[ ] Code 5 used on: ____________

═══════════════════════════════════════════════════════════════
Aster Mail - End-to-End Encrypted Email
`.trim();
}

export async function download_recovery_text(
  email: string,
  recovery_codes: string[],
): Promise<void> {
  const content = build_recovery_text(email, recovery_codes);

  if (is_native_platform()) {
    const { Share } = await import("@capacitor/share");

    await Share.share({
      title: "Aster Mail Recovery Codes",
      text: content,
      dialogTitle: "Save Recovery Codes",
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
