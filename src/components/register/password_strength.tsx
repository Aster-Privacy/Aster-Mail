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

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  const { t } = use_i18n();

  const get_strength = () => {
    if (!password) return { level: 0, label: "", color: "", suggestions: [] };

    let score = 0;
    const suggestions: string[] = [];

    if (password.length >= 8) score++;
    else suggestions.push(t("auth.use_8_characters"));

    if (password.length >= 12) score++;
    else if (password.length >= 8)
      suggestions.push(t("auth.try_12_characters"));

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    else suggestions.push(t("auth.mix_case"));

    if (/[0-9]/.test(password)) score++;
    else suggestions.push(t("auth.add_numbers"));

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else if (score >= 2) suggestions.push(t("auth.add_special_characters"));

    if (score <= 1)
      return {
        level: 1,
        label: t("common.password_strength_weak"),
        color: "var(--color-danger)",
        suggestions,
      };
    if (score === 2)
      return {
        level: 2,
        label: t("common.password_strength_fair"),
        color: "var(--color-warning)",
        suggestions,
      };
    if (score === 3)
      return {
        level: 3,
        label: t("common.password_strength_strong"),
        color: "var(--color-success)",
        suggestions,
      };

    return {
      level: 4,
      label: t("common.password_strength_strong"),
      color: "var(--color-success)",
      suggestions: [],
    };
  };

  const strength = get_strength();

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i <= strength.level
                    ? strength.color
                    : "var(--border-secondary)",
              }}
            />
          ))}
        </div>
        <span className="text-xs" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      {strength.suggestions.length > 0 && strength.level < 3 && (
        <p
          className="text-xs mt-1.5 text-left"
          style={{ color: "var(--text-muted)" }}
        >
          {strength.suggestions[0]}
        </p>
      )}
    </div>
  );
}
