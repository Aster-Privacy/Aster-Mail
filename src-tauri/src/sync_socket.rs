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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::{ORIGIN, USER_AGENT};
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async_tls_with_config, Connector};

const SYNC_SOCKET_EVENT: &str = "aster://sync-socket";
const PRIMARY_WINDOW: &str = "main";
const SOCKET_ORIGIN: &str = "https://tauri.localhost";
const SOCKET_DOMAIN: &str = "astermail.org";
const SOCKET_DOMAIN_SUFFIX: &str = ".astermail.org";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_OUTGOING_BYTES: usize = 1024 * 1024;

enum Outgoing {
    Text(String),
    Close,
}

#[derive(Default)]
pub struct SyncSockets {
    next_id: AtomicU64,
    active: Mutex<Option<(u64, UnboundedSender<Outgoing>)>>,
}

impl SyncSockets {
    fn replace(&self, id: u64, sender: UnboundedSender<Outgoing>) {
        if let Ok(mut active) = self.active.lock() {
            if let Some((_, previous)) = active.replace((id, sender)) {
                let _ = previous.send(Outgoing::Close);
            }
        }
    }

    fn sender(&self, id: u64) -> Option<UnboundedSender<Outgoing>> {
        let active = self.active.lock().ok()?;
        active
            .as_ref()
            .filter(|(active_id, _)| *active_id == id)
            .map(|(_, sender)| sender.clone())
    }

    fn release(&self, id: u64) {
        if let Ok(mut active) = self.active.lock() {
            if active.as_ref().is_some_and(|(active_id, _)| *active_id == id) {
                *active = None;
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct SocketEvent {
    id: u64,
    kind: &'static str,
    data: Option<String>,
}

fn require_primary_webview(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != PRIMARY_WINDOW {
        return Err("command not available in this window".to_string());
    }
    Ok(())
}

fn validate_socket_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "invalid sync socket url".to_string())?;

    if url.scheme() != "wss" {
        return Err("sync socket requires wss".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("sync socket url must not carry credentials".to_string());
    }
    if url.port().is_some_and(|port| port != 443) {
        return Err("sync socket port is not allowed".to_string());
    }

    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    let host = host.trim_end_matches('.');

    if host != SOCKET_DOMAIN && !host.ends_with(SOCKET_DOMAIN_SUFFIX) {
        return Err("sync socket host is not allowed".to_string());
    }

    Ok(url)
}

fn emit(app: &AppHandle, id: u64, kind: &'static str, data: Option<String>) {
    let _ = app.emit_to(PRIMARY_WINDOW, SYNC_SOCKET_EVENT, SocketEvent { id, kind, data });
}

async fn pump<S>(app: AppHandle, id: u64, stream: S, mut outgoing: UnboundedReceiver<Outgoing>)
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
        + futures_util::Sink<Message>
        + Unpin,
{
    let (mut sink, mut source) = stream.split();

    loop {
        tokio::select! {
            next = outgoing.recv() => match next {
                Some(Outgoing::Text(text)) => {
                    if sink.send(Message::text(text)).await.is_err() {
                        break;
                    }
                }
                Some(Outgoing::Close) | None => {
                    let _ = sink.send(Message::Close(None)).await;
                    break;
                }
            },
            next = source.next() => match next {
                Some(Ok(Message::Text(text))) => {
                    emit(&app, id, "message", Some(text.as_str().to_owned()));
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => {
                    if sink.flush().await.is_err() {
                        break;
                    }
                }
            },
        }
    }

    app.state::<SyncSockets>().release(id);
    emit(&app, id, "close", None);
}

#[tauri::command]
pub async fn sync_socket_open(
    window: tauri::WebviewWindow,
    app: AppHandle,
    sockets: State<'_, SyncSockets>,
    url: String,
) -> Result<u64, String> {
    require_primary_webview(&window)?;
    let url = validate_socket_url(&url)?;

    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(|_| "invalid sync socket url".to_string())?;
    request
        .headers_mut()
        .insert(ORIGIN, HeaderValue::from_static(SOCKET_ORIGIN));
    request.headers_mut().insert(
        USER_AGENT,
        HeaderValue::from_static(crate::device::crypto::DESKTOP_USER_AGENT),
    );

    let connector = Connector::Rustls(crate::http_client::pinned_tls_config()?);
    let (stream, _) = tokio::time::timeout(
        CONNECT_TIMEOUT,
        connect_async_tls_with_config(request, None, true, Some(connector)),
    )
    .await
    .map_err(|_| "sync socket connection timed out".to_string())?
    .map_err(|_| "sync socket connection failed".to_string())?;

    let id = sockets.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let (sender, receiver) = unbounded_channel();
    sockets.replace(id, sender);
    tauri::async_runtime::spawn(pump(app, id, stream, receiver));

    Ok(id)
}

#[tauri::command]
pub fn sync_socket_send(
    window: tauri::WebviewWindow,
    sockets: State<'_, SyncSockets>,
    id: u64,
    text: String,
) -> Result<(), String> {
    require_primary_webview(&window)?;
    if text.len() > MAX_OUTGOING_BYTES {
        return Err("sync socket message is too large".to_string());
    }

    sockets
        .sender(id)
        .ok_or_else(|| "sync socket is closed".to_string())?
        .send(Outgoing::Text(text))
        .map_err(|_| "sync socket is closed".to_string())
}

#[tauri::command]
pub fn sync_socket_close(
    window: tauri::WebviewWindow,
    sockets: State<'_, SyncSockets>,
    id: u64,
) -> Result<(), String> {
    require_primary_webview(&window)?;
    if let Some(sender) = sockets.sender(id) {
        let _ = sender.send(Outgoing::Close);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_secure_sockets_on_owned_hosts() {
        for url in [
            "wss://app.astermail.org/ws",
            "wss://APP.ASTERMAIL.ORG/ws",
            "wss://app.astermail.org:443/ws",
            "wss://relay.astermail.org/r/ws",
        ] {
            assert!(validate_socket_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn refuses_plain_sockets_other_hosts_ports_and_credentials() {
        for url in [
            "ws://app.astermail.org/ws",
            "https://app.astermail.org/ws",
            "wss://app.astermail.com/ws",
            "wss://astermail.org.example.com/ws",
            "wss://evilastermail.org/ws",
            "wss://example.com/ws",
            "wss://app.astermail.org:8443/ws",
            "wss://user:secret@app.astermail.org/ws",
            "wss://exampleexampleexampleexampleexampleexampleexampleexam.onion/ws",
            "not a url",
        ] {
            assert!(validate_socket_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn a_new_socket_closes_the_one_it_replaces() {
        let sockets = SyncSockets::default();
        let (first, mut first_rx) = unbounded_channel();
        let (second, _second_rx) = unbounded_channel();

        sockets.replace(1, first);
        sockets.replace(2, second);

        assert!(matches!(first_rx.try_recv(), Ok(Outgoing::Close)));
        assert!(sockets.sender(1).is_none());
        assert!(sockets.sender(2).is_some());
    }

    #[test]
    fn releasing_an_old_socket_keeps_the_current_one() {
        let sockets = SyncSockets::default();
        let (sender, _rx) = unbounded_channel();

        sockets.replace(2, sender);
        sockets.release(1);
        assert!(sockets.sender(2).is_some());
        sockets.release(2);
        assert!(sockets.sender(2).is_none());
    }
}
