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
"use client";

import type { ComponentProps } from "react";

import { MotionModal, MotionModalBody, type MotionModalProps } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type ModalProps = Omit<MotionModalProps, "reduce_motion" | "close_label">;

export function Modal(props: ModalProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();

  return (
    <MotionModal
      close_label={t("common.close")}
      reduce_motion={reduce_motion}
      {...props}
    />
  );
}

export function ModalBody({
  className,
  ...props
}: ComponentProps<typeof MotionModalBody>) {
  return <MotionModalBody className={cn("px-6", className)} {...props} />;
}

export {
  MotionModalHeader as ModalHeader,
  MotionModalTitle as ModalTitle,
  MotionModalDescription as ModalDescription,
  MotionModalFooter as ModalFooter,
} from "@aster/ui";
export type { ModalProps };
