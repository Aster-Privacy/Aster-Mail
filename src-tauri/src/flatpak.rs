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
use std::sync::OnceLock;

pub const APP_ID: &str = "org.astermail.Mail";

pub fn is_flatpak() -> bool {
    static IS_FLATPAK: OnceLock<bool> = OnceLock::new();

    *IS_FLATPAK.get_or_init(|| std::path::Path::new("/.flatpak-info").exists())
}

pub fn apply_config(config: &mut tauri::Config) {
    if !is_flatpak() {
        return;
    }

    config.identifier = APP_ID.to_string();
    config.app.enable_gtk_app_id = true;
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let script = if is_flatpak() {
        "window.__ASTER_FLATPAK__ = true;"
    } else {
        ""
    };

    tauri::plugin::Builder::new("aster-flatpak")
        .js_init_script(script.to_string())
        .build()
}

pub mod secret {
    use std::future::Future;
    use std::sync::{mpsc, OnceLock};
    use std::time::Duration;

    use oo7::Keyring;
    use tokio::runtime::Runtime;
    use tokio::sync::OnceCell;

    const PORTAL_TIMEOUT: Duration = Duration::from_secs(60);

    fn runtime() -> Result<&'static Runtime, String> {
        static RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();

        RUNTIME
            .get_or_init(|| {
                tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(1)
                    .thread_name("aster-secret-portal")
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())
            })
            .as_ref()
            .map_err(|e| e.clone())
    }

    fn run<T, F>(future: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: Future<Output = Result<T, String>> + Send + 'static,
    {
        let (tx, rx) = mpsc::sync_channel(1);

        runtime()?.spawn(async move {
            let result = match tokio::time::timeout(PORTAL_TIMEOUT, future).await {
                Ok(result) => result,
                Err(_) => Err("secret portal timed out".to_string()),
            };
            let _ = tx.send(result);
        });

        rx.recv()
            .map_err(|_| "secret portal task stopped".to_string())?
    }

    async fn keyring() -> Result<&'static Keyring, String> {
        static KEYRING: OnceCell<Keyring> = OnceCell::const_new();

        KEYRING
            .get_or_try_init(|| async { Keyring::new().await.map_err(|e| e.to_string()) })
            .await
    }

    fn attributes<'a>(service: &'a str, user: &'a str) -> [(&'static str, &'a str); 2] {
        [("service", service), ("username", user)]
    }

    pub fn get(service: &str, user: &str) -> Result<Option<String>, String> {
        let (service, user) = (service.to_string(), user.to_string());

        run(async move {
            let items = keyring()
                .await?
                .search_items(&attributes(&service, &user))
                .await
                .map_err(|e| e.to_string())?;
            let Some(item) = items.first() else {
                return Ok(None);
            };
            let secret = item.secret().await.map_err(|e| e.to_string())?;

            std::str::from_utf8(secret.as_bytes())
                .map(|value| Some(value.to_string()))
                .map_err(|_| "stored secret is not valid UTF-8".to_string())
        })
    }

    pub fn set(service: &str, user: &str, value: &str) -> Result<(), String> {
        let (service, user, value) = (service.to_string(), user.to_string(), value.to_string());

        run(async move {
            keyring()
                .await?
                .create_item(
                    &format!("Aster Mail ({user})"),
                    &attributes(&service, &user),
                    value.as_str(),
                    true,
                )
                .await
                .map_err(|e| e.to_string())
        })
    }

    pub fn delete(service: &str, user: &str) -> Result<(), String> {
        let (service, user) = (service.to_string(), user.to_string());

        run(async move {
            keyring()
                .await?
                .delete(&attributes(&service, &user))
                .await
                .map_err(|e| e.to_string())
        })
    }

    fn portal_error(message: String) -> keyring::Error {
        keyring::Error::PlatformFailure(message.into())
    }

    pub enum Entry {
        Native(keyring::Entry),
        Portal { service: String, user: String },
    }

    impl Entry {
        pub fn new(service: &str, user: &str) -> keyring::Result<Self> {
            if super::is_flatpak() {
                return Ok(Self::Portal {
                    service: service.to_string(),
                    user: user.to_string(),
                });
            }

            keyring::Entry::new(service, user).map(Self::Native)
        }

        pub fn get_password(&self) -> keyring::Result<String> {
            match self {
                Self::Native(entry) => entry.get_password(),
                Self::Portal { service, user } => match get(service, user) {
                    Ok(Some(value)) => Ok(value),
                    Ok(None) => Err(keyring::Error::NoEntry),
                    Err(e) => Err(portal_error(e)),
                },
            }
        }

        pub fn set_password(&self, value: &str) -> keyring::Result<()> {
            match self {
                Self::Native(entry) => entry.set_password(value),
                Self::Portal { service, user } => set(service, user, value).map_err(portal_error),
            }
        }

        pub fn delete_credential(&self) -> keyring::Result<()> {
            match self {
                Self::Native(entry) => entry.delete_credential(),
                Self::Portal { service, user } => delete(service, user).map_err(portal_error),
            }
        }
    }
}

pub mod notification {
    use ashpd::desktop::notification::{Action, Notification, NotificationProxy};
    use futures_util::StreamExt;
    use tokio::sync::OnceCell;

    use crate::mail_notification::{self, NotificationOpen};

    const OPEN_ACTION: &str = "open";

    async fn proxy(app: &tauri::AppHandle) -> Result<&'static NotificationProxy, String> {
        static PROXY: OnceCell<NotificationProxy> = OnceCell::const_new();
        static LISTENER: OnceCell<()> = OnceCell::const_new();

        let proxy = PROXY
            .get_or_try_init(|| async { NotificationProxy::new().await.map_err(|e| e.to_string()) })
            .await?;

        LISTENER
            .get_or_try_init(|| async {
                let mut actions = proxy
                    .receive_action_invoked()
                    .await
                    .map_err(|e| e.to_string())?;
                let app = app.clone();

                tauri::async_runtime::spawn(async move {
                    while let Some(action) = actions.next().await {
                        handle_action(&app, &action);
                    }
                });

                Ok::<(), String>(())
            })
            .await?;

        Ok(proxy)
    }

    fn handle_action(app: &tauri::AppHandle, action: &Action) {
        if action.name() != OPEN_ACTION {
            return;
        }

        let open = action
            .parameter()
            .first()
            .and_then(|value| <&str>::try_from(&**value).ok())
            .and_then(mail_notification::parse_open_url)
            .unwrap_or(NotificationOpen { email_id: None });

        mail_notification::activate(app, open);
    }

    pub async fn show(
        app: &tauri::AppHandle,
        title: &str,
        body: &str,
        launch: &str,
    ) -> std::result::Result<(), String> {
        let proxy = proxy(app).await?;
        let id = uuid::Uuid::new_v4().to_string();
        let notification = Notification::new(title)
            .body(body)
            .default_action(OPEN_ACTION)
            .default_action_target(launch);

        proxy
            .add_notification(&id, notification)
            .await
            .map_err(|e| e.to_string())
    }
}

pub mod open_uri {
    use std::fs::File;
    use std::os::fd::AsFd;
    use std::path::Path;

    use ashpd::desktop::open_uri::{OpenDirectoryRequest, OpenFileRequest};

    pub async fn open_file(path: &Path) -> std::result::Result<(), String> {
        let file = File::open(path).map_err(|e| e.to_string())?;

        OpenFileRequest::default()
            .ask(false)
            .send_file(&file.as_fd())
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub async fn reveal(path: &Path) -> std::result::Result<(), String> {
        let file = File::open(path).map_err(|e| e.to_string())?;

        OpenDirectoryRequest::default()
            .send(&file.as_fd())
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
