use super::*;
use pretty_assertions::assert_eq;
use serde_json::json;

#[test]
fn discovers_public_model_ids_without_openai_fallbacks() {
    let models=decode(json!({"object":"list","data":[{"id":"vendor/coder","context_length":32768},{"id":"local-model"}]})).unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(models[0].slug, "vendor/coder");
    assert_eq!(models[0].context_window, Some(32768));
    assert_eq!(models[1].context_window, Some(8192));
    assert_eq!(models[1].max_context_window, None);
    assert_eq!(
        models[0].visibility,
        codex_protocol::openai_models::ModelVisibility::List
    );
    assert!(!models[0].supports_reasoning_summary_parameter);
}

#[test]
fn rejects_invalid_catalogs_instead_of_showing_fake_models() {
    for value in [
        json!({}),
        json!({"data":[{"id":""}]}),
        json!({"data":[{"id":"x"},{"id":"x"}]}),
        json!({"data":[{"name":"x"}]}),
    ] {
        assert!(decode(value).is_err());
    }
    assert!(decode(json!({"data":[]})).unwrap().is_empty());
}
