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
import { Component, type ReactNode } from "react";

import { LazyLoadError } from "@/utils/lazy_with_retry";

interface LazyLoadBoundaryProps {
  children: ReactNode;
  on_load_error: () => void;
}

interface LazyLoadBoundaryState {
  error: Error | null;
}

export class LazyLoadBoundary extends Component<
  LazyLoadBoundaryProps,
  LazyLoadBoundaryState
> {
  constructor(props: LazyLoadBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): LazyLoadBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    if (!(error instanceof LazyLoadError)) return;

    error.reset();
    this.props.on_load_error();
  }

  render(): ReactNode {
    const { error } = this.state;

    if (error instanceof LazyLoadError) return null;

    if (error) throw error;

    return this.props.children;
  }
}
