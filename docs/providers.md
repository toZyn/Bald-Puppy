# Proveedores compatibles con OpenAI

Bald Puppy permite conectar endpoints compatibles con OpenAI v1 y elegir sus modelos desde la terminal.

## Conectar un proveedor

1. Ejecuta `/connect` dentro del agente.
2. Elige un proveedor preconfigurado o **Create a custom provider or gateway**.
3. Completa los campos y guarda. Los servicios preconfigurados solicitan su API key; los servidores locales solicitan la dirección, con el valor habitual ya completado.
4. Usa `/new` para abrir un chat con la nueva conexión y `/model` para elegir un modelo de su catálogo.

El primer inicio también ofrece la configuración de proveedores compatibles, sin exigir una cuenta de ChatGPT. Las políticas administradas y los proveedores fijados mediante argumentos siguen teniendo prioridad.

Las conversaciones existentes conservan su proveedor. Al conectar uno nuevo se elimina el modelo global anterior para evitar enviar un identificador de otro servicio.

## Proveedores preconfigurados

| Proveedor    | URL base                                |
| ------------ | --------------------------------------- |
| OpenAI API   | `https://api.openai.com/v1`             |
| OpenRouter   | `https://openrouter.ai/api/v1`          |
| Groq         | `https://api.groq.com/openai/v1`        |
| DeepSeek     | `https://api.deepseek.com`              |
| Together AI  | `https://api.together.ai/v1`            |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` |
| Cerebras     | `https://api.cerebras.ai/v1`            |
| Mistral      | `https://api.mistral.ai/v1`             |
| xAI          | `https://api.x.ai/v1`                   |
| NVIDIA NIM   | `https://integrate.api.nvidia.com/v1`   |
| Hugging Face | `https://router.huggingface.co/v1`      |
| Ollama       | `http://localhost:11434/v1`             |
| LM Studio    | `http://localhost:1234/v1`              |

Los endpoints y sus referencias oficiales están centralizados en `codex-rs/model-provider-info/src/compatible_presets.rs`. La lista de modelos se obtiene del proveedor; no se mantiene una lista fija de nombres. Que un modelo aparezca en `/models` no garantiza permisos, saldo ni soporte de herramientas: el servicio decide qué permite ejecutar.

## Proveedor personalizado

Indica nombre, URL base y una API key o el nombre de una variable de entorno del servidor. Usa la URL base que indique tu proveedor; el agente añade `/models` y `/chat/completions` sin duplicar `/v1`.

El protocolo predeterminado de las conexiones nuevas es `chat`. Puedes elegir `responses` para endpoints que implementen esa API. Las configuraciones antiguas que omiten `wire_api` conservan Responses.

También puedes configurar un proveedor mediante `~/.codex/config.toml`:

```toml
model_provider = "private"

[model_providers.private]
name = "Private endpoint"
base_url = "http://localhost:8000/v1"
wire_api = "chat"
# Opcional para servidores que requieren autenticación:
env_key = "PRIVATE_API_KEY"
```

La variable debe existir en el proceso del servidor del agente. Una clave introducida directamente en el formulario se guarda en la configuración de ese servidor, con los permisos privados del escritor de configuración en Unix. No se devuelve en las listas de proveedores, lecturas públicas de configuración ni representaciones de depuración. Los formularios ocultan su contenido. En conexiones remotas, `localhost` se refiere al servidor, no al teléfono o equipo del cliente.

## Compatibilidad y errores

Chat Completions admite streaming, mensajes de texto, imágenes en el formato estándar, funciones, herramientas personalizadas y espacios de nombres traducidos a llamadas de función. Las herramientas alojadas exclusivas de Responses, la compactación remota y WebSockets no se anuncian para conexiones `chat`.

El catálogo estándar aporta identificadores, no todas las capacidades de cada modelo. Por eso se usa texto y un contexto conservador de 8192 tokens cuando el servidor no publica `context_length`. Puedes ajustar el contexto en la configuración si conoces el límite real.

Un proveedor personalizado necesita un endpoint `/models` compatible para la selección automática. Si no devuelve modelos, no se sustituyen por modelos de OpenAI. Los errores HTTP, desconexiones, streams incompletos y límites de salida se notifican como errores; no se presentan como respuestas completas.
