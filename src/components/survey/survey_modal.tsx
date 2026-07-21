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
import { useMemo, useState } from "react";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio_group";
import { use_i18n } from "@/lib/i18n/context";
import { submit_survey } from "@/services/api/survey";
import { show_toast } from "@/components/toast/simple_toast";

interface SurveyModalProps {
  is_open: boolean;
  on_close: () => void;
  on_submitted: () => void;
  branch: "paid" | "free";
  plan_code: string | null;
}

interface ChoiceQuestion {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface OpenQuestion {
  key: string;
  label: string;
}

const MAX_TEXT_CHARS = 2000;

export function SurveyModal({
  is_open,
  on_close,
  on_submitted,
  branch,
  plan_code,
}: SurveyModalProps) {
  const { t } = use_i18n();
  const [answers, set_answers] = useState<Record<string, string>>({});
  const [is_submitting, set_is_submitting] = useState(false);
  const [show_errors, set_show_errors] = useState(false);

  const plan_name = plan_code
    ? plan_code.charAt(0).toUpperCase() + plan_code.slice(1)
    : "";

  const choice_questions: ChoiceQuestion[] = useMemo(() => {
    if (branch === "paid") {
      return [
        {
          key: "upgrade_trigger",
          label: t("survey.q_upgrade_trigger"),
          options: [
            { value: "storage", label: t("survey.trigger_storage") },
            { value: "feature", label: t("survey.trigger_feature") },
            {
              value: "support_mission",
              label: t("survey.trigger_support_mission"),
            },
            {
              value: "switched_fully",
              label: t("survey.trigger_switched_fully"),
            },
            { value: "other", label: t("survey.option_other") },
          ],
        },
        {
          key: "hesitation",
          label: t("survey.q_hesitation"),
          options: [
            { value: "price", label: t("survey.hesitation_price") },
            { value: "trust", label: t("survey.hesitation_trust") },
            {
              value: "missing_feature",
              label: t("survey.hesitation_missing_feature"),
            },
            { value: "longevity", label: t("survey.hesitation_longevity") },
            { value: "none", label: t("survey.hesitation_none") },
            { value: "other", label: t("survey.option_other") },
          ],
        },
      ];
    }

    return [
      {
        key: "source",
        label: t("survey.q_source"),
        options: [
          { value: "reddit", label: t("survey.source_reddit") },
          { value: "youtube", label: t("survey.source_youtube") },
          { value: "friend", label: t("survey.source_friend") },
          { value: "twitter", label: t("survey.source_twitter") },
          {
            value: "privacy_directory",
            label: t("survey.source_privacy_directory"),
          },
          { value: "search_engine", label: t("survey.source_search_engine") },
          { value: "other", label: t("survey.option_other") },
        ],
      },
      {
        key: "signup_reason",
        label: t("survey.q_signup_reason"),
        options: [
          { value: "e2ee", label: t("survey.signup_e2ee") },
          {
            value: "leave_big_tech",
            label: t("survey.signup_leave_big_tech"),
          },
          { value: "open_source", label: t("survey.signup_open_source") },
          {
            value: "specific_feature",
            label: t("survey.signup_specific_feature"),
          },
          { value: "price", label: t("survey.signup_price") },
          { value: "curiosity", label: t("survey.signup_curiosity") },
          { value: "other", label: t("survey.option_other") },
        ],
      },
      {
        key: "stood_out",
        label: t("survey.q_stood_out"),
        options: [
          { value: "openpgp", label: t("survey.stood_openpgp") },
          { value: "post_quantum", label: t("survey.stood_post_quantum") },
          { value: "open_source", label: t("survey.stood_open_source") },
          { value: "germany", label: t("survey.stood_germany") },
          { value: "price", label: t("survey.stood_price") },
          { value: "ui", label: t("survey.stood_ui") },
          { value: "other", label: t("survey.option_other") },
        ],
      },
    ];
  }, [branch, t]);

  const open_questions: OpenQuestion[] = useMemo(() => {
    if (branch === "paid") {
      return [
        {
          key: "plan_reason",
          label: t("survey.q_plan_reason", { plan: plan_name }),
        },
        { key: "cancel_reason", label: t("survey.q_cancel_reason") },
      ];
    }

    return [{ key: "upgrade_blocker", label: t("survey.q_upgrade_blocker") }];
  }, [branch, plan_name, t]);

  const set_answer = (key: string, value: string) => {
    set_answers((prev) => ({ ...prev, [key]: value }));
  };

  const question_is_incomplete = (question: ChoiceQuestion) => {
    const value = answers[question.key];

    if (!value) return true;

    if (value === "other") {
      return !(answers[`${question.key}_other`] || "").trim();
    }

    return false;
  };

  const has_missing_answers = choice_questions.some(question_is_incomplete);

  const handle_submit = async () => {
    if (has_missing_answers) {
      set_show_errors(true);

      return;
    }

    set_is_submitting(true);

    const payload: Record<string, string> = {};

    for (const [key, value] of Object.entries(answers)) {
      const trimmed = value.trim();

      if (trimmed) payload[key] = trimmed.slice(0, MAX_TEXT_CHARS);
    }

    const response = await submit_survey(payload);

    set_is_submitting(false);

    if (response.error) {
      show_toast(t("survey.submit_failed"), "error");

      return;
    }

    show_toast(t("survey.submitted_thanks"), "success", 6000);
    on_submitted();
  };

  const render_other_input = (question_key: string) => (
    <input
      className="mt-2 w-full px-3 py-2 text-sm rounded-lg border bg-transparent focus:outline-none"
      maxLength={MAX_TEXT_CHARS}
      placeholder={t("survey.other_placeholder")}
      style={{
        borderColor: "var(--border-primary)",
        color: "var(--text-primary)",
      }}
      type="text"
      value={answers[`${question_key}_other`] || ""}
      onChange={(e) => set_answer(`${question_key}_other`, e.target.value)}
    />
  );

  return (
    <Modal is_open={is_open} size="lg" on_close={on_close}>
      <ModalHeader>
        <ModalTitle>{t("survey.modal_title")}</ModalTitle>
        <ModalDescription>{t("survey.modal_subtitle")}</ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-6">
        {choice_questions.map((question) => (
          <div key={question.key}>
            <p
              className="text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {question.label}
            </p>
            <RadioGroup
              className="flex-col gap-2"
              value={answers[question.key] || ""}
              onValueChange={(value) => set_answer(question.key, value)}
            >
              {question.options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <RadioGroupItem value={option.value} />
                  <span
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {answers[question.key] === "other" &&
              render_other_input(question.key)}
            {show_errors && question_is_incomplete(question) && (
              <p className="mt-1.5 text-xs text-red-500">
                {t("survey.required_error")}
              </p>
            )}
          </div>
        ))}
        {open_questions.map((question) => (
          <div key={question.key}>
            <p
              className="text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {question.label}{" "}
              <span
                className="font-normal text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                ({t("survey.optional_label")})
              </span>
            </p>
            <textarea
              className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent resize-none focus:outline-none"
              maxLength={MAX_TEXT_CHARS}
              placeholder={t("survey.open_placeholder")}
              rows={3}
              style={{
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
              }}
              value={answers[question.key] || ""}
              onChange={(e) => set_answer(question.key, e.target.value)}
            />
          </div>
        ))}
      </ModalBody>
      <ModalFooter>
        <button
          className="aster_btn aster_btn_outline aster_btn_md"
          disabled={is_submitting}
          type="button"
          onClick={on_close}
        >
          {t("common.cancel")}
        </button>
        <button
          className="aster_btn aster_btn_primary aster_btn_md"
          disabled={is_submitting}
          type="button"
          onClick={handle_submit}
        >
          {t("survey.submit")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
