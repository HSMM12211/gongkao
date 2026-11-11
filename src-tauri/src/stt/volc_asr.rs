use std::io::{ErrorKind, Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::{Duration, Instant};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::Serialize;
use serde_json::{json, Value};
use tungstenite::client::IntoClientRequest;
use tungstenite::http::{HeaderMap, HeaderValue};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Error as WsError, Message, WebSocket};
use uuid::Uuid;

use super::errors::{SttError, SttResult};

const PROTOCOL_VERSION: u8 = 0x1;
const DEFAULT_HEADER_SIZE: u8 = 0x1;

const CLIENT_FULL_REQUEST: u8 = 0x1;
const CLIENT_AUDIO_ONLY_REQUEST: u8 = 0x2;
const SERVER_FULL_RESPONSE: u8 = 0x9;
const SERVER_ACK: u8 = 0xB;
const SERVER_ERROR_RESPONSE: u8 = 0xF;

const POS_SEQUENCE: u8 = 0x1;
const NEG_SEQUENCE: u8 = 0x3;

const NO_SERIALIZATION: u8 = 0x0;
const JSON_SERIALIZATION: u8 = 0x1;
const GZIP_COMPRESSION: u8 = 0x1;

const DEFAULT_CHUNK_MS: usize = 200;
const READ_TIMEOUT_MS: u64 = 700;
const SEND_READ_TIMEOUT_MS: u64 = 25;
const AUDIO_SEND_INTERVAL_MS: u64 = 100;
const FINAL_READ_ATTEMPTS: usize = 40;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolcAsrConnectionTest {
    pub ok: bool,
    pub message: String,
    pub request_id: String,
    pub log_id: Option<String>,
    pub connect_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolcAsrTranscription {
    pub text: String,
    pub request_id: String,
    pub log_id: Option<String>,
}

pub fn test_connection(
    endpoint: &str,
    api_key: &str,
    resource_id: &str,
) -> SttResult<VolcAsrConnectionTest> {
    let request_id = Uuid::new_v4().to_string();
    let (mut socket, headers) = connect_volc_socket(endpoint, api_key, resource_id, &request_id)?;
    let _ = socket.close(None);

    Ok(VolcAsrConnectionTest {
        ok: true,
        message: "Volc ASR WebSocket connected.".into(),
        request_id,
        log_id: header_to_string(&headers, "X-Tt-Logid"),
        connect_id: header_to_string(&headers, "X-Api-Connect-Id"),
    })
}

pub fn transcribe_pcm(
    endpoint: &str,
    api_key: &str,
    resource_id: &str,
    audio_pcm: Vec<u8>,
    sample_rate: u32,
) -> SttResult<VolcAsrTranscription> {
    if audio_pcm.is_empty() {
        return Err(SttError::NoSpeechDetected);
    }

    let request_id = Uuid::new_v4().to_string();
    let (mut socket, headers) = connect_volc_socket(endpoint, api_key, resource_id, &request_id)?;
    set_socket_timeouts(&mut socket, Duration::from_millis(READ_TIMEOUT_MS));

    let audio_wav = pcm16_to_wav(&audio_pcm, sample_rate);
    let full_request = build_full_client_request(sample_rate)?;
    socket
        .send(Message::Binary(full_request.into()))
        .map_err(map_ws_error)?;
    drain_available_responses(&mut socket)?;
    set_socket_timeouts(&mut socket, Duration::from_millis(SEND_READ_TIMEOUT_MS));

    let chunk_size = pcm_chunk_size(sample_rate, DEFAULT_CHUNK_MS);
    let mut latest_text = String::new();
    let mut sequence = 1_i32;
    let chunks: Vec<&[u8]> = audio_wav.chunks(chunk_size).collect();

    for (index, chunk) in chunks.iter().enumerate() {
        let sent_at = Instant::now();
        sequence += 1;
        let is_last = index + 1 == chunks.len();
        let packet = build_audio_only_request(chunk, sequence, is_last)?;
        socket
            .send(Message::Binary(packet.into()))
            .map_err(map_ws_error)?;
        if let Some(text) = read_available_text(&mut socket)? {
            latest_text = text;
        }
        if !is_last {
            let elapsed = sent_at.elapsed();
            let interval = Duration::from_millis(AUDIO_SEND_INTERVAL_MS);
            if elapsed < interval {
                thread::sleep(interval - elapsed);
            }
        }
    }

    set_socket_timeouts(&mut socket, Duration::from_millis(READ_TIMEOUT_MS));
    for _ in 0..FINAL_READ_ATTEMPTS {
        match read_next_text(&mut socket) {
            Ok(Some(text)) => latest_text = text,
            Ok(None) => {
                if latest_text.trim().is_empty() {
                    continue;
                }
                break;
            }
            Err(SttError::RuntimeFailed(message)) if is_transient_read_timeout(&message) => {
                if latest_text.trim().is_empty() {
                    continue;
                }
                break;
            }
            Err(error) => return Err(error),
        }
    }

    let _ = socket.close(None);

    if latest_text.trim().is_empty() {
        return Err(SttError::RuntimeFailed(
            "Volc ASR did not return recognized text.".into(),
        ));
    }

    Ok(VolcAsrTranscription {
        text: normalize_to_simplified_chinese(latest_text.trim()),
        request_id,
        log_id: header_to_string(&headers, "X-Tt-Logid"),
    })
}

fn connect_volc_socket(
    endpoint: &str,
    api_key: &str,
    resource_id: &str,
    request_id: &str,
) -> SttResult<(WebSocket<MaybeTlsStream<TcpStream>>, HeaderMap)> {
    let mut request = endpoint
        .into_client_request()
        .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
    let host = request
        .uri()
        .host()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "unknown-host".into());
    let port = request.uri().port_u16().unwrap_or(443);

    let headers = request.headers_mut();
    headers.insert("X-Api-Key", header_value(api_key)?);
    headers.insert("X-Api-Resource-Id", header_value(resource_id)?);
    headers.insert("X-Api-Request-Id", header_value(request_id)?);
    headers.insert("X-Api-Connect-Id", header_value(request_id)?);
    headers.insert("X-Api-Sequence", HeaderValue::from_static("-1"));

    let (socket, response) =
        connect(request).map_err(|error| map_volc_connect_error(error, endpoint, &host, port))?;
    Ok((socket, response.headers().clone()))
}

fn header_value(value: &str) -> SttResult<HeaderValue> {
    HeaderValue::from_str(value)
        .map_err(|error| SttError::RuntimeFailed(format!("invalid Volc ASR header value: {error}")))
}

fn header_to_string(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned)
}

fn build_full_client_request(sample_rate: u32) -> SttResult<Vec<u8>> {
    let payload = json!({
        "user": {
            "uid": "gongkao-desktop"
        },
        "audio": {
            "format": "wav",
            "codec": "raw",
            "rate": sample_rate,
            "bits": 16,
            "channel": 1
        },
        "request": {
            "model_name": "bigmodel",
            "enable_punc": true,
            "enable_itn": true,
            "result_type": "full"
        }
    });

    let payload = gzip_bytes(payload.to_string().as_bytes())?;
    Ok(build_packet(
        CLIENT_FULL_REQUEST,
        POS_SEQUENCE,
        JSON_SERIALIZATION,
        GZIP_COMPRESSION,
        Some(1),
        &payload,
    ))
}

fn build_audio_only_request(chunk: &[u8], sequence: i32, is_last: bool) -> SttResult<Vec<u8>> {
    let payload = gzip_bytes(chunk)?;
    let flag = if is_last { NEG_SEQUENCE } else { POS_SEQUENCE };
    let sequence = if is_last {
        -sequence.abs()
    } else {
        sequence.abs()
    };
    Ok(build_packet(
        CLIENT_AUDIO_ONLY_REQUEST,
        flag,
        NO_SERIALIZATION,
        GZIP_COMPRESSION,
        Some(sequence),
        &payload,
    ))
}

fn build_packet(
    message_type: u8,
    flags: u8,
    serialization: u8,
    compression: u8,
    sequence: Option<i32>,
    payload: &[u8],
) -> Vec<u8> {
    let mut packet = Vec::with_capacity(12 + payload.len());
    packet.push((PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE);
    packet.push((message_type << 4) | flags);
    packet.push((serialization << 4) | compression);
    packet.push(0);

    if let Some(sequence) = sequence {
        packet.extend_from_slice(&sequence.to_be_bytes());
    }

    packet.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    packet.extend_from_slice(payload);
    packet
}

fn parse_response_packet(packet: &[u8]) -> SttResult<Option<String>> {
    if packet.len() < 4 {
        return Err(SttError::RuntimeFailed(
            "Volc ASR returned a malformed packet.".into(),
        ));
    }

    let header_size = ((packet[0] & 0x0f) as usize) * 4;
    if packet.len() < header_size {
        return Err(SttError::RuntimeFailed(
            "Volc ASR returned an incomplete packet header.".into(),
        ));
    }

    let message_type = packet[1] >> 4;
    let flags = packet[1] & 0x0f;
    let serialization = packet[2] >> 4;
    let compression = packet[2] & 0x0f;
    let mut offset = header_size;

    if has_sequence(flags) && packet.len() >= offset + 4 {
        offset += 4;
    }

    if has_event(flags) && packet.len() >= offset + 4 {
        offset += 4;
    }

    if message_type == SERVER_ERROR_RESPONSE {
        let code = read_i32(packet, &mut offset).unwrap_or_default();
        let message = read_payload(packet, &mut offset, compression)
            .and_then(|payload| String::from_utf8(payload).ok())
            .unwrap_or_else(|| "unknown Volc ASR server error".into());
        return Err(SttError::RuntimeFailed(format!(
            "Volc ASR server error {code}: {message}"
        )));
    }

    if message_type != SERVER_FULL_RESPONSE && message_type != SERVER_ACK {
        return Ok(None);
    }

    let Some(payload) = read_payload(packet, &mut offset, compression) else {
        return Ok(None);
    };

    if serialization != JSON_SERIALIZATION {
        return Ok(None);
    }

    let data: Value = serde_json::from_slice(&payload)
        .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
    Ok(extract_transcription_text(&data))
}

fn has_sequence(flags: u8) -> bool {
    flags & 0x01 != 0
}

fn has_event(flags: u8) -> bool {
    flags & 0x04 != 0
}

fn read_i32(packet: &[u8], offset: &mut usize) -> Option<i32> {
    if packet.len() < *offset + 4 {
        return None;
    }
    let value = i32::from_be_bytes(packet[*offset..*offset + 4].try_into().ok()?);
    *offset += 4;
    Some(value)
}

fn read_payload(packet: &[u8], offset: &mut usize, compression: u8) -> Option<Vec<u8>> {
    let size = read_i32(packet, offset)? as usize;
    if packet.len() < *offset + size {
        return None;
    }
    let payload = packet[*offset..*offset + size].to_vec();
    *offset += size;
    if compression == GZIP_COMPRESSION {
        gunzip_bytes(&payload).ok()
    } else {
        Some(payload)
    }
}

fn extract_transcription_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        Value::Array(items) => items.iter().find_map(extract_transcription_text),
        Value::Object(map) => {
            for key in ["text", "transcript", "result_text"] {
                if let Some(text) = map.get(key).and_then(extract_transcription_text) {
                    return Some(text);
                }
            }
            for key in ["result", "data", "payload"] {
                if let Some(text) = map.get(key).and_then(extract_transcription_text) {
                    return Some(text);
                }
            }
            map.values().find_map(extract_transcription_text)
        }
        _ => None,
    }
}

fn gzip_bytes(input: &[u8]) -> SttResult<Vec<u8>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(input)
        .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
    encoder
        .finish()
        .map_err(|error| SttError::RuntimeFailed(error.to_string()))
}

fn gunzip_bytes(input: &[u8]) -> SttResult<Vec<u8>> {
    let mut decoder = GzDecoder::new(input);
    let mut output = Vec::new();
    decoder
        .read_to_end(&mut output)
        .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
    Ok(output)
}

fn pcm_chunk_size(sample_rate: u32, chunk_ms: usize) -> usize {
    let bytes_per_sample = 2_usize;
    let samples = (sample_rate as usize).saturating_mul(chunk_ms).max(1000) / 1000;
    samples.max(1) * bytes_per_sample
}

fn pcm16_to_wav(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
    let data_len = pcm.len() as u32;
    let riff_len = 36_u32.saturating_add(data_len);
    let byte_rate = sample_rate.saturating_mul(2);
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_len.to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

fn normalize_to_simplified_chinese(text: &str) -> String {
    character_converter::traditional_to_simplified(text).into_owned()
}

fn set_socket_timeouts(socket: &mut WebSocket<MaybeTlsStream<TcpStream>>, timeout: Duration) {
    match socket.get_mut() {
        MaybeTlsStream::Plain(stream) => {
            let _ = stream.set_read_timeout(Some(timeout));
            let _ = stream.set_write_timeout(Some(timeout));
        }
        MaybeTlsStream::Rustls(stream) => {
            let _ = stream.get_ref().set_read_timeout(Some(timeout));
            let _ = stream.get_ref().set_write_timeout(Some(timeout));
        }
        _ => {}
    }
}

fn drain_available_responses(socket: &mut WebSocket<MaybeTlsStream<TcpStream>>) -> SttResult<()> {
    loop {
        match read_next_text(socket) {
            Ok(_) => {}
            Err(SttError::RuntimeFailed(message)) if is_transient_read_timeout(&message) => {
                return Ok(())
            }
            Err(error) => return Err(error),
        }
    }
}

fn read_available_text(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) -> SttResult<Option<String>> {
    match read_next_text(socket) {
        Ok(text) => Ok(text),
        Err(SttError::RuntimeFailed(message)) if is_transient_read_timeout(&message) => Ok(None),
        Err(error) => Err(error),
    }
}

fn is_transient_read_timeout(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("timed out")
        || lower.contains("operation would block")
        || lower.contains("os error 10060")
        || message.contains("超时")
        || message.contains("未及时返回")
}

fn read_next_text(socket: &mut WebSocket<MaybeTlsStream<TcpStream>>) -> SttResult<Option<String>> {
    match socket.read() {
        Ok(Message::Binary(payload)) => parse_response_packet(&payload),
        Ok(Message::Text(text)) => {
            let data: Value = serde_json::from_str(&text)
                .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
            Ok(extract_transcription_text(&data))
        }
        Ok(Message::Close(_)) => Ok(None),
        Ok(_) => Ok(None),
        Err(error) => Err(map_ws_error(error)),
    }
}

fn map_ws_error(error: WsError) -> SttError {
    match error {
        WsError::Http(response) => SttError::RuntimeFailed(format!(
            "Volc ASR handshake failed: HTTP {}",
            response.status()
        )),
        WsError::Io(error)
            if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) =>
        {
            SttError::RuntimeFailed(format!(
                "火山 ASR 通信超时：WebSocket 已建立但服务端未及时返回识别结果。请确认网络/代理稳定、Resource ID 与开通服务一致，并重试。原始错误：{error}"
            ))
        }
        other => SttError::RuntimeFailed(format!("Volc ASR websocket failed: {other}")),
    }
}

fn map_volc_connect_error(error: WsError, endpoint: &str, host: &str, port: u16) -> SttError {
    match error {
        WsError::Io(io_error)
            if matches!(
                io_error.kind(),
                ErrorKind::TimedOut | ErrorKind::WouldBlock | ErrorKind::ConnectionRefused
            ) =>
        {
            SttError::RuntimeFailed(format!(
                "火山 ASR 连接超时：无法连接 {host}:{port}（{endpoint}）。请确认 Endpoint 使用官方地址 wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async，并检查网络或代理是否允许访问 openspeech.bytedance.com。原始错误：{io_error}"
            ))
        }
        WsError::Http(response) => {
            let log_id = response
                .headers()
                .get("X-Tt-Logid")
                .and_then(|value| value.to_str().ok())
                .map(|value| format!("，LogId: {value}"))
                .unwrap_or_default();
            SttError::RuntimeFailed(format!(
                "Volc ASR handshake failed: HTTP {}{log_id}",
                response.status()
            ))
        }
        other => SttError::RuntimeFailed(format!(
            "Volc ASR websocket failed while connecting {host}:{port}（{endpoint}）: {other}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_audio_only_request, build_full_client_request, build_packet, gunzip_bytes,
        is_transient_read_timeout, parse_response_packet, GZIP_COMPRESSION, JSON_SERIALIZATION,
        NEG_SEQUENCE, POS_SEQUENCE, SERVER_FULL_RESPONSE,
    };
    use serde_json::Value;

    #[test]
    fn builds_full_request_with_gzipped_json_payload() {
        let packet = build_full_client_request(16_000).expect("packet");

        assert_eq!(packet[0], 0x11);
        assert_eq!(packet[1], 0x11);
        assert_eq!(packet[2], 0x11);
        assert_eq!(i32::from_be_bytes(packet[4..8].try_into().unwrap()), 1);

        let payload_size = u32::from_be_bytes(packet[8..12].try_into().unwrap()) as usize;
        let payload = gunzip_bytes(&packet[12..12 + payload_size]).expect("gzip");
        let json: Value = serde_json::from_slice(&payload).expect("json");
        assert_eq!(json["audio"]["format"], "wav");
        assert_eq!(json["audio"]["rate"], 16_000);
        assert_eq!(json["request"]["model_name"], "bigmodel");
    }

    #[test]
    fn wraps_pcm16_audio_as_wav_for_volc_demo_compatible_upload() {
        let wav = super::pcm16_to_wav(&[1, 2, 3, 4], 16_000);

        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 4);
        assert_eq!(&wav[44..], &[1, 2, 3, 4]);
    }

    #[test]
    fn marks_last_audio_packet_with_negative_sequence() {
        let packet = build_audio_only_request(&[1, 2, 3, 4], 7, true).expect("packet");

        assert_eq!(packet[1] & 0x0f, NEG_SEQUENCE);
        assert_eq!(i32::from_be_bytes(packet[4..8].try_into().unwrap()), -7);

        let packet = build_audio_only_request(&[1, 2, 3, 4], 6, false).expect("packet");
        assert_eq!(packet[1] & 0x0f, POS_SEQUENCE);
        assert_eq!(i32::from_be_bytes(packet[4..8].try_into().unwrap()), 6);
    }

    #[test]
    fn parses_text_from_server_full_response() {
        let payload =
            super::gzip_bytes(r#"{"result":{"text":"我们顶峰相见"}}"#.as_bytes()).expect("gzip");
        let packet = build_packet(
            SERVER_FULL_RESPONSE,
            0,
            JSON_SERIALIZATION,
            GZIP_COMPRESSION,
            None,
            &payload,
        );

        let text = parse_response_packet(&packet).expect("parse");
        assert_eq!(text.as_deref(), Some("我们顶峰相见"));
    }

    #[test]
    fn parses_text_from_server_response_with_sequence_and_event_flags() {
        let payload =
            super::gzip_bytes(r#"{"result":{"text":"此心光明"}}"#.as_bytes()).expect("gzip");
        let mut packet = vec![0x11, (SERVER_FULL_RESPONSE << 4) | 0x5, 0x11, 0x00];
        packet.extend_from_slice(&2_i32.to_be_bytes());
        packet.extend_from_slice(&100_i32.to_be_bytes());
        packet.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        packet.extend_from_slice(&payload);

        let text = parse_response_packet(&packet).expect("parse");
        assert_eq!(text.as_deref(), Some("此心光明"));
    }

    #[test]
    fn treats_windows_os_10060_as_transient_read_timeout() {
        assert!(is_transient_read_timeout(
            "Volc ASR communication timed out: the connected party did not properly respond after a period of time. (os error 10060)"
        ));
    }

    #[test]
    #[ignore]
    fn live_volc_handshake_works_with_env_key() {
        let api_key = std::env::var("VOLC_ASR_API_KEY").expect("VOLC_ASR_API_KEY");
        let endpoint = std::env::var("VOLC_ASR_ENDPOINT")
            .unwrap_or_else(|_| "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async".into());
        let resource_id = std::env::var("VOLC_ASR_RESOURCE_ID")
            .unwrap_or_else(|_| "volc.seedasr.sauc.duration".into());

        let result = super::test_connection(&endpoint, &api_key, &resource_id).expect("connect");
        assert!(result.ok);
        assert!(!result.request_id.is_empty());
    }
}
