//! Translate OpenAI Chat Completions into the agent's response event stream.
//! The adapter is stateless across turns: the entire tool/message history is sent each time.

use crate::ResponseEvent;
use crate::ResponseStream;
use crate::error::ApiError;
use codex_client::StreamResponse;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::TokenUsage;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::time::Duration;
use tokio::sync::mpsc;

#[derive(Clone, Default)]
pub(crate) struct ToolNames(BTreeMap<String, (String, Option<String>, bool)>);

fn invalid(message: impl Into<String>) -> ApiError {
    ApiError::InvalidRequest {
        message: message.into(),
    }
}

/// Returns the exact outgoing body and a reversible mapping for namespaced/custom tools.
pub(crate) fn request(body: Value) -> Result<(Value, ToolNames), ApiError> {
    let mut messages = Vec::new();
    if let Some(instructions) = body["instructions"].as_str().filter(|s| !s.is_empty()) {
        messages.push(json!({"role":"system","content":instructions}));
    }
    let mut names = ToolNames::default();
    let mut tools = Vec::new();
    if let Some(input) = body["tools"].as_array() {
        for tool in input {
            add_tool(tool, None, &mut tools, &mut names)?;
        }
    }
    for item in body["input"]
        .as_array()
        .ok_or_else(|| invalid("Chat input must be an array."))?
    {
        match item["type"].as_str().unwrap_or("message") {
            "message" => {
                let mut message = item.clone();
                let object = message
                    .as_object_mut()
                    .ok_or_else(|| invalid("Invalid message."))?;
                object.retain(|key, _| key == "role" || key == "content");
                if object.get("role").and_then(Value::as_str) == Some("developer") {
                    object.insert("role".into(), json!("system"));
                }
                if let Some(parts) = object.get_mut("content").and_then(Value::as_array_mut) {
                    for part in parts {
                        match part["type"].as_str() {
                            Some("input_text" | "output_text") => {
                                *part = json!({"type":"text","text":part["text"]});
                            }
                            Some("input_image") => {
                                *part = json!({"type":"image_url","image_url":{"url":part["image_url"]}});
                            }
                            Some("text" | "image_url") => {}
                            _ => {
                                return Err(invalid(
                                    "This content type is not supported by Chat Completions.",
                                ));
                            }
                        }
                    }
                }
                messages.push(message);
            }
            kind @ ("function_call" | "custom_tool_call") => {
                let original = item["name"]
                    .as_str()
                    .ok_or_else(|| invalid("Tool call has no name."))?;
                let namespace = item["namespace"].as_str();
                let name = wire_name(original, namespace);
                // Also retain historical tool definitions for decoding tool replies.
                names.0.entry(name.clone()).or_insert((
                    original.into(),
                    namespace.map(str::to_owned),
                    kind == "custom_tool_call",
                ));
                let arguments = if kind == "custom_tool_call" {
                    serde_json::to_string(&json!({"input":item["input"]}))
                        .map_err(|e| invalid(e.to_string()))?
                } else {
                    item["arguments"].as_str().unwrap_or("{}").to_owned()
                };
                let call = json!({"id":item["call_id"],"type":"function","function":{"name":name,"arguments":arguments}});
                // Parallel calls must share one assistant message before their tool results.
                if let Some(calls) = messages
                    .last_mut()
                    .filter(|message| message["role"] == "assistant")
                    .and_then(|message| message.get_mut("tool_calls"))
                    .and_then(Value::as_array_mut)
                {
                    calls.push(call);
                } else {
                    messages.push(json!({"role":"assistant","content":null,"tool_calls":[call]}));
                }
            }
            "function_call_output" | "custom_tool_call_output" => {
                let content = match &item["output"] {
                    Value::String(text) => text.clone(),
                    other => serde_json::to_string(other).map_err(|e| invalid(e.to_string()))?,
                };
                messages
                    .push(json!({"role":"tool","tool_call_id":item["call_id"],"content":content}));
            }
            // Responses-only state is not replayable through the Chat API.
            "reasoning" | "configuration_update" => {}
            other => {
                return Err(invalid(format!(
                    "Cannot replay Responses item '{other}' through Chat Completions. Start a new chat with this provider."
                )));
            }
        }
    }
    let mut result = json!({"model":body["model"],"messages":messages,"stream":true});
    if !tools.is_empty() {
        result["tools"] = tools.into();
        result["tool_choice"] = body
            .get("tool_choice")
            .filter(|value| matches!(value.as_str(), Some("auto" | "none" | "required")))
            .cloned()
            .unwrap_or_else(|| json!("auto"));
        if body["parallel_tool_calls"] == false {
            result["parallel_tool_calls"] = json!(false);
        }
    }
    if let Some(format) = body.get("text").and_then(|text| text.get("format")) {
        match format["type"].as_str() {
            Some("json_object") => result["response_format"] = json!({"type":"json_object"}),
            Some("json_schema") => {
                let mut schema = format.clone();
                if let Some(schema) = schema.as_object_mut() {
                    schema.remove("type");
                }
                result["response_format"] = json!({"type":"json_schema","json_schema":schema});
            }
            Some("text") | None => {}
            _ => {
                return Err(invalid(
                    "Unsupported structured output format for Chat Completions.",
                ));
            }
        }
    }
    // Do not send Responses-only controls (store, include, previous_response_id,
    // reasoning summaries, verbosity, or service tiers) to third-party endpoints.
    Ok((result, names))
}

fn wire_name(name: &str, namespace: Option<&str>) -> String {
    let value = namespace.map_or_else(|| name.to_owned(), |ns| format!("{ns}__{name}"));
    if value.len() <= 64
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return value;
    }
    let hash = value.bytes().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
    });
    format!("bp_tool_{hash:016x}")
}

fn add_tool(
    tool: &Value,
    namespace: Option<&str>,
    tools: &mut Vec<Value>,
    names: &mut ToolNames,
) -> Result<(), ApiError> {
    match tool["type"].as_str() {
        Some("namespace") => {
            let ns = tool["name"]
                .as_str()
                .ok_or_else(|| invalid("Tool namespace has no name."))?;
            for child in tool["tools"]
                .as_array()
                .ok_or_else(|| invalid("Tool namespace has no tools."))?
            {
                add_tool(child, Some(ns), tools, names)?;
            }
        }
        Some(kind @ ("function" | "custom")) => {
            let name = tool["name"]
                .as_str()
                .ok_or_else(|| invalid("Tool has no name."))?;
            let wire = wire_name(name, namespace);
            if wire.len() > 64 || names.0.contains_key(&wire) {
                return Err(invalid(
                    "Tool names must be unique and at most 64 bytes after namespace conversion.",
                ));
            }
            names.0.insert(
                wire.clone(),
                (name.into(), namespace.map(str::to_owned), kind == "custom"),
            );
            let parameters = if kind == "custom" {
                json!({"type":"object","properties":{"input":{"type":"string"}},"required":["input"],"additionalProperties":false})
            } else {
                tool["parameters"].clone()
            };
            tools.push(json!({"type":"function","function":{"name":wire,"description":tool["description"].as_str().unwrap_or_default(),"parameters":parameters}}));
        }
        _ => {
            return Err(invalid(
                "This provider supports function tools only. Disable hosted tools for Chat Completions.",
            ));
        }
    }
    Ok(())
}

#[derive(Default)]
struct ToolCall {
    id: String,
    name: String,
    arguments: String,
}

#[derive(Default)]
struct State {
    id: String,
    text: String,
    text_started: bool,
    calls: BTreeMap<u64, ToolCall>,
    finish: Option<String>,
    usage: Option<TokenUsage>,
    created: bool,
}

impl State {
    fn chunk(&mut self, chunk: Value) -> Result<Vec<ResponseEvent>, ApiError> {
        if chunk.get("error").is_some() {
            return Err(ApiError::Stream(
                "Provider returned an error in the Chat Completions stream.".into(),
            ));
        }
        let mut events = Vec::new();
        if !self.created {
            self.id = chunk["id"].as_str().unwrap_or("chat_completion").to_owned();
            self.created = true;
            events.push(ResponseEvent::Created {
                response_id: Some(self.id.clone()),
            });
        }
        if let Some(usage) = chunk.get("usage").filter(|u| u.is_object()) {
            let input = usage["prompt_tokens"].as_i64().unwrap_or_default();
            let output = usage["completion_tokens"].as_i64().unwrap_or_default();
            self.usage = Some(TokenUsage {
                input_tokens: input,
                output_tokens: output,
                total_tokens: usage["total_tokens"].as_i64().unwrap_or(input + output),
                cached_input_tokens: usage["prompt_tokens_details"]["cached_tokens"]
                    .as_i64()
                    .unwrap_or_default(),
                reasoning_output_tokens: usage["completion_tokens_details"]["reasoning_tokens"]
                    .as_i64()
                    .unwrap_or_default(),
                ..Default::default()
            });
        }
        if let Some(choices) = chunk["choices"].as_array() {
            for choice in choices {
                if choice["index"].as_u64().unwrap_or(0) != 0 {
                    continue;
                }
                let delta = &choice["delta"];
                if let Some(text) = delta["content"]
                    .as_str()
                    .or_else(|| delta["refusal"].as_str())
                {
                    if !self.text_started {
                        events.push(ResponseEvent::OutputItemAdded(message(&self.id, "")?));
                        self.text_started = true;
                    }
                    self.text.push_str(text);
                    events.push(ResponseEvent::OutputTextDelta(text.into()));
                }
                if let Some(calls) = delta["tool_calls"].as_array() {
                    for call in calls {
                        let index = call["index"]
                            .as_u64()
                            .ok_or_else(|| invalid("Tool delta is missing its index."))?;
                        let target = self.calls.entry(index).or_default();
                        if let Some(id) = call["id"].as_str() {
                            target.id.push_str(id);
                        }
                        if let Some(name) = call["function"]["name"].as_str() {
                            target.name.push_str(name);
                        }
                        if let Some(args) = call["function"]["arguments"].as_str() {
                            target.arguments.push_str(args);
                        }
                    }
                }
                if let Some(reason) = choice["finish_reason"].as_str() {
                    self.finish = Some(reason.into());
                }
            }
        }
        Ok(events)
    }

    fn complete(self, names: &ToolNames) -> Result<Vec<ResponseEvent>, ApiError> {
        match self.finish.as_deref() {
            Some("stop" | "tool_calls") => {}
            Some("length") => {
                return Err(invalid(
                    "The provider reached its output token limit. Increase the limit or choose another model.",
                ));
            }
            Some("content_filter") => return Err(ApiError::ContentFilter),
            _ => {
                return Err(ApiError::Stream(
                    "Chat Completions stream ended without a successful finish reason.".into(),
                ));
            }
        }
        let mut events = Vec::new();
        if self.text_started {
            events.push(ResponseEvent::OutputItemDone(message(
                &self.id, &self.text,
            )?));
        }
        let has_tools = !self.calls.is_empty();
        for call in self.calls.into_values() {
            if call.id.is_empty() || call.name.is_empty() {
                return Err(invalid("Provider returned an incomplete tool call."));
            }
            let (name, namespace, custom) = names
                .0
                .get(&call.name)
                .cloned()
                .ok_or_else(|| invalid("Provider returned an unknown tool."))?;
            let value = if custom {
                let args: Value = serde_json::from_str(&call.arguments)
                    .map_err(|_| invalid("Invalid custom-tool arguments from provider."))?;
                let input = args["input"]
                    .as_str()
                    .ok_or_else(|| invalid("Custom tool input must be a string."))?;
                json!({"type":"custom_tool_call","call_id":call.id,"name":name,"namespace":namespace,"input":input})
            } else {
                json!({"type":"function_call","call_id":call.id,"name":name,"namespace":namespace,"arguments":call.arguments})
            };
            let item: ResponseItem = serde_json::from_value(value)
                .map_err(|e| invalid(format!("Invalid tool response: {e}")))?;
            events.push(ResponseEvent::OutputItemAdded(item.clone()));
            events.push(ResponseEvent::OutputItemDone(item));
        }
        events.push(ResponseEvent::Completed {
            response_id: self.id,
            token_usage: self.usage,
            usage_metadata: None,
            reasoning_removals: None,
            end_turn: Some(!has_tools),
        });
        Ok(events)
    }
}

fn message(id: &str, text: &str) -> Result<ResponseItem, ApiError> {
    serde_json::from_value(json!({"type":"message","id":format!("msg_{id}"),"role":"assistant","content":[{"type":"output_text","text":text}]}))
        .map_err(|e| invalid(format!("Invalid assistant message: {e}")))
}

pub(crate) fn spawn(stream: StreamResponse, idle: Duration, names: ToolNames) -> ResponseStream {
    let upstream_request_id = stream
        .headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let (tx, rx_event) = mpsc::channel(160);
    tokio::spawn(async move {
        let mut source = stream.bytes.eventsource();
        let mut state = State::default();
        loop {
            let next = tokio::select! {
                _ = tx.closed() => return,
                next = tokio::time::timeout(idle, source.next()) => next,
            };
            let events = match next {
                Ok(Some(Ok(event))) if event.data.trim() != "[DONE]" => {
                    match serde_json::from_str(&event.data) {
                        Ok(chunk) => state.chunk(chunk),
                        Err(_) => Err(ApiError::Stream(
                            "Invalid JSON in Chat Completions stream.".into(),
                        )),
                    }
                }
                Ok(Some(Ok(_))) | Ok(None) => {
                    match state.complete(&names) {
                        Ok(events) => {
                            for event in events {
                                if tx.send(Ok(event)).await.is_err() {
                                    return;
                                }
                            }
                        }
                        Err(error) => {
                            let _ = tx.send(Err(error)).await;
                        }
                    }
                    return;
                }
                Ok(Some(Err(_))) => Err(ApiError::Stream(
                    "Chat Completions stream disconnected.".into(),
                )),
                Err(_) => Err(ApiError::Stream(
                    "Chat Completions stream timed out.".into(),
                )),
            };
            match events {
                Ok(events) => {
                    for event in events {
                        if tx.send(Ok(event)).await.is_err() {
                            return;
                        }
                    }
                }
                Err(error) => {
                    let _ = tx.send(Err(error)).await;
                    return;
                }
            }
        }
    });
    ResponseStream {
        routing_affinity: None,
        rx_event,
        upstream_request_id,
        interrupt: None,
    }
}

#[cfg(test)]
#[path = "chat_completions_tests.rs"]
mod tests;
