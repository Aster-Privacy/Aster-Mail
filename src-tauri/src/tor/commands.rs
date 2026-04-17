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
use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use super::config::TorStartConfig;
use super::manager::TorManager;
use super::transport::{execute_tor_request, TorFetchResponse};

pub struct TorState {
    pub manager: TorManager,
}

impl Default for TorState {
    fn default() -> Self {
        Self {
            manager: TorManager::default(),
        }
    }
}

#[derive(Serialize)]
pub struct TorStatusResponse {
    pub status: String,
    pub is_connected: bool,
}

#[tauri::command]
pub async fn tor_start(
    config: TorStartConfig,
    state: State<'_, TorState>,
) -> Result<TorStatusResponse, String> {
    state.manager.start(config.use_snowflake).await?;
    let current = state.manager.get_status().await;
    Ok(TorStatusResponse {
        status: current.as_str().to_string(),
        is_connected: current.is_connected(),
    })
}

#[tauri::command]
pub async fn tor_stop(state: State<'_, TorState>) -> Result<(), String> {
    state.manager.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn tor_status(state: State<'_, TorState>) -> Result<TorStatusResponse, String> {
    let current = state.manager.get_status().await;
    Ok(TorStatusResponse {
        status: current.as_str().to_string(),
        is_connected: current.is_connected(),
    })
}

#[tauri::command]
pub async fn tor_fetch(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    state: State<'_, TorState>,
) -> Result<TorFetchResponse, String> {
    let client = state
        .manager
        .get_client()
        .await
        .ok_or_else(|| "Tor is not connected".to_string())?;

    execute_tor_request(&client, &url, &method, &headers, body.as_deref()).await
}
