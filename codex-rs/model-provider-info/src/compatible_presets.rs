//! Connection templates contain endpoint defaults, never a stale list of model IDs.
#[derive(Debug, Clone, Copy)]
pub struct CompatibleProviderPreset {
    pub id: &'static str,
    pub name: &'static str,
    pub base_url: &'static str,
    pub api_key_required: bool,
    pub documentation: &'static str,
}

pub const COMPATIBLE_PROVIDER_PRESETS: &[CompatibleProviderPreset] = &[
    CompatibleProviderPreset {
        id: "openai-api",
        name: "OpenAI API",
        base_url: "https://api.openai.com/v1",
        api_key_required: true,
        documentation: "https://platform.openai.com/docs/api-reference",
    },
    CompatibleProviderPreset {
        id: "openrouter",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api_key_required: true,
        documentation: "https://openrouter.ai/docs/api/api-reference/models/get-models",
    },
    CompatibleProviderPreset {
        id: "groq",
        name: "Groq",
        base_url: "https://api.groq.com/openai/v1",
        api_key_required: true,
        documentation: "https://console.groq.com/docs/openai",
    },
    CompatibleProviderPreset {
        id: "deepseek",
        name: "DeepSeek",
        base_url: "https://api.deepseek.com",
        api_key_required: true,
        documentation: "https://api-docs.deepseek.com/",
    },
    CompatibleProviderPreset {
        id: "together",
        name: "Together AI",
        base_url: "https://api.together.ai/v1",
        api_key_required: true,
        documentation: "https://docs.together.ai/docs/inference/openai-compatibility",
    },
    CompatibleProviderPreset {
        id: "fireworks",
        name: "Fireworks AI",
        base_url: "https://api.fireworks.ai/inference/v1",
        api_key_required: true,
        documentation: "https://docs.fireworks.ai/tools-sdks/openai-compatibility",
    },
    CompatibleProviderPreset {
        id: "cerebras",
        name: "Cerebras",
        base_url: "https://api.cerebras.ai/v1",
        api_key_required: true,
        documentation: "https://inference-docs.cerebras.ai/resources/openai",
    },
    CompatibleProviderPreset {
        id: "mistral",
        name: "Mistral",
        base_url: "https://api.mistral.ai/v1",
        api_key_required: true,
        documentation: "https://docs.mistral.ai/resources/migration-guides",
    },
    CompatibleProviderPreset {
        id: "xai",
        name: "xAI",
        base_url: "https://api.x.ai/v1",
        api_key_required: true,
        documentation: "https://docs.x.ai/docs/api-reference",
    },
    CompatibleProviderPreset {
        id: "nvidia",
        name: "NVIDIA NIM",
        base_url: "https://integrate.api.nvidia.com/v1",
        api_key_required: true,
        documentation: "https://docs.api.nvidia.com/nim/reference/llm-apis",
    },
    CompatibleProviderPreset {
        id: "huggingface",
        name: "Hugging Face",
        base_url: "https://router.huggingface.co/v1",
        api_key_required: true,
        documentation: "https://huggingface.co/docs/inference-providers/tasks/chat-completion",
    },
    CompatibleProviderPreset {
        id: "ollama-api",
        name: "Ollama (OpenAI compatible)",
        base_url: "http://localhost:11434/v1",
        api_key_required: false,
        documentation: "https://docs.ollama.com/api/openai-compatibility",
    },
    CompatibleProviderPreset {
        id: "lmstudio-api",
        name: "LM Studio (OpenAI compatible)",
        base_url: "http://localhost:1234/v1",
        api_key_required: false,
        documentation: "https://lmstudio.ai/docs/developer/openai-compat",
    },
];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn presets_have_unique_ids_and_safe_endpoints() {
        let mut ids = std::collections::HashSet::new();
        for preset in COMPATIBLE_PROVIDER_PRESETS {
            assert!(ids.insert(preset.id));
            assert!(!preset.name.is_empty());
            assert!(preset.base_url.starts_with(if preset.api_key_required {
                "https://"
            } else {
                "http://localhost:"
            }));
        }
        assert!(ids.len() >= 12);
    }
}
