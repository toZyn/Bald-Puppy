use super::*;
use pretty_assertions::assert_eq;

#[test]
fn converts_history_and_parallel_tools_without_responses_controls() {
    let (body, _) = request(json!({"model":"custom/model","instructions":"System", "store":false,"reasoning":{"effort":"high"},"input":[
        {"type":"message","role":"developer","content":[{"type":"input_text","text":"Rules"}]},
        {"type":"function_call","call_id":"one","name":"run","arguments":"{}"},
        {"type":"function_call","call_id":"two","name":"run","arguments":"{}"},
        {"type":"function_call_output","call_id":"one","output":"result"}
    ],"tools":[{"type":"function","name":"run","parameters":{"type":"object"}}]})).unwrap();
    assert_eq!(
        body["messages"][0],
        json!({"role":"system","content":"System"})
    );
    assert_eq!(body["messages"][1]["role"], "system");
    assert_eq!(
        body["messages"][2]["tool_calls"].as_array().unwrap().len(),
        2
    );
    assert_eq!(body["messages"][3]["tool_call_id"], "one");
    assert!(body.get("reasoning").is_none());
    assert!(body.get("store").is_none());
}

#[test]
fn assembles_interleaved_tool_deltas_and_preserves_namespaces() {
    let (_, names) = request(json!({"model":"m","input":[],"tools":[{"type":"namespace","name":"files","tools":[{"type":"function","name":"read","parameters":{"type":"object"}}]}]})).unwrap();
    let mut state = State::default();
    state.chunk(json!({"id":"test","choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"id":"call_b","function":{"name":"files__read","arguments":"{\"p\":"}},{"index":0,"id":"call_a","function":{"name":"files__read","arguments":"{}"}}]}}]})).unwrap();
    state.chunk(json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":1,"function":{"arguments":"\"x\"}"}}]},"finish_reason":"tool_calls"}]})).unwrap();
    let events = state.complete(&names).unwrap();
    let calls: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            ResponseEvent::OutputItemDone(item) => Some(serde_json::to_value(item).unwrap()),
            _ => None,
        })
        .collect();
    assert_eq!(calls[0]["call_id"], "call_a");
    assert_eq!(calls[1]["arguments"], "{\"p\":\"x\"}");
    assert_eq!(calls[1]["namespace"], "files");
    assert!(matches!(
        events.last(),
        Some(ResponseEvent::Completed {
            end_turn: Some(false),
            ..
        })
    ));
}

#[test]
fn converts_custom_tools_back_to_raw_input() {
    let (body, names)=request(json!({"model":"m","input":[],"tools":[{"type":"custom","name":"apply_patch","description":"Edit"}]})).unwrap();
    assert_eq!(
        body["tools"][0]["function"]["parameters"]["required"],
        json!(["input"])
    );
    let mut state = State::default();
    state.chunk(json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"p","function":{"name":"apply_patch","arguments":"{\"input\":\"*** Begin Patch\"}"}}]},"finish_reason":"tool_calls"}]})).unwrap();
    let events = state.complete(&names).unwrap();
    let ResponseEvent::OutputItemDone(item) = &events[1] else {
        panic!("missing tool")
    };
    assert_eq!(
        serde_json::to_value(item).unwrap()["input"],
        "*** Begin Patch"
    );
}

#[test]
fn truncated_or_filtered_stream_is_not_successful() {
    assert!(State::default().complete(&ToolNames::default()).is_err());
    let state = State {
        finish: Some("length".into()),
        ..Default::default()
    };
    assert!(matches!(
        state.complete(&ToolNames::default()),
        Err(ApiError::InvalidRequest { .. })
    ));
    let state = State {
        finish: Some("content_filter".into()),
        ..Default::default()
    };
    assert!(matches!(
        state.complete(&ToolNames::default()),
        Err(ApiError::ContentFilter)
    ));
}

#[tokio::test]
async fn parses_utf8_across_network_chunks_and_completes_text() {
    use bytes::Bytes;
    let payload = "data: {\"id\":\"x\",\"choices\":[{\"delta\":{\"content\":\"¡Hola!\"}}]}\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
    let chunks = payload
        .as_bytes()
        .chunks(3)
        .map(|c| Ok(Bytes::copy_from_slice(c)))
        .collect::<Vec<_>>();
    let stream = StreamResponse {
        status: http::StatusCode::OK,
        headers: Default::default(),
        bytes: Box::pin(futures::stream::iter(chunks)),
    };
    let mut stream = spawn(stream, Duration::from_secs(1), ToolNames::default());
    let mut text = String::new();
    let mut completed = false;
    while let Some(event) = stream.next().await {
        match event.unwrap() {
            ResponseEvent::OutputTextDelta(delta) => text.push_str(&delta),
            ResponseEvent::Completed { .. } => completed = true,
            _ => {}
        }
    }
    assert_eq!(text, "¡Hola!");
    assert!(completed);
}

#[test]
fn rejects_hosted_tools_and_unsupported_history() {
    assert!(request(json!({"model":"m","input":[],"tools":[{"type":"web_search"}]})).is_err());
    assert!(
        request(json!({"model":"m","input":[{"type":"compaction","encrypted_content":"x"}]}))
            .is_err()
    );
}

#[tokio::test]
async fn client_uses_chat_path_auth_and_uncompressed_body() {
    use codex_client::HttpTransport;
    use codex_client::Request;
    use codex_client::Response;
    use codex_client::TransportError;
    use std::sync::Arc;
    use std::sync::Mutex;
    #[derive(Clone)]
    struct Capture(Arc<Mutex<Option<Request>>>);
    impl HttpTransport for Capture {
        async fn execute(&self, _: Request) -> Result<Response, TransportError> {
            panic!("unexpected unary request")
        }
        async fn stream(&self, request: Request) -> Result<StreamResponse, TransportError> {
            *self.0.lock().unwrap() = Some(request);
            let bytes=bytes::Bytes::from_static(b"data: {\"id\":\"x\",\"choices\":[{\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n");
            Ok(StreamResponse {
                status: http::StatusCode::OK,
                headers: Default::default(),
                bytes: Box::pin(futures::stream::iter(vec![Ok(bytes)])),
            })
        }
    }
    struct Auth;
    impl crate::AuthProvider for Auth {
        fn add_auth_headers(&self, headers: &mut http::HeaderMap) -> Result<(), crate::AuthError> {
            headers.insert(
                http::header::AUTHORIZATION,
                "Bearer synthetic".parse().unwrap(),
            );
            Ok(())
        }
    }
    let captured = Arc::new(Mutex::new(None));
    let client = crate::ResponsesClient::new(
        Capture(captured.clone()),
        crate::Provider {
            name: "Test".into(),
            base_url: "https://example.test/openai/v1/".into(),
            query_params: None,
            headers: Default::default(),
            retry: crate::RetryConfig {
                max_attempts: 1,
                base_delay: Duration::ZERO,
                retry_429: false,
                retry_5xx: false,
                retry_transport: false,
            },
            stream_idle_timeout: Duration::from_secs(1),
        },
        Arc::new(Auth),
    )
    .with_chat_completions(true);
    let mut stream=client.stream(json!({"model":"private/coder","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}]}),Default::default(),crate::Compression::Zstd,None).await.unwrap();
    let mut completed = false;
    while let Some(event) = stream.next().await {
        if matches!(event.unwrap(), ResponseEvent::Completed { .. }) {
            completed = true;
        }
    }
    assert!(completed);
    let guard = captured.lock().unwrap();
    let request = guard.as_ref().unwrap();
    assert_eq!(
        request.url,
        "https://example.test/openai/v1/chat/completions"
    );
    assert_eq!(
        request.headers[http::header::AUTHORIZATION],
        "Bearer synthetic"
    );
    assert_eq!(request.compression, codex_client::RequestCompression::None);
    let codex_client::RequestBody::EncodedJson(body) = request.body.as_ref().unwrap() else {
        panic!("expected JSON")
    };
    let body: Value = serde_json::from_slice(body.as_bytes()).unwrap();
    assert_eq!(body["messages"][0]["content"][0]["text"], "hi");
    assert!(body.get("input").is_none());
}

#[test]
fn long_tool_names_have_stable_reversible_ids() {
    let long = "tool_".repeat(30);
    let (_, names)=request(json!({"model":"m","input":[],"tools":[{"type":"function","name":long,"parameters":{"type":"object"}}]})).unwrap();
    let wire = names.0.keys().next().unwrap();
    assert!(wire.len() <= 64);
    assert_eq!(names.0[wire].0, long);
    assert_eq!(*wire, wire_name(&long, None));
}

#[test]
fn preserves_structured_output_and_required_tool_choice() {
    let (body,_) = request(json!({"model":"m","input":[],"tool_choice":"required","parallel_tool_calls":false,
        "tools":[{"type":"function","name":"run","parameters":{"type":"object"}}],
        "text":{"format":{"type":"json_schema","name":"decision","strict":true,"schema":{"type":"object"}}}
    })).unwrap();
    assert_eq!(body["tool_choice"], "required");
    assert_eq!(body["parallel_tool_calls"], false);
    assert_eq!(body["response_format"]["json_schema"]["name"], "decision");
    assert_eq!(
        body["response_format"]["json_schema"]["schema"]["type"],
        "object"
    );
    assert!(body["response_format"]["json_schema"].get("type").is_none());
}
