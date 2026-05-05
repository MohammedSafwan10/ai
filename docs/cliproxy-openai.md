# CLIProxy + GPT-5.5 Notes

This app supports a separate GPT provider path through CLIProxyAPI. The Gemini path stays on `@google/genai`; the GPT path is isolated under `src/lib/cliproxy`.

## Official OpenAI behavior checked

- `gpt-5.5` is listed by OpenAI as the flagship model for complex reasoning and coding.
- Latest OpenAI models support text and image input, text output, multilingual use, and vision.
- `gpt-5.5` supports reasoning efforts including `none` and `medium`.
- The Responses API accepts text, image, and file inputs.
- Image inputs use `input_image`.
- File inputs use `input_file` with `filename`, `file_data`, `file_id`, or `file_url`.

## App modes

- `GPT-5.5 Instant`: sends `reasoning.effort: "none"`.
- `GPT-5.5 Thinking`: sends `reasoning.effort: "medium"` and asks for an automatic reasoning summary when supported.

## Run CLIProxyAPI

Start CLIProxyAPI locally on the default port:

```powershell
cliproxy --config C:\Users\Thumbeja\config.yaml
```

The app talks to it through Vite:

```text
Browser -> /cliproxy/v1/responses -> http://127.0.0.1:8317/v1/responses
```

Configure the target in `.env` if needed:

```env
CLIPROXY_BASE_URL="http://127.0.0.1:8317"
VITE_CLIPROXY_API_KEY="dummy-key"
```

## File support

The UI accepts images, PDFs, plain text, Markdown, CSV, JSON, and common code files. For GPT-5.5 through CLIProxy, images are sent as native `input_image` data URLs and non-image files are sent as native `input_file` data URLs.

Whether a specific file type works depends on the upstream model and whether CLIProxy forwards the Responses `input_file` shape unchanged.

Previous assistant messages are sent back with `output_text`, while user messages use `input_text`. This matters for multi-turn Responses API calls.

GPT-5.5 does not expose raw private chain-of-thought. The UI displays the streamed `response.reasoning_summary_text.delta` events as the collapsible thinking panel when CLIProxy forwards them.

## CLIProxy caveat

CLIProxyAPI advertises OpenAI-compatible Chat Completions and Responses support. This app uses the Responses-compatible route because that is the official OpenAI-native shape for reasoning, image input, file input, and built-in tools. If a CLIProxy config/provider does not support `/v1/responses`, use a CLIProxy provider that does or add a chat-completions fallback later.
