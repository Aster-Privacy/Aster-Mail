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
use std::sync::Mutex;

use tauri::{Emitter, Manager, State};

pub const MAILTO_ACTIVATED_EVENT: &str = "aster://mailto-activated";

const MAILTO_PREFIX: &str = "mailto:";
const MAX_MAILTO_LENGTH: usize = 16_384;
const MAX_PENDING_LINKS: usize = 8;

pub struct PendingMailto(Mutex<Vec<String>>);

impl PendingMailto {
    pub fn new(initial: Option<String>) -> Self {
        Self(Mutex::new(initial.into_iter().collect()))
    }

    fn push(&self, url: String) {
        if let Ok(mut guard) = self.0.lock() {
            if guard.len() >= MAX_PENDING_LINKS {
                guard.remove(0);
            }
            guard.push(url);
        }
    }

    fn take(&self) -> Vec<String> {
        self.0
            .lock()
            .map(|mut guard| std::mem::take(&mut *guard))
            .unwrap_or_default()
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DefaultMailOutcome {
    Applied,
    NeedsConfirmation,
}

#[derive(serde::Serialize)]
pub struct DefaultMailStatus {
    supported: bool,
    is_default: bool,
}

pub fn accept_mailto(raw: &str) -> Option<String> {
    let trimmed = raw.trim();

    if trimmed.len() <= MAILTO_PREFIX.len() || trimmed.len() > MAX_MAILTO_LENGTH {
        return None;
    }

    let prefix = trimmed.get(..MAILTO_PREFIX.len())?;

    if !prefix.eq_ignore_ascii_case(MAILTO_PREFIX) {
        return None;
    }

    if trimmed.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }

    Some(trimmed.to_string())
}

pub fn mailto_from_args<S: AsRef<str>, I: IntoIterator<Item = S>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .find_map(|arg| accept_mailto(arg.as_ref()))
}

pub fn queue_mailto(app: &tauri::AppHandle, url: String, notify: bool) {
    let state: State<PendingMailto> = app.state();
    state.push(url);

    if notify {
        let _ = app.emit(MAILTO_ACTIVATED_EVENT, ());
    }
}

#[tauri::command]
pub fn take_pending_mailto(state: State<PendingMailto>) -> Vec<String> {
    state.take()
}

#[tauri::command]
pub async fn default_mail_app_status(app: tauri::AppHandle) -> DefaultMailStatus {
    tauri::async_runtime::spawn_blocking(move || DefaultMailStatus {
        supported: platform::supported(),
        is_default: platform::is_default(&app),
    })
    .await
    .unwrap_or(DefaultMailStatus {
        supported: false,
        is_default: false,
    })
}

#[tauri::command]
pub async fn set_default_mail_app(
    app: tauri::AppHandle,
) -> std::result::Result<DefaultMailOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || platform::set_default(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_default_mail_app(
    app: tauri::AppHandle,
) -> std::result::Result<DefaultMailOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || platform::clear_default(&app))
        .await
        .map_err(|e| e.to_string())?
}

pub fn refresh_registration(app: &tauri::AppHandle) {
    platform::refresh_registration(app);
}

#[cfg(unix)]
fn store_dir(app: &tauri::AppHandle) -> std::result::Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[cfg(windows)]
mod platform {
    use super::DefaultMailOutcome;
    use windows_registry::CURRENT_USER;

    const PROG_ID: &str = "AsterMail.Url.mailto";
    const CLIENT_NAME: &str = "Aster Mail";
    const APP_USER_MODEL_ID: &str = "com.astermail.mail";
    const CLIENT_KEY: &str = "Software\\Clients\\Mail\\Aster Mail";
    const CAPABILITIES_KEY: &str = "Software\\Clients\\Mail\\Aster Mail\\Capabilities";
    const REGISTERED_APPLICATIONS_KEY: &str = "Software\\RegisteredApplications";
    const USER_CHOICE_KEY: &str =
        "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\mailto\\UserChoice";
    const DEFAULT_APPS_URI: &str = "ms-settings:defaultapps?registeredAppUser=Aster%20Mail";
    const SHCNE_ASSOCCHANGED: i32 = 0x0800_0000;
    const SHCNF_IDLIST: u32 = 0;

    #[link(name = "shell32")]
    extern "system" {
        fn SHChangeNotify(
            event_id: i32,
            flags: u32,
            item_1: *const std::ffi::c_void,
            item_2: *const std::ffi::c_void,
        );
    }

    pub fn supported() -> bool {
        true
    }

    fn current_exe() -> std::result::Result<String, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe.display().to_string();

        Ok(exe.strip_prefix("\\\\?\\").unwrap_or(&exe).to_string())
    }

    fn register_capabilities() -> std::result::Result<(), String> {
        let exe = current_exe()?;
        let class_key = format!("Software\\Classes\\{PROG_ID}");
        fn fail<E: std::fmt::Display>(error: E) -> String {
            error.to_string()
        }

        let class = CURRENT_USER.create(&class_key).map_err(fail)?;
        class.set_string("", "Aster Mail URL").map_err(fail)?;
        class.set_string("URL Protocol", "").map_err(fail)?;

        let icon = CURRENT_USER
            .create(format!("{class_key}\\DefaultIcon"))
            .map_err(fail)?;
        icon.set_string("", format!("{exe},0")).map_err(fail)?;

        let application = CURRENT_USER
            .create(format!("{class_key}\\Application"))
            .map_err(fail)?;
        application
            .set_string("ApplicationName", CLIENT_NAME)
            .map_err(fail)?;
        application
            .set_string("ApplicationIcon", format!("{exe},0"))
            .map_err(fail)?;
        application
            .set_string("AppUserModelId", APP_USER_MODEL_ID)
            .map_err(fail)?;

        let command = CURRENT_USER
            .create(format!("{class_key}\\shell\\open\\command"))
            .map_err(fail)?;
        command
            .set_string("", format!("\"{exe}\" \"%1\""))
            .map_err(fail)?;

        let client = CURRENT_USER.create(CLIENT_KEY).map_err(fail)?;
        client.set_string("", CLIENT_NAME).map_err(fail)?;

        let client_icon = CURRENT_USER
            .create(format!("{CLIENT_KEY}\\DefaultIcon"))
            .map_err(fail)?;
        client_icon.set_string("", format!("{exe},0")).map_err(fail)?;

        let capabilities = CURRENT_USER.create(CAPABILITIES_KEY).map_err(fail)?;
        capabilities
            .set_string("ApplicationName", CLIENT_NAME)
            .map_err(fail)?;
        capabilities
            .set_string("ApplicationDescription", "Private, encrypted email")
            .map_err(fail)?;
        capabilities
            .set_string("ApplicationIcon", format!("{exe},0"))
            .map_err(fail)?;

        let associations = CURRENT_USER
            .create(format!("{CAPABILITIES_KEY}\\URLAssociations"))
            .map_err(fail)?;
        associations.set_string("mailto", PROG_ID).map_err(fail)?;

        let registered = CURRENT_USER
            .create(REGISTERED_APPLICATIONS_KEY)
            .map_err(fail)?;
        registered
            .set_string(CLIENT_NAME, CAPABILITIES_KEY)
            .map_err(fail)?;

        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED,
                SHCNF_IDLIST,
                std::ptr::null(),
                std::ptr::null(),
            );
        }

        Ok(())
    }

    fn open_default_apps(app: &tauri::AppHandle) -> std::result::Result<(), String> {
        use tauri_plugin_shell::ShellExt;

        #[allow(deprecated)]
        app.shell()
            .open(DEFAULT_APPS_URI, None)
            .map_err(|e| e.to_string())
    }

    pub fn is_default(_app: &tauri::AppHandle) -> bool {
        CURRENT_USER
            .open(USER_CHOICE_KEY)
            .and_then(|key| key.get_string("ProgId"))
            .map(|prog_id| prog_id.eq_ignore_ascii_case(PROG_ID))
            .unwrap_or(false)
    }

    pub fn set_default(app: &tauri::AppHandle) -> std::result::Result<DefaultMailOutcome, String> {
        register_capabilities()?;

        if is_default(app) {
            return Ok(DefaultMailOutcome::Applied);
        }

        open_default_apps(app)?;

        Ok(DefaultMailOutcome::NeedsConfirmation)
    }

    pub fn clear_default(
        app: &tauri::AppHandle,
    ) -> std::result::Result<DefaultMailOutcome, String> {
        if !is_default(app) {
            return Ok(DefaultMailOutcome::Applied);
        }

        open_default_apps(app)?;

        Ok(DefaultMailOutcome::NeedsConfirmation)
    }

    pub fn refresh_registration(_app: &tauri::AppHandle) {
        if cfg!(debug_assertions) {
            return;
        }

        if let Err(error) = register_capabilities() {
            tracing::warn!(%error, "mail client registration failed");
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{store_dir, DefaultMailOutcome};
    use crate::default_mail_store;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    const SCHEME: &str = "mailto";
    const FALLBACK_HANDLER: &str = "com.apple.mail";

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultHandlerForURLScheme(scheme: CFStringRef, handler: CFStringRef) -> i32;
        fn LSCopyDefaultHandlerForURLScheme(scheme: CFStringRef) -> CFStringRef;
    }

    pub fn supported() -> bool {
        true
    }

    fn current_handler() -> Option<String> {
        let scheme = CFString::new(SCHEME);
        let handler = unsafe { LSCopyDefaultHandlerForURLScheme(scheme.as_concrete_TypeRef()) };

        if handler.is_null() {
            return None;
        }

        Some(unsafe { CFString::wrap_under_create_rule(handler) }.to_string())
    }

    fn assign_handler(bundle_id: &str) -> std::result::Result<(), String> {
        let scheme = CFString::new(SCHEME);
        let handler = CFString::new(bundle_id);
        let status = unsafe {
            LSSetDefaultHandlerForURLScheme(
                scheme.as_concrete_TypeRef(),
                handler.as_concrete_TypeRef(),
            )
        };

        if status == 0 {
            Ok(())
        } else {
            Err(format!("launch services error {status}"))
        }
    }

    fn bundle_id(app: &tauri::AppHandle) -> String {
        app.config().identifier.clone()
    }

    pub fn is_default(app: &tauri::AppHandle) -> bool {
        current_handler()
            .map(|handler| handler.eq_ignore_ascii_case(&bundle_id(app)))
            .unwrap_or(false)
    }

    pub fn set_default(app: &tauri::AppHandle) -> std::result::Result<DefaultMailOutcome, String> {
        let own = bundle_id(app);

        if let Some(previous) = current_handler() {
            if !previous.eq_ignore_ascii_case(&own) {
                default_mail_store::save(&store_dir(app)?, &previous);
            }
        }

        assign_handler(&own)?;

        Ok(DefaultMailOutcome::Applied)
    }

    pub fn clear_default(
        app: &tauri::AppHandle,
    ) -> std::result::Result<DefaultMailOutcome, String> {
        if !is_default(app) {
            return Ok(DefaultMailOutcome::Applied);
        }

        let store = store_dir(app)?;
        let restored =
            default_mail_store::load(&store).unwrap_or_else(|| FALLBACK_HANDLER.to_string());

        assign_handler(&restored)?;
        default_mail_store::forget(&store);

        Ok(DefaultMailOutcome::Applied)
    }

    pub fn refresh_registration(_app: &tauri::AppHandle) {}
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use super::{store_dir, DefaultMailOutcome};
    use crate::default_mail_linux;

    pub fn supported() -> bool {
        default_mail_linux::supported()
    }

    pub fn is_default(_app: &tauri::AppHandle) -> bool {
        default_mail_linux::is_default()
    }

    pub fn set_default(app: &tauri::AppHandle) -> std::result::Result<DefaultMailOutcome, String> {
        default_mail_linux::set_default(&store_dir(app)?)?;

        Ok(DefaultMailOutcome::Applied)
    }

    pub fn clear_default(
        app: &tauri::AppHandle,
    ) -> std::result::Result<DefaultMailOutcome, String> {
        if default_mail_linux::clear_default(&store_dir(app)?) {
            Ok(DefaultMailOutcome::Applied)
        } else {
            Ok(DefaultMailOutcome::NeedsConfirmation)
        }
    }

    pub fn refresh_registration(_app: &tauri::AppHandle) {
        default_mail_linux::refresh_registration();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_and_parameterized_links() {
        assert_eq!(
            accept_mailto("mailto:ada@example.com").as_deref(),
            Some("mailto:ada@example.com")
        );
        assert_eq!(
            accept_mailto("MAILTO:ada@example.com?subject=Hi%20there&body=Line%0Atwo").as_deref(),
            Some("MAILTO:ada@example.com?subject=Hi%20there&body=Line%0Atwo")
        );
        assert_eq!(
            accept_mailto("mailto:?subject=No%20recipient").as_deref(),
            Some("mailto:?subject=No%20recipient")
        );
    }

    #[test]
    fn rejects_other_schemes_and_malformed_input() {
        assert!(accept_mailto("mailto:").is_none());
        assert!(accept_mailto("").is_none());
        assert!(accept_mailto("https://example.com/?mailto:ada@example.com").is_none());
        assert!(accept_mailto("aster://oauth/callback?state=abc").is_none());
        assert!(accept_mailto("--mailto:ada@example.com").is_none());
        assert!(accept_mailto("mailto:ada@example.com\r\nbcc:eve@example.com").is_none());
        assert!(accept_mailto("mailto:ada@example.com subject").is_none());
        assert!(accept_mailto(&format!("mailto:{}", "a".repeat(MAX_MAILTO_LENGTH))).is_none());
    }

    #[test]
    fn finds_the_link_after_the_binary_name() {
        assert_eq!(
            mailto_from_args(["aster-mail.exe", "mailto:ada@example.com"]).as_deref(),
            Some("mailto:ada@example.com")
        );
        assert_eq!(
            mailto_from_args(["aster-mail", "--flag", "mailto:ada@example.com"]).as_deref(),
            Some("mailto:ada@example.com")
        );
        assert!(mailto_from_args(["mailto:ada@example.com"]).is_none());
        assert!(mailto_from_args(["aster-mail", "aster://oauth/callback"]).is_none());
        assert!(mailto_from_args(Vec::<String>::new()).is_none());
    }

    #[test]
    fn pending_queue_drains_once_and_stays_bounded() {
        let pending = PendingMailto::new(Some("mailto:first@example.com".to_string()));

        for index in 0..MAX_PENDING_LINKS {
            pending.push(format!("mailto:user{index}@example.com"));
        }

        let drained = pending.take();

        assert_eq!(drained.len(), MAX_PENDING_LINKS);
        assert_eq!(drained[0], "mailto:user0@example.com");
        assert!(pending.take().is_empty());
    }
}
