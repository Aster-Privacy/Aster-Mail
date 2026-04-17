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
use std::sync::Arc;
use std::time::Duration;

use arti_client::{config::CfgPath, TorClient, TorClientConfig};
use tokio::sync::RwLock;
use tracing::warn;

pub struct TorManager {
    client: Arc<RwLock<Option<TorClient<tor_rtcompat::PreferredRuntime>>>>,
    status: Arc<RwLock<TorConnectionStatus>>,
}

#[derive(Clone, Debug)]
pub enum TorConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

impl TorConnectionStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Disconnected => "disconnected",
            Self::Connecting => "connecting",
            Self::Connected => "connected",
            Self::Error(msg) => msg,
        }
    }

    pub fn is_connected(&self) -> bool {
        matches!(self, Self::Connected)
    }
}

impl Default for TorManager {
    fn default() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            status: Arc::new(RwLock::new(TorConnectionStatus::Disconnected)),
        }
    }
}

impl TorManager {
    pub async fn start(&self, use_snowflake: bool) -> Result<(), String> {
        if use_snowflake {
            warn!("snowflake bridge transport requested but not yet supported");
            return Err("Snowflake bridge transport is not yet supported".to_string());
        }

        {
            let current = self.status.read().await;
            if current.is_connected() {
                return Ok(());
            }
        }

        *self.status.write().await = TorConnectionStatus::Connecting;

        let data_dir = dirs::data_local_dir()
            .ok_or_else(|| "cannot resolve local data directory".to_string())?
            .join("aster-mail")
            .join("tor");

        let mut config_builder = TorClientConfig::builder();
        config_builder
            .storage()
            .cache_dir(CfgPath::new(data_dir.join("cache").to_string_lossy().into_owned()))
            .state_dir(CfgPath::new(data_dir.join("state").to_string_lossy().into_owned()));
        let config = config_builder
            .build()
            .map_err(|e| format!("tor config build error: {e}"))?;

        let bootstrap_timeout = Duration::from_secs(60);
        match tokio::time::timeout(bootstrap_timeout, TorClient::create_bootstrapped(config)).await
        {
            Ok(Ok(client)) => {
                *self.client.write().await = Some(client);
                *self.status.write().await = TorConnectionStatus::Connected;
                Ok(())
            }
            Ok(Err(e)) => {
                let error_msg = format!("Failed to bootstrap Tor: {}", e);
                *self.status.write().await = TorConnectionStatus::Error(error_msg.clone());
                Err(error_msg)
            }
            Err(_) => {
                let error_msg =
                    "Tor bootstrap timed out after 60 seconds".to_string();
                *self.status.write().await = TorConnectionStatus::Error(error_msg.clone());
                Err(error_msg)
            }
        }
    }

    pub async fn stop(&self) {
        *self.client.write().await = None;
        *self.status.write().await = TorConnectionStatus::Disconnected;
    }

    pub async fn get_status(&self) -> TorConnectionStatus {
        self.status.read().await.clone()
    }

    pub async fn get_client(
        &self,
    ) -> Option<TorClient<tor_rtcompat::PreferredRuntime>> {
        self.client.read().await.clone()
    }
}
