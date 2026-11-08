use super::server::ServerService;
use crate::{
    database::Database,
    error::AppError,
    models::{Server, TerminalOpenRequest},
};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream, ToSocketAddrs},
    time::{Duration, Instant},
};

fn invalid(message: &str) -> AppError {
    AppError::InvalidInput(message.into())
}
pub(crate) fn validate_host(host: &str) -> Result<(), AppError> {
    if host.is_empty()
        || host.len() > 253
        || host.starts_with('-')
        || host.chars().any(|c| c.is_whitespace() || c.is_control())
        || host.contains(['/', '\\', '@'])
    {
        return Err(invalid("主机应为 IP 或域名，不带协议、路径或空白"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_transport_http_connect_preserves_immediate_ssh_banner() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("listen");
        let address = listener.local_addr().expect("address");
        let peer = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("accept");
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .expect("timeout");
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                let mut b = [0];
                socket.read_exact(&mut b).expect("header");
                request.push(b[0]);
            }
            assert!(String::from_utf8(request)
                .expect("utf8")
                .starts_with("CONNECT [::1]:22 HTTP/1.1"));
            socket
                .write_all(b"HTTP/1.1 200 Connection established\r\n\r\nSSH-2.0-test\r\n")
                .expect("reply");
        });
        let mut socket = TcpStream::connect(address).expect("connect");
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .expect("timeout");
        proxy_handshake(&mut socket, "http", "::1", 22).expect("handshake");
        let mut banner = String::new();
        socket.read_to_string(&mut banner).expect("banner");
        assert_eq!(banner, "SSH-2.0-test\r\n");
        peer.join().expect("peer");
    }
    #[test]
    fn server_transport_socks5_uses_proxy_dns_and_checks_failure() {
        for status in [0, 5] {
            let listener = TcpListener::bind(("127.0.0.1", 0)).expect("listen");
            let address = listener.local_addr().expect("address");
            let peer = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().expect("accept");
                socket
                    .set_read_timeout(Some(Duration::from_secs(3)))
                    .expect("timeout");
                let mut hello = [0; 3];
                socket.read_exact(&mut hello).expect("hello");
                assert_eq!(hello, [5, 1, 0]);
                socket.write_all(&[5, 0]).expect("auth");
                let mut request = [0; 18];
                socket.read_exact(&mut request).expect("request");
                assert_eq!(&request[..5], &[5, 1, 0, 3, 11]);
                assert_eq!(&request[5..16], b"example.com");
                assert_eq!(&request[16..], &[0, 22]);
                socket
                    .write_all(&[5, status, 0, 1, 127, 0, 0, 1, 0, 22])
                    .expect("reply");
            });
            let mut socket = TcpStream::connect(address).expect("connect");
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .expect("timeout");
            assert_eq!(
                proxy_handshake(&mut socket, "socks5", "example.com", 22).is_ok(),
                status == 0
            );
            peer.join().expect("peer");
        }
    }
}
pub(crate) fn parse_proxy(value: &str) -> Result<reqwest::Url, AppError> {
    let url = reqwest::Url::parse(if value.contains("://") {
        value
    } else {
        return Err(invalid(
            "连接代理需填写 http://主机:端口 或 socks5://主机:端口",
        ));
    })
    .map_err(|_| invalid("代理地址格式无效"))?;
    if !["http", "socks5"].contains(&url.scheme())
        || url.host_str().is_none()
        || url.port_or_known_default().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/" && !url.path().is_empty()
    {
        return Err(invalid(
            "SSH 连接代理支持无认证 HTTP / SOCKS5 地址，不支持路径或内嵌密码",
        ));
    }
    Ok(url)
}

pub(crate) fn timeout(server: &Server) -> Duration {
    Duration::from_secs(match server.connection_options.network_env.as_str() {
        "lan" => 3,
        "cross_border" => 30,
        "public" => 10,
        _ => 8,
    })
}

pub(crate) fn connect_direct(
    host: &str,
    port: u16,
    timeout: Duration,
) -> Result<TcpStream, AppError> {
    validate_host(host)?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let start = Instant::now();
    let mut last = None;
    for addr in (host, port).to_socket_addrs()? {
        let remaining = timeout.saturating_sub(start.elapsed());
        if remaining.is_zero() {
            break;
        }
        match TcpStream::connect_timeout(&addr, remaining) {
            Ok(stream) => {
                stream.set_nodelay(true)?;
                return Ok(stream);
            }
            Err(e) => last = Some(e),
        }
    }
    Err(AppError::Custom(format!(
        "连接失败：{}",
        last.map(|e| e.to_string())
            .unwrap_or_else(|| "域名无可用地址或连接超时".into())
    )))
}

pub(crate) fn connect(
    db: &Database,
    server: &Server,
    chain: &[i64],
) -> Result<TcpStream, AppError> {
    if let Some(id) = server.bastion_id {
        if chain.len() > 5 || chain.contains(&id) {
            return Err(invalid("跳板机链包含循环或超过 5 跳"));
        }
        if server.use_local_proxy || !server.connection_options.connection_proxy.is_empty() {
            return Err(invalid(
                "跳板机与连接代理不能同时作用于当前目标；请在跳板机配置代理",
            ));
        }
        let mut chain = chain.to_vec();
        chain.push(id);
        let (_, session) = ServerService::connect_terminal_inner(
            db,
            &TerminalOpenRequest {
                server_id: id,
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            &chain,
        )?;
        let mut channel = session
            .channel_direct_tcpip(&server.hostname, server.port as u16, None)
            .map_err(|e| AppError::Custom(format!("跳板机无法连接目标端口：{e}")))?;
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let client = TcpStream::connect(listener.local_addr()?)?;
        let (mut bridge, _) = listener.accept()?;
        // 只接受已经建立的这一个本机 socket，随后关闭监听，不暴露长期隧道端口。
        drop(listener);
        bridge.set_nonblocking(true)?;
        session.set_blocking(false);
        std::thread::Builder::new()
            .name("ssh-bastion-relay".into())
            .spawn(move || {
                let _session = session;
                let _ = relay(&mut bridge, &mut channel);
            })?;
        return Ok(client);
    }
    let proxy = if server.use_local_proxy {
        let value = db
            .get_config("network.proxy_address")?
            .filter(|s| !s.is_empty())
            .ok_or_else(|| invalid("请先在设置 → 网络代理配置本机代理地址"))?;
        if value.contains("://") {
            value
        } else {
            format!("http://{value}")
        }
    } else {
        server.connection_options.connection_proxy.clone()
    };
    let deadline = timeout(server);
    if proxy.is_empty() {
        return connect_direct(&server.hostname, server.port as u16, deadline);
    }
    let url = parse_proxy(&proxy)?;
    let mut stream = connect_direct(
        url.host_str().ok_or_else(|| invalid("代理主机为空"))?,
        url.port_or_known_default()
            .ok_or_else(|| invalid("代理端口为空"))?,
        deadline,
    )?;
    stream.set_read_timeout(Some(deadline))?;
    stream.set_write_timeout(Some(deadline))?;
    proxy_handshake(
        &mut stream,
        url.scheme(),
        &server.hostname,
        server.port as u16,
    )?;
    Ok(stream)
}

fn proxy_handshake(
    stream: &mut TcpStream,
    scheme: &str,
    host: &str,
    port: u16,
) -> Result<(), AppError> {
    validate_host(host)?;
    if scheme == "http" {
        let target = if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]:{port}")
        } else {
            format!("{host}:{port}")
        };
        stream
            .write_all(format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n\r\n").as_bytes())?;
        let mut header = vec![];
        // 每次仅读到 HTTP 头部结束，不吞掉隧道里紧随其后的 SSH banner。
        while !header.ends_with(b"\r\n\r\n") {
            if header.len() >= 8192 {
                return Err(invalid("代理响应头过长"));
            }
            let mut byte = [0];
            stream.read_exact(&mut byte)?;
            header.push(byte[0]);
        }
        let status = String::from_utf8_lossy(&header)
            .lines()
            .next()
            .unwrap_or("")
            .split_whitespace()
            .nth(1)
            .unwrap_or("")
            .to_owned();
        if status != "200" {
            return Err(invalid(
                "HTTP 代理拒绝建立 CONNECT 隧道，请检查代理地址与访问权限",
            ));
        }
    } else {
        stream.write_all(&[5, 1, 0])?;
        let mut answer = [0; 2];
        stream.read_exact(&mut answer)?;
        if answer != [5, 0] {
            return Err(invalid("SOCKS5 代理不支持无认证连接"));
        }
        let host = host.trim_start_matches('[').trim_end_matches(']');
        let mut request = vec![5, 1, 0];
        match host.parse::<std::net::IpAddr>() {
            Ok(std::net::IpAddr::V4(ip)) => {
                request.push(1);
                request.extend(ip.octets());
            }
            Ok(std::net::IpAddr::V6(ip)) => {
                request.push(4);
                request.extend(ip.octets());
            }
            Err(_) => {
                request.extend([3, host.len() as u8]);
                request.extend(host.as_bytes());
            }
        }
        request.extend(port.to_be_bytes());
        stream.write_all(&request)?;
        let mut header = [0; 4];
        stream.read_exact(&mut header)?;
        if header[0] != 5 || header[1] != 0 || header[2] != 0 {
            return Err(invalid("SOCKS5 代理无法连接目标服务器"));
        }
        let length = match header[3] {
            1 => 4,
            4 => 16,
            3 => {
                let mut len = [0];
                stream.read_exact(&mut len)?;
                len[0] as usize
            }
            _ => return Err(invalid("SOCKS5 响应格式无效")),
        };
        let mut rest = vec![0; length + 2];
        stream.read_exact(&mut rest)?;
    }
    Ok(())
}

trait RelayChannel: Read + Write {
    fn close_write(&mut self) -> std::io::Result<()>;
}
impl RelayChannel for ssh2::Channel {
    fn close_write(&mut self) -> std::io::Result<()> {
        self.send_eof().map_err(Into::into)
    }
}

// 分别追踪两侧 EOF，并排空短写缓冲；一侧关闭写入不应截断另一侧的响应。
fn relay(client: &mut TcpStream, channel: &mut impl RelayChannel) -> std::io::Result<()> {
    use std::io::{Error, ErrorKind};
    let mut up = [0u8; 32768];
    let mut down = [0u8; 32768];
    let (mut ul, mut uo, mut dl, mut doff) = (0, 0, 0, 0);
    let (mut client_eof, mut channel_eof, mut sent_eof, mut closed_write) =
        (false, false, false, false);
    loop {
        let mut progressed = false;
        if !client_eof && ul == uo {
            match client.read(&mut up) {
                Ok(0) => {
                    client_eof = true;
                    progressed = true;
                }
                Ok(n) => {
                    ul = n;
                    uo = 0;
                    progressed = true;
                }
                Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {}
                Err(e) => return Err(e),
            }
        }
        if uo < ul {
            match channel.write(&up[uo..ul]) {
                Ok(0) => return Err(Error::new(ErrorKind::WriteZero, "跳板机写入已关闭")),
                Ok(n) => {
                    uo += n;
                    progressed = true;
                }
                Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {}
                Err(e) => return Err(e),
            }
        }
        if client_eof && uo == ul && !sent_eof {
            match channel.close_write() {
                Ok(()) => {
                    sent_eof = true;
                    progressed = true;
                }
                Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {}
                Err(e) => return Err(e),
            }
        }
        if !channel_eof && dl == doff {
            match channel.read(&mut down) {
                Ok(0) => {
                    channel_eof = true;
                    progressed = true;
                }
                Ok(n) => {
                    dl = n;
                    doff = 0;
                    progressed = true;
                }
                Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {}
                Err(e) => return Err(e),
            }
        }
        if doff < dl {
            match client.write(&down[doff..dl]) {
                Ok(0) => return Err(Error::new(ErrorKind::WriteZero, "本机隧道写入已关闭")),
                Ok(n) => {
                    doff += n;
                    progressed = true;
                }
                Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {}
                Err(e) => return Err(e),
            }
        }
        if channel_eof && doff == dl && !closed_write {
            client.shutdown(std::net::Shutdown::Write)?;
            closed_write = true;
            progressed = true;
        }
        if sent_eof && closed_write {
            return Ok(());
        }
        if !progressed {
            std::thread::sleep(Duration::from_millis(3));
        }
    }
}

#[cfg(test)]
mod relay_tests {
    use super::*;
    struct ShortWrites {
        received: Vec<u8>,
        response: std::io::Cursor<Vec<u8>>,
        eof: bool,
    }
    impl Write for ShortWrites {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            let n = bytes.len().min(17);
            self.received.extend_from_slice(&bytes[..n]);
            Ok(n)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    impl Read for ShortWrites {
        fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
            if !self.eof {
                return Err(std::io::ErrorKind::WouldBlock.into());
            }
            self.response.read(bytes)
        }
    }
    impl RelayChannel for ShortWrites {
        fn close_write(&mut self) -> std::io::Result<()> {
            self.eof = true;
            Ok(())
        }
    }
    #[test]
    fn server_transport_relay_drains_response_after_half_close_and_short_writes() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("listen");
        let mut client =
            TcpStream::connect(listener.local_addr().expect("address")).expect("client");
        client
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("timeout");
        let (mut bridge, _) = listener.accept().expect("bridge");
        bridge.set_nonblocking(true).expect("nonblocking");
        let worker = std::thread::spawn(move || {
            let mut channel = ShortWrites {
                received: vec![],
                response: std::io::Cursor::new(vec![2; 100_000]),
                eof: false,
            };
            relay(&mut bridge, &mut channel).expect("relay");
            channel.received
        });
        client.write_all(&vec![1; 70_000]).expect("request");
        client
            .shutdown(std::net::Shutdown::Write)
            .expect("half close");
        let mut output = vec![];
        client.read_to_end(&mut output).expect("response");
        assert_eq!(output, vec![2; 100_000]);
        assert_eq!(worker.join().expect("worker"), vec![1; 70_000]);
    }
}
