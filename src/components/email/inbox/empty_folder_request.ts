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
import { useEffect, useRef, useState } from "react";

export type EmptyableFolder = "trash" | "spam";

const EMPTY_FOLDER_REQUESTED = "astermail:empty-folder-requested";

let pending_request: EmptyableFolder | null = null;

export function request_empty_folder(folder: EmptyableFolder): void {
  pending_request = folder;
  window.dispatchEvent(new CustomEvent(EMPTY_FOLDER_REQUESTED));
}

interface UseEmptyFolderRequestOptions {
  current_view: string;
  is_ready: boolean;
  on_empty_trash: () => void;
  on_empty_spam: () => void;
}

export function use_empty_folder_request({
  current_view,
  is_ready,
  on_empty_trash,
  on_empty_spam,
}: UseEmptyFolderRequestOptions): void {
  const [request_tick, set_request_tick] = useState(0);
  const arrived_ref = useRef(false);

  useEffect(() => {
    const handle_request = () => set_request_tick((prev) => prev + 1);

    window.addEventListener(EMPTY_FOLDER_REQUESTED, handle_request);

    return () => {
      window.removeEventListener(EMPTY_FOLDER_REQUESTED, handle_request);
    };
  }, []);

  useEffect(() => {
    const folder = pending_request;

    if (!folder) {
      arrived_ref.current = false;

      return;
    }

    if (current_view !== folder) {
      if (arrived_ref.current) {
        pending_request = null;
        arrived_ref.current = false;
      }

      return;
    }

    arrived_ref.current = true;
    if (!is_ready) return;

    pending_request = null;
    arrived_ref.current = false;

    if (folder === "trash") {
      on_empty_trash();
    } else {
      on_empty_spam();
    }
  }, [request_tick, current_view, is_ready, on_empty_trash, on_empty_spam]);
}
