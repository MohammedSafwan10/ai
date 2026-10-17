# OpenRouter models

Save your own OpenRouter key in **Settings → Providers**, then use **OpenRouter models** below the provider settings. Privora has no bundled OpenRouter model roster.

- **Browse models** searches the catalog available to your key. Rows show the model name and separate input/output prices per million tokens, or Free when all reported rates are zero.
- **Add** enables a model in both the composer and subagent picker. **My models** contains only your selections. Removing a model does not rewrite existing chats or automatically select a replacement.
- Open a model row for its exact ID, context limit, output limit, supported inputs, tool support and reasoning controls. Missing values are shown as unknown. Text-output models without tools can be used for chat; they cannot run agent tools. Image-generation, embedding and audio-only models are excluded from this chat catalog.
- **Add by model ID** finds an exact catalog ID, so you can review its current price before adding it. An unavailable or unverified ID cannot be enabled.
- **Free models only** filters browsing and blocks paid-model requests. Existing paid selections remain saved so they can be removed or used after changing the setting.
- If a model's reported rates increase, review **Accept current price** before using it again. Requests also send the accepted prompt, completion, request and image price ceilings to OpenRouter. Endpoint availability can vary within those limits. The catalog is quoted metadata, not a guarantee of final total cost or successful routing.

## Refresh and offline behavior

The saved catalog appears immediately. Privora refreshes stale metadata at startup, when opening the model browser, and before OpenRouter requests. Metadata has a 15-minute freshness window; **Refresh** bypasses it. A failed automatic refresh backs off for one minute. Requests have a 12-second discovery timeout. If discovery fails, the UI labels saved data and retains your choices. Previously accepted price limits remain attached to requests.

Removed or expired models stay identifiable in saved metadata and are marked unavailable. Privora does not silently replace them with another model or a paid variant. The selected model stays fixed during an active run.

## Implementation

Discovery calls `https://openrouter.ai/api/v1/models/user` from Electron's main process using the existing protected key store. Authentication and raw provider error bodies never cross into the renderer. The local SQLite catalog stores metadata, enabled IDs and accepted prices, without the API key. No Privora server is involved.

The parser validates IDs, numeric prices, context/output limits and text input/output compatibility. Internal IDs are scoped to OpenRouter to prevent collisions with other providers; inference receives the exact upstream catalog ID. Main-process and renderer model registries share these records. Snapshots carry only enabled or chat-referenced model metadata, rather than the full catalog.

Tool parameters are sent only when advertised, image input is rechecked before inference, and requests require supporting provider endpoints. Reasoning uses On/Off when the catalog advertises the `reasoning` parameter; it does not invent effort levels from a model name. Legacy reasoning-output flags alone do not establish thinking controls.

References: [user-filtered model catalog](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails), [catalog fields](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [provider routing and price ceilings](https://openrouter.ai/docs/guides/routing/provider-selection).
