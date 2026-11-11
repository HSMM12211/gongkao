use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InputDeviceInfo {
    pub id: String,
    pub label: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneDiagnostic {
    pub status: String,
    pub message: String,
    pub default_device: Option<InputDeviceInfo>,
    pub devices: Vec<InputDeviceInfo>,
}

pub fn is_microphone_access_denied(error_message: &str) -> bool {
    let normalized = error_message.to_lowercase();
    normalized.contains("access is denied")
        || normalized.contains("permission denied")
        || normalized.contains("0x80070005")
        || normalized.contains("notallowederror")
}

pub fn is_no_input_device_error(error_message: &str) -> bool {
    let normalized = error_message.to_lowercase();
    normalized.contains("no input device found")
        || normalized.contains("default input device")
        || normalized.contains("device not available")
        || normalized.contains("device is no longer available")
        || normalized.contains("no longer available")
        || normalized.contains("unplugged")
}

pub fn list_input_devices() -> MicrophoneDiagnostic {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|device| {
        device
            .description()
            .ok()
            .map(|desc| desc.name().to_string())
    });

    let mut devices = Vec::new();
    if let Ok(iter) = host.input_devices() {
        for (index, device) in iter.enumerate() {
            let label = device
                .description()
                .map(|desc| desc.name().to_string())
                .unwrap_or_else(|_| format!("Input Device {}", index + 1));
            let is_default = default_name.as_ref().is_some_and(|name| name == &label);
            devices.push(InputDeviceInfo {
                id: format!("input-{index}"),
                label,
                is_default,
            });
        }
    }

    let default_device = devices.iter().find(|device| device.is_default).cloned();
    let status = if devices.is_empty() {
        "mic-not-found"
    } else {
        "ready"
    };
    let message = if devices.is_empty() {
        "未检测到可用的麦克风输入设备。".to_string()
    } else {
        "麦克风输入设备可用。".to_string()
    };

    MicrophoneDiagnostic {
        status: status.to_string(),
        message,
        default_device,
        devices,
    }
}

#[cfg(test)]
mod tests {
    use super::{is_microphone_access_denied, is_no_input_device_error};

    #[test]
    fn detects_windows_access_denied_messages() {
        assert!(is_microphone_access_denied("Access is denied"));
        assert!(is_microphone_access_denied("WASAPI error: 0x80070005"));
    }

    #[test]
    fn detects_permission_denied_messages() {
        assert!(is_microphone_access_denied("permission denied"));
        assert!(is_microphone_access_denied("NotAllowedError"));
    }

    #[test]
    fn ignores_unrelated_permission_messages() {
        assert!(!is_microphone_access_denied("device disconnected"));
    }

    #[test]
    fn detects_missing_input_device_messages() {
        assert!(is_no_input_device_error("No input device found"));
        assert!(is_no_input_device_error("default input device unavailable"));
        assert!(is_no_input_device_error("device not available"));
        assert!(is_no_input_device_error(
            "The requested device is no longer available. For example, it has been unplugged."
        ));
    }

    #[test]
    fn ignores_unrelated_missing_device_messages() {
        assert!(!is_no_input_device_error("permission denied"));
    }
}
