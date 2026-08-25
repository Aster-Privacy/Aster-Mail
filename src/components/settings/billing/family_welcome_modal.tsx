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
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserGroupIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  ArrowRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

import { Modal } from "@/components/ui/modal";
import { format_bytes } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";
import { use_translation } from "@/lib/i18n/context";

interface FamilyWelcomeModalProps {
  is_open: boolean;
  on_close: () => void;
  plan_name: string;
  max_members: number;
  storage_pool_bytes: number;
  on_go_to_family: () => void;
}

const STEPS = [
  {
    icon: UserGroupIcon,
    title: "settings.fam_welcome_step1_title",
    description: "settings.fam_welcome_step1_desc",
    points: [
      "settings.fam_welcome_step1_point1",
      "settings.fam_welcome_step1_point2",
      "settings.fam_welcome_step1_point3",
    ],
  },
  {
    icon: CircleStackIcon,
    title: "settings.fam_welcome_step2_title",
    description: "settings.fam_welcome_step2_desc",
    points: [
      "settings.fam_welcome_step2_point1",
      "settings.fam_welcome_step2_point2",
      "settings.fam_welcome_step2_point3",
    ],
  },
  {
    icon: ShieldCheckIcon,
    title: "settings.fam_welcome_step3_title",
    description: "settings.fam_welcome_step3_desc",
    points: [
      "settings.fam_welcome_step3_point1",
      "settings.fam_welcome_step3_point2",
      "settings.fam_welcome_step3_point3",
    ],
  },
] as const;

export function FamilyWelcomeModal({
  is_open,
  on_close,
  plan_name,
  max_members,
  storage_pool_bytes,
  on_go_to_family,
}: FamilyWelcomeModalProps) {
  const [step, set_step] = useState(0);
  const [dir, set_dir] = useState(1);
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_translation();
  const current = STEPS[step];
  const Icon = current.icon;
  const is_last = step === STEPS.length - 1;

  const handle_close = () => {
    set_step(0);
    on_close();
  };

  const go = (next: number) => {
    set_dir(next > step ? 1 : -1);
    set_step(next);
  };

  const handle_next = () => {
    if (is_last) {
      handle_close();
      on_go_to_family();
    } else go(step + 1);
  };

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce_motion ? 0 : d * 20 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce_motion ? 0 : d * -20 }),
  };

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={handle_close}
      show_close_button={false}
      size="lg"
    >
      <div className="relative flex flex-col overflow-hidden">
        <button
          className="absolute end-4 top-4 z-20 w-7 h-7 flex items-center justify-center rounded-[14px] transition-colors hover:bg-black/5 dark:hover:bg-white/10 text-txt-secondary"
          onClick={handle_close}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>

        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={step}
            animate="center"
            className="px-8 pt-8 pb-6"
            custom={dir}
            exit="exit"
            initial="enter"
            transition={{
              duration: reduce_motion ? 0 : 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
            variants={variants}
          >
            <div className="flex flex-col items-center gap-1 mb-6 w-full">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                {plan_name}
              </span>
              <span className="text-xs text-txt-muted">
                {t("settings.fam_welcome_summary", {
                  count: max_members,
                  storage: format_bytes(storage_pool_bytes),
                })}
              </span>
            </div>

            <div className="flex justify-center mb-5 w-full">
              <Icon className="w-12 h-12 text-accent-blue" strokeWidth={1.5} />
            </div>

            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-txt-primary mb-2">
                {t(current.title)}
              </h2>
              <p className="text-sm text-txt-muted leading-relaxed max-w-xs mx-auto">
                {t(current.description)}
              </p>
            </div>

            <ul className="space-y-3 bg-surf-secondary rounded-xl p-4 border border-edge-secondary">
              {current.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" />
                  <span className="text-sm text-txt-primary">{t(point)}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-center gap-2 pb-2">
          {STEPS.map((s, i) => (
            <button
              key={i}
              aria-label={t("settings.fam_welcome_step_aria", {
                number: i + 1,
                title: t(s.title),
              })}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? "w-6 h-2 bg-accent-blue"
                  : i < step
                    ? "w-1.5 h-2 bg-accent-blue opacity-40"
                    : "w-1.5 h-2 bg-edge-secondary"
              }`}
              onClick={() => go(i)}
            />
          ))}
        </div>

        <div className="px-6 pb-6 pt-3 flex items-center justify-between border-t border-edge-secondary mt-2">
          <button
            className="aster_btn aster_btn_ghost aster_btn_sm"
            onClick={handle_close}
          >
            {t("common.skip")}
          </button>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                className="aster_btn aster_btn_depth aster_btn_sm"
                onClick={() => go(step - 1)}
              >
                {t("common.back")}
              </button>
            )}
            <button
              className="aster_btn aster_btn_depth aster_btn_sm flex items-center gap-1.5"
              onClick={handle_next}
            >
              {is_last ? (
                <>
                  {t("settings.fam_welcome_setup")}
                  <ArrowRightIcon className="w-4 h-4 rtl:-scale-x-100" />
                </>
              ) : (
                t("common.next")
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
