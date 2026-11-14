//! Decode public OpenAI model lists without inventing provider-specific capabilities.
use codex_protocol::error::CodexErr;
use codex_protocol::error::Result;
use codex_protocol::openai_models::ModelInfo;
use codex_protocol::openai_models::ModelVisibility;
use serde_json::Value;
use std::collections::HashSet;

pub(crate) fn decode(value: Value) -> Result<Vec<ModelInfo>> {
    let invalid = || {
        CodexErr::InvalidRequest(
            "Expected a /models response with a data array of unique, non-empty model IDs.".into(),
        )
    };
    let data = value["data"].as_array().ok_or_else(invalid)?;
    let mut seen = HashSet::new();
    data.iter()
        .map(|entry| {
            let id = entry["id"]
                .as_str()
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(invalid)?;
            if !seen.insert(id) {
                return Err(invalid());
            }
            let mut model = codex_models_manager::model_info::model_info_from_slug(id);
            model.display_name = entry["name"].as_str().unwrap_or(id).to_owned();
            model.description = entry["description"].as_str().map(str::to_owned);
            model.visibility = ModelVisibility::List;
            model.context_window = Some(
                entry["context_length"]
                    .as_i64()
                    .filter(|n| *n > 0)
                    .unwrap_or(8192),
            );
            model.max_context_window = entry["context_length"].as_i64().filter(|n| *n > 0);
            model.supports_reasoning_summary_parameter = false;
            model.default_reasoning_summary = codex_protocol::config_types::ReasoningSummary::None;
            model.supports_search_tool = false;
            // The basic /models API does not advertise vision capability.
            model.input_modalities = vec![codex_protocol::openai_models::InputModality::Text];
            Ok(model)
        })
        .collect()
}

#[cfg(test)]
#[path = "compatible_catalog_tests.rs"]
mod tests;
