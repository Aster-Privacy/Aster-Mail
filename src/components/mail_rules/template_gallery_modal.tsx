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
import * as React from "react";
import {
  FolderIcon,
  SparklesIcon,
  StarIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import {
  RULE_TEMPLATES,
  RULE_TEMPLATE_CATEGORIES,
  type RuleTemplate,
  type RuleTemplateCategory,
} from "@/components/mail_rules/rule_templates";

const CATEGORY_ICON: Record<
  RuleTemplateCategory,
  React.ComponentType<{ className?: string }>
> = {
  organize: FolderIcon,
  cleanup: SparklesIcon,
  priority: StarIcon,
  security: ShieldCheckIcon,
};

const CATEGORY_LABEL_KEY: Record<
  RuleTemplateCategory,
  "mail_rules.templates_category_organize"
> = {
  organize: "mail_rules.templates_category_organize",
  cleanup:
    "mail_rules.templates_category_cleanup" as "mail_rules.templates_category_organize",
  priority:
    "mail_rules.templates_category_priority" as "mail_rules.templates_category_organize",
  security:
    "mail_rules.templates_category_security" as "mail_rules.templates_category_organize",
};

interface TemplateGalleryModalProps {
  is_open: boolean;
  on_close: () => void;
  on_select: (template: RuleTemplate) => void;
}

export function TemplateGalleryModal({
  is_open,
  on_close,
  on_select,
}: TemplateGalleryModalProps) {
  const { t } = use_i18n();
  const [query, set_query] = React.useState("");

  React.useEffect(() => {
    if (is_open) set_query("");
  }, [is_open]);

  const normalized = query.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    if (!normalized) return RULE_TEMPLATES;
    return RULE_TEMPLATES.filter((tpl) => {
      const name = t(tpl.name_key).toLowerCase();
      const desc = t(tpl.description_key).toLowerCase();
      return name.includes(normalized) || desc.includes(normalized);
    });
  }, [normalized, t]);

  return (
    <Modal is_open={is_open} on_close={on_close} size="2xl">
      <ModalHeader>
        <ModalTitle>{t("mail_rules.templates_title")}</ModalTitle>
        <ModalDescription>
          {t("mail_rules.templates_subtitle")}
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="space-y-5">
        <Input
          value={query}
          size="md"
          placeholder={t("mail_rules.templates_search_placeholder")}
          onChange={(e) => set_query(e.target.value)}
        />

        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-txt-muted">
            {t("mail_rules.templates_empty")}
          </div>
        )}

        {RULE_TEMPLATE_CATEGORIES.map((category) => {
          const items = filtered.filter((tpl) => tpl.category === category);
          if (items.length === 0) return null;
          const CategoryIcon = CATEGORY_ICON[category];
          return (
            <div key={category}>
              <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary">
                <CategoryIcon className="w-3.5 h-3.5" />
                {t(CATEGORY_LABEL_KEY[category])}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => on_select(tpl)}
                    className="group text-left rounded-xl border border-neutral-200 dark:border-neutral-700 bg-surf-primary p-3 transition-colors hover:bg-surf-secondary hover:border-neutral-300 dark:hover:border-neutral-600 cursor-pointer"
                  >
                    <div className="text-[13px] font-medium text-txt-primary mb-0.5">
                      {t(tpl.name_key)}
                    </div>
                    <p className="text-xs text-txt-muted leading-snug">
                      {t(tpl.description_key)}
                    </p>
                    {tpl.needs_config && (
                      <span className="inline-block mt-2 text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
                        {t("mail_rules.templates_customize")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          {t("mail_rules.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
