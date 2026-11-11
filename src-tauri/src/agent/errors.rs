use serde::Serialize;
use std::{fmt, io};

pub type AgentResult<T> = Result<T, AgentError>;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AgentError {
    AdapterUnavailable(String),
    InvalidRequest(String),
    Io(String),
    ProcessFailed(String),
    RunNotFound(String),
    SkillNotFound(String),
    OutputMissing(String),
    OutputInvalid(String),
}

impl fmt::Display for AgentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AgentError::AdapterUnavailable(message)
            | AgentError::InvalidRequest(message)
            | AgentError::Io(message)
            | AgentError::ProcessFailed(message)
            | AgentError::RunNotFound(message)
            | AgentError::SkillNotFound(message)
            | AgentError::OutputMissing(message)
            | AgentError::OutputInvalid(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AgentError {}

impl From<io::Error> for AgentError {
    fn from(error: io::Error) -> Self {
        AgentError::Io(error.to_string())
    }
}

impl From<serde_json::Error> for AgentError {
    fn from(error: serde_json::Error) -> Self {
        AgentError::OutputInvalid(error.to_string())
    }
}
