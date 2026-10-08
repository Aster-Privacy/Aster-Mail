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
import type { TranslationKey } from "@/lib/i18n/types";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  ChevronRightIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_profile_picture_upload } from "@/hooks/use_profile_picture_upload";
import { get_contrast_text } from "@/lib/avatar_color";
import { use_i18n } from "@/lib/i18n/context";
import { get_active_locale, get_initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";
import {
  GALLERY_CATEGORIES,
  fetch_gallery_image,
  gallery_thumb_url,
  is_gallery_available,
  load_gallery_manifest,
  type GalleryCategory,
  type GalleryItem,
} from "@/services/profile_picture_gallery";
import { connection_store } from "@/services/routing/connection_store";
import {
  close_profile_picture_dialog,
  use_profile_picture_dialog_open,
} from "@/stores/profile_picture_dialog_store";

type DialogView = "main" | "gallery";
type GalleryFilter = GalleryCategory | "all";
type GalleryStatus = "idle" | "loading" | "ready" | "failed";

function subscribe_connection(listener: () => void): () => void {
  return connection_store.subscribe(listener);
}

const VIEW_EASE: [number, number, number, number] = [0.2, 0, 0, 1];
const VIEW_SHIFT = 32;
const VIEW_DURATION = 0.24;

const VIEW_VARIANTS = {
  enter: (direction: number) => ({ opacity: 0, x: direction * VIEW_SHIFT }),
  center: { opacity: 1, x: 0, pointerEvents: "auto" as const },
  leave: (direction: number) => ({
    opacity: 0,
    x: -direction * VIEW_SHIFT,
    pointerEvents: "none" as const,
  }),
};

const STATIC_VARIANTS = {
  enter: { opacity: 1, x: 0 },
  center: { opacity: 1, x: 0, pointerEvents: "auto" as const },
  leave: { opacity: 0, x: 0, pointerEvents: "none" as const },
};

interface OptionRowProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled: boolean;
  on_click: () => void;
}

function OptionRow({ icon, label, hint, disabled, on_click }: OptionRowProps) {
  return (
    <button
      className="profile_picture_option flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-start disabled:opacity-60"
      disabled={disabled}
      type="button"
      onClick={on_click}
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-[var(--accent-color)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-txt-primary">
          {label}
        </span>
        <span className="block text-xs text-txt-muted">{hint}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-txt-muted rtl:rotate-180" />
    </button>
  );
}

interface ProfilePictureDialogViewProps {
  is_open: boolean;
  on_close: () => void;
  picture: string | null;
  has_saved_picture: boolean;
  name: string;
  email?: string;
  color: string;
  uploading: boolean;
  removing: boolean;
  error: string | null;
  on_upload: () => void;
  on_remove: () => void;
  on_choose_file: (file: File) => Promise<void>;
}

export function ProfilePictureDialogView({
  is_open,
  on_close,
  picture,
  has_saved_picture,
  name,
  email,
  color,
  uploading,
  removing,
  error,
  on_upload,
  on_remove,
  on_choose_file,
}: ProfilePictureDialogViewProps) {
  const { t, is_rtl } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const [view, set_view] = useState<DialogView>("main");
  const [direction, set_direction] = useState(1);
  const [status, set_status] = useState<GalleryStatus>("idle");
  const [items, set_items] = useState<GalleryItem[]>([]);
  const [filter, set_filter] = useState<GalleryFilter>("all");
  const [pending_slug, set_pending_slug] = useState<string | null>(null);
  const [gallery_error, set_gallery_error] = useState(false);
  const gallery_available = useSyncExternalStore(
    subscribe_connection,
    is_gallery_available,
  );

  const shown_view: DialogView = gallery_available ? view : "main";

  useEffect(() => {
    if (!is_open) return;

    set_view("main");
    set_direction(1);
    set_filter("all");
    set_pending_slug(null);
    set_gallery_error(false);
  }, [is_open]);

  const load_gallery = useCallback(() => {
    set_status("loading");
    load_gallery_manifest()
      .then((loaded) => {
        set_items(loaded);
        set_status("ready");
      })
      .catch(() => set_status("failed"));
  }, []);

  const show_view = useCallback((next: DialogView) => {
    set_direction(next === "gallery" ? 1 : -1);
    set_view(next);
  }, []);

  const open_gallery = useCallback(() => {
    if (!is_gallery_available()) return;

    show_view("gallery");
    set_gallery_error(false);
    if (status === "idle" || status === "failed") load_gallery();
  }, [load_gallery, show_view, status]);

  const choose_gallery_image = useCallback(
    async (slug: string) => {
      if (pending_slug || uploading || removing) return;

      set_pending_slug(slug);
      set_gallery_error(false);

      try {
        const file = await fetch_gallery_image(slug);

        await on_choose_file(file);
        show_view("main");
      } catch {
        set_gallery_error(true);
      } finally {
        set_pending_slug(null);
      }
    },
    [on_choose_file, pending_slug, removing, show_view, uploading],
  );

  const categories = useMemo(
    () =>
      GALLERY_CATEGORIES.filter((category) =>
        items.some((item) => item.category === category),
      ),
    [items],
  );

  const visible_items = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter((item) => item.category === filter),
    [filter, items],
  );

  const busy = uploading || removing;
  const slide_direction = is_rtl ? -direction : direction;
  const view_motion = {
    animate: "center",
    custom: slide_direction,
    exit: "leave",
    initial: "enter",
    transition: reduce_motion
      ? { duration: 0 }
      : { duration: VIEW_DURATION, ease: VIEW_EASE },
    variants: reduce_motion ? STATIC_VARIANTS : VIEW_VARIANTS,
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <div className="relative h-8">
          <AnimatePresence custom={slide_direction} initial={false}>
            <motion.div
              key={shown_view}
              className="absolute inset-0 flex items-center gap-2"
              {...view_motion}
            >
              {shown_view === "gallery" && (
                <button
                  aria-label={t("common.back")}
                  className="profile_picture_back flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-txt-secondary"
                  type="button"
                  onClick={() => show_view("main")}
                >
                  <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
                </button>
              )}
              <ModalTitle className="min-w-0 truncate">
                {shown_view === "gallery"
                  ? t("common.profile_picture_gallery")
                  : t("common.profile_picture_title")}
              </ModalTitle>
            </motion.div>
          </AnimatePresence>
        </div>
      </ModalHeader>

      <ModalBody className="pb-6">
        <div className="profile_picture_stage relative overflow-hidden">
          <AnimatePresence custom={slide_direction} initial={false}>
            {shown_view === "main" ? (
              <motion.div
                key="main"
                className="absolute inset-0 overflow-y-auto overscroll-contain"
                {...view_motion}
              >
                <div className="flex justify-center pb-6 pt-1">
                  <div className="relative h-36 w-36 overflow-hidden rounded-full">
                    {picture ? (
                      <motion.img
                        key={picture}
                        alt=""
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                        initial={
                          reduce_motion ? false : { opacity: 0, scale: 1.06 }
                        }
                        src={picture}
                        transition={{ duration: 0.28, ease: VIEW_EASE }}
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex select-none items-center justify-center text-[44px] font-semibold leading-none"
                        style={{
                          backgroundColor: color,
                          color: get_contrast_text(color),
                        }}
                      >
                        {get_initials(name, email, get_active_locale())}
                      </div>
                    )}
                    {busy && (
                      <div className="aster_scrim absolute inset-0 flex items-center justify-center">
                        <Spinner className="text-white" size="md" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {gallery_available && (
                    <OptionRow
                      disabled={busy}
                      hint={t("common.profile_picture_gallery_hint")}
                      icon={<PhotoIcon className="h-6 w-6" />}
                      label={t("common.profile_picture_gallery")}
                      on_click={open_gallery}
                    />
                  )}
                  <OptionRow
                    disabled={busy}
                    hint={t("common.profile_picture_upload_hint")}
                    icon={<ArrowUpTrayIcon className="h-6 w-6" />}
                    label={t("common.profile_picture_upload")}
                    on_click={on_upload}
                  />
                </div>

                {error && (
                  <p
                    className="pt-3 text-center text-xs font-medium text-[var(--color-danger)]"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                {has_saved_picture && (
                  <div className="flex justify-center pt-4">
                    <Button
                      disabled={busy}
                      size="sm"
                      variant="ghost"
                      onClick={on_remove}
                    >
                      {t("common.remove_photo")}
                    </Button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="gallery"
                className="absolute inset-0 flex flex-col"
                {...view_motion}
              >
                {status === "loading" && (
                  <div className="flex flex-1 items-center justify-center">
                    <Spinner size="md" />
                  </div>
                )}

                {status === "failed" && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
                    <p className="text-sm text-txt-secondary">
                      {t("common.profile_picture_gallery_failed")}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={load_gallery}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                )}

                {status === "ready" && (
                  <>
                    <div className="profile_picture_chips -mx-1 flex flex-shrink-0 gap-2 overflow-x-auto px-1 pb-3">
                      {(["all", ...categories] as GalleryFilter[]).map(
                        (category) => (
                          <button
                            key={category}
                            aria-pressed={filter === category}
                            className={cn(
                              "profile_picture_chip flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium",
                              filter === category && "is_active",
                            )}
                            type="button"
                            onClick={() => set_filter(category)}
                          >
                            {t(
                              `common.profile_picture_cat_${category}` as TranslationKey,
                            )}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="profile_picture_grid min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {visible_items.map((item) => (
                          <button
                            key={item.slug}
                            className="profile_picture_tile relative aspect-square overflow-hidden rounded-2xl"
                            disabled={!!pending_slug || busy}
                            type="button"
                            onClick={() => choose_gallery_image(item.slug)}
                          >
                            <img
                              alt=""
                              className="h-full w-full object-cover"
                              decoding="async"
                              draggable={false}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              src={gallery_thumb_url(item.slug)}
                            />
                            {pending_slug === item.slug && (
                              <span className="aster_scrim absolute inset-0 flex items-center justify-center">
                                <Spinner className="text-white" size="sm" />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(gallery_error || error) && (
                      <p
                        className="pt-3 text-center text-xs font-medium text-[var(--color-danger)]"
                        role="alert"
                      >
                        {error || t("common.failed_upload_image")}
                      </p>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ModalBody>
    </Modal>
  );
}

export function ProfilePictureDialog() {
  const is_open = use_profile_picture_dialog_open();
  const { user, is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const {
    uploading,
    removing,
    preview,
    error,
    open_picker,
    process_file,
    remove_picture,
  } = use_profile_picture_upload();

  useEffect(() => {
    if (!is_authenticated && is_open) close_profile_picture_dialog();
  }, [is_authenticated, is_open]);

  return (
    <ProfilePictureDialogView
      color={user?.profile_color || preferences.profile_color}
      email={user?.email}
      error={error}
      has_saved_picture={!!user?.profile_picture}
      is_open={is_open && is_authenticated}
      name={user?.display_name || user?.username || ""}
      on_choose_file={process_file}
      on_close={close_profile_picture_dialog}
      on_remove={remove_picture}
      on_upload={open_picker}
      picture={preview || user?.profile_picture || null}
      removing={removing}
      uploading={uploading}
    />
  );
}
