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
use std::io;
use std::net::SocketAddr;
use std::time::Duration;

use tokio::net::TcpStream;
use tokio::task::JoinSet;

pub const ATTEMPT_DELAY: Duration = Duration::from_millis(250);
pub const ATTEMPT_TIMEOUT: Duration = Duration::from_secs(10);

pub fn interleave_families(addresses: Vec<SocketAddr>) -> Vec<SocketAddr> {
    let mut unique: Vec<SocketAddr> = Vec::with_capacity(addresses.len());
    for address in addresses {
        if !unique.contains(&address) {
            unique.push(address);
        }
    }

    let first_is_v6 = unique.first().is_some_and(SocketAddr::is_ipv6);
    let (preferred, other): (Vec<SocketAddr>, Vec<SocketAddr>) = unique
        .into_iter()
        .partition(|address| address.is_ipv6() == first_is_v6);

    let mut ordered = Vec::with_capacity(preferred.len() + other.len());
    let mut preferred = preferred.into_iter();
    let mut other = other.into_iter();
    loop {
        let next_preferred = preferred.next();
        let next_other = other.next();
        if next_preferred.is_none() && next_other.is_none() {
            break;
        }
        ordered.extend(next_preferred);
        ordered.extend(next_other);
    }
    ordered
}

async fn attempt(address: SocketAddr, timeout: Duration) -> io::Result<TcpStream> {
    match tokio::time::timeout(timeout, TcpStream::connect(address)).await {
        Ok(result) => result,
        Err(_) => Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "connection attempt timed out",
        )),
    }
}

pub async fn connect_first(
    addresses: Vec<SocketAddr>,
    attempt_delay: Duration,
    attempt_timeout: Duration,
) -> io::Result<TcpStream> {
    let mut pending = interleave_families(addresses).into_iter();
    let mut attempts: JoinSet<io::Result<TcpStream>> = JoinSet::new();
    let mut last_error =
        io::Error::new(io::ErrorKind::NotFound, "no addresses to connect to");

    loop {
        if attempts.is_empty() {
            match pending.next() {
                Some(address) => {
                    attempts.spawn(attempt(address, attempt_timeout));
                }
                None => return Err(last_error),
            }
        }

        let can_start_more = pending.len() > 0;

        tokio::select! {
            joined = attempts.join_next() => match joined {
                Some(Ok(Ok(stream))) => {
                    attempts.abort_all();
                    return Ok(stream);
                }
                Some(Ok(Err(error))) => {
                    last_error = error;
                    if let Some(address) = pending.next() {
                        attempts.spawn(attempt(address, attempt_timeout));
                    }
                }
                Some(Err(_)) => {
                    last_error = io::Error::other("connection attempt stopped");
                    if let Some(address) = pending.next() {
                        attempts.spawn(attempt(address, attempt_timeout));
                    }
                }
                None => {}
            },
            _ = tokio::time::sleep(attempt_delay), if can_start_more => {
                if let Some(address) = pending.next() {
                    attempts.spawn(attempt(address, attempt_timeout));
                }
            }
        }
    }
}

pub async fn connect_host(host: &str, port: u16) -> io::Result<TcpStream> {
    let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host, port)).await?.collect();
    connect_first(addresses, ATTEMPT_DELAY, ATTEMPT_TIMEOUT).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
    use std::time::Instant;
    use tokio::net::TcpListener;

    fn v4(last: u8, port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 0, 2, last)), port)
    }

    fn v6(last: u16, port: u16) -> SocketAddr {
        SocketAddr::new(IpAddr::V6(Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, last)), port)
    }

    #[test]
    fn alternates_families_starting_with_the_resolver_first_choice() {
        let ordered = interleave_families(vec![v6(1, 443), v6(2, 443), v6(3, 443), v4(1, 443)]);
        assert_eq!(ordered, vec![v6(1, 443), v4(1, 443), v6(2, 443), v6(3, 443)]);

        let ordered = interleave_families(vec![v4(1, 443), v4(2, 443), v6(1, 443), v6(2, 443)]);
        assert_eq!(ordered, vec![v4(1, 443), v6(1, 443), v4(2, 443), v6(2, 443)]);
    }

    #[test]
    fn drops_duplicate_addresses() {
        let ordered = interleave_families(vec![v4(1, 443), v4(1, 443), v6(1, 443)]);
        assert_eq!(ordered, vec![v4(1, 443), v6(1, 443)]);
    }

    #[test]
    fn keeps_an_empty_list_empty() {
        assert!(interleave_families(Vec::new()).is_empty());
    }

    #[tokio::test]
    async fn empty_address_list_fails() {
        let result = connect_first(Vec::new(), ATTEMPT_DELAY, ATTEMPT_TIMEOUT).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn reaches_ipv4_when_the_first_ipv6_address_never_answers() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let reachable = listener.local_addr().unwrap();
        let accept = tokio::spawn(async move { listener.accept().await.map(|_| ()) });

        let unreachable = v6(1, 9);
        let started = Instant::now();
        let stream = connect_first(
            vec![unreachable, reachable],
            Duration::from_millis(100),
            Duration::from_secs(30),
        )
        .await
        .expect("connects over IPv4");

        assert_eq!(stream.peer_addr().unwrap(), reachable);
        assert!(started.elapsed() < Duration::from_secs(5));
        accept.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn does_not_wait_out_an_address_that_drops_packets() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let reachable = listener.local_addr().unwrap();
        let accept = tokio::spawn(async move { listener.accept().await.map(|_| ()) });

        let silent_v6 = v6(1, 9);
        let silent_v4 = v4(1, 9);
        let started = Instant::now();
        let stream = connect_first(
            vec![silent_v6, silent_v4, reachable],
            Duration::from_millis(100),
            Duration::from_secs(30),
        )
        .await
        .expect("connects to the reachable address");

        assert_eq!(stream.peer_addr().unwrap(), reachable);
        assert!(started.elapsed() < Duration::from_secs(5));
        accept.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn moves_on_at_once_when_an_address_refuses() {
        let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let refused = closed.local_addr().unwrap();
        drop(closed);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let reachable = listener.local_addr().unwrap();
        let accept = tokio::spawn(async move { listener.accept().await.map(|_| ()) });

        let stream = connect_first(
            vec![refused, reachable],
            Duration::from_secs(60),
            Duration::from_secs(30),
        )
        .await
        .expect("falls through to the open address");

        assert_eq!(stream.peer_addr().unwrap(), reachable);
        accept.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn reports_failure_when_every_address_refuses() {
        let closed = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let refused = closed.local_addr().unwrap();
        drop(closed);

        let result = connect_first(
            vec![refused],
            Duration::from_millis(50),
            Duration::from_secs(5),
        )
        .await;
        assert!(result.is_err());
    }
}
