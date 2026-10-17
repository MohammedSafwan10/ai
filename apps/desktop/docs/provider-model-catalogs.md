# Provider model catalogs

Privora discovers model IDs from the configured provider instead of shipping a fixed picker roster. In **Settings → Providers**, choose OpenAI, Claude, Gemini, DeepSeek, OpenCode Go, or CLIProxy. Save the connection, open **Browse models**, and **Add** the models you want in the composer and subagent selector. OpenRouter keeps its existing catalog and price controls.

OpenAI and Claude use the user's API key and API billing. ChatGPT and Claude subscription credentials are not accepted. Keys remain in Electron's OS-backed encrypted secret storage, in the main process; catalogs and renderer snapshots contain metadata and saved-key flags, not keys.

## Discovery sources

| Provider | Source and inference protocol |
| --- | --- |
| OpenAI | Authenticated `GET https://api.openai.com/v1/models`; Responses API |
| Claude | Authenticated `GET https://api.anthropic.com/v1/models`; Messages API |
| Gemini | Authenticated, paginated Google `v1beta/models`; native `generateContent` streaming |
| DeepSeek | Authenticated `GET https://api.deepseek.com/models`; Chat Completions API |
| OpenCode Go | `https://opencode.ai/inference/go/v1/models`; protocol selected from discovered metadata, including Chat Completions, Responses, Messages, and Google generation |
| CLIProxy | `/v1/models` on the configured local endpoint; Responses API |

The provider determines which IDs are listed. Listing an ID does not guarantee inference access, account balance, regional availability, or compatibility with every feature. Request failures still report the provider's HTTP status.

Some model-list APIs only return IDs. Privora optionally downloads the public [models.dev catalog](https://models.dev) to supplement limits, modalities, reasoning controls, and Go protocol routes. This is community metadata, not an account entitlement check. No provider credentials or conversation content are sent to models.dev. The UI identifies supplemented metadata. Missing capabilities are not guessed: unconfirmed tools/images default off and can be explicitly enabled in model details after checking the provider's documentation. Non-text output models and Gemini embedding-only entries are excluded.

## Refresh, history, and failures

- Catalogs are cached locally for 15 minutes; public metadata is cached in memory for six hours. Saving a key automatically loads its model catalog. Refresh bypasses the catalog TTL. Startup refreshes configured remote providers without blocking the app.
- Refreshes are deduplicated. Failed background requests back off for one minute; manual Refresh can retry immediately. Requests have time and size limits, pagination is bounded, and credentials are not forwarded through redirects.
- Catalogs are bound to the current credential fingerprint. Replacing/clearing a key or switching Go accounts cannot expose the old account's roster as the new account's availability. Late results from an old credential are discarded.
- Add/Remove changes made while a refresh runs are retained. Existing selected models are adopted on initial discovery only if the provider still lists their exact ID. Other models require Add.
- Removed models retain historical metadata and are marked unavailable. They are not silently redirected to a different model or provider. A model that reappears becomes available again.
- Provider-qualified internal IDs prevent collisions. Inference always sends the exact upstream ID. Historical definitions remain solely for reading existing chats; they do not populate the active picker.
- Before inference, Privora checks selection, availability, current credential, supported reasoning, images, and output limits. Stop interrupts waiting for discovery. Streaming retains tool calls, signatures, provider reasoning context, usage, and incomplete-stream outcomes.

## Official references

- [OpenAI model listing](https://developers.openai.com/api/reference/resources/models/methods/list)
- [Claude model listing](https://platform.claude.com/docs/en/api/models/list)
- [Google model listing](https://ai.google.dev/api/models)
- [DeepSeek model listing](https://api-docs.deepseek.com/api/list-models/)
- [OpenCode Go endpoints](https://dev.opencode.ai/v2/docs/console/go/)

Tests use synthetic responses and do not incur paid inference. A successful authenticated inference remains the final check for a particular account/model combination.
