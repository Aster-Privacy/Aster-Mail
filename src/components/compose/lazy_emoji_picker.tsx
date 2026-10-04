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
import type { ComponentProps, ReactElement } from "react";
import type EmojiPickerComponent from "@/components/compose/emoji_picker";

import { Suspense } from "react";

import { ErrorBoundary } from "@/components/ui/error_boundary";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { ignore_error } from "@/lib/ignore_error";
import { lazy_with_retry } from "@/utils/lazy_with_retry";

type EmojiPickerProps = ComponentProps<typeof EmojiPickerComponent>;

const load_emoji_picker = () => import("@/components/compose/emoji_picker");

const EmojiPicker = lazy_with_retry(load_emoji_picker);

export function preload_emoji_picker(): void {
  void load_emoji_picker().catch((caught) =>
    ignore_error("components/compose/lazy_emoji_picker:preload", caught),
  );
}

function EmojiPickerFallback(): ReactElement {
  const { t } = use_i18n();

  return (
    <div
      aria-busy="true"
      aria-label={t("common.loading")}
      className="aster_floating flex h-[calc(98px+min(300px,42vh))] w-[360px] sm:h-[390px] max-w-[calc(100vw-16px)] items-center justify-center text-txt-muted"
      role="status"
    >
      <Spinner size="md" />
    </div>
  );
}

export function LazyEmojiPicker(props: EmojiPickerProps): ReactElement {
  return (
    <ErrorBoundary fallback={null} on_error={() => props.on_dismiss?.()}>
      <Suspense fallback={<EmojiPickerFallback />}>
        <EmojiPicker {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
