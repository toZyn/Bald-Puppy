//! Fetch picker models without blocking the event loop and keep new-thread defaults in sync.

use super::AppServerSession;
use super::ThreadParamsMode;
use super::model_preset_from_api_model;
use crate::app_event::AppEvent;
use crate::app_event_sender::AppEventSender;
use codex_app_server_client::AppServerRequestHandle;
use codex_app_server_client::TypedRequestError;
use codex_app_server_protocol::ClientRequest;
use codex_app_server_protocol::ModelListParams;
use codex_app_server_protocol::ModelListResponse;
use codex_app_server_protocol::RequestId;
use codex_protocol::openai_models::ModelPreset;
use uuid::Uuid;

impl AppServerSession {
    pub(crate) fn set_available_models(&mut self, models: Vec<ModelPreset>) {
        if let Some(default) = models
            .iter()
            .find(|model| model.is_default)
            .or(models.first())
        {
            self.default_model = Some(default.model.clone());
        }
        self.available_models = models;
    }

    #[cfg(test)]
    pub(crate) fn fetch_models(&self, request_id: Uuid, app_event_tx: AppEventSender) {
        self.fetch_models_for_provider(request_id, app_event_tx, None);
    }

    pub(crate) fn fetch_models_for_provider(
        &self,
        request_id: Uuid,
        app_event_tx: AppEventSender,
        provider: Option<String>,
    ) {
        let models = list_for_provider(
            self.thread_params_mode,
            self.request_handle(),
            RequestId::String(format!("model-list-{request_id}")),
            provider,
        );
        tokio::spawn(async move {
            let result = models.await.map_err(|err| err.to_string());
            app_event_tx.send(AppEvent::ModelsLoaded { request_id, result });
        });
    }
}

pub(super) async fn list(
    mode: ThreadParamsMode,
    request_handle: AppServerRequestHandle,
    request_id: RequestId,
) -> Result<Vec<ModelPreset>, TypedRequestError> {
    list_for_provider(mode, request_handle, request_id, None).await
}

async fn list_for_provider(
    mode: ThreadParamsMode,
    request_handle: AppServerRequestHandle,
    request_id: RequestId,
    provider: Option<String>,
) -> Result<Vec<ModelPreset>, TypedRequestError> {
    let mut models = Vec::new();
    let mut cursor = None;
    loop {
        let response: ModelListResponse = match request_handle
            .request_typed(ClientRequest::ModelList {
                request_id: request_id.clone(),
                params: ModelListParams {
                    cursor: cursor.clone(),
                    limit: None,
                    include_hidden: Some(true),
                    model_provider: provider.clone(),
                },
            })
            .await
        {
            Ok(response) => response,
            // Older Cloud servers do not expose model discovery. Preserve their startup behavior.
            Err(TypedRequestError::Server { source, .. })
                if mode == ThreadParamsMode::Cloud && source.code == -32601 =>
            {
                return Ok(Vec::new());
            }
            Err(error) => return Err(error),
        };
        models.extend(response.data.into_iter().map(model_preset_from_api_model));
        match response.next_cursor {
            Some(next) if cursor.as_ref() != Some(&next) => cursor = Some(next),
            _ => return Ok(models),
        }
    }
}

#[cfg(test)]
#[path = "models_tests.rs"]
mod tests;
