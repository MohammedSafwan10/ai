# Native Image Generation

Privora Desktop can generate image assets through first-class agent tools. Results are stored as real local files and also exposed through Privora's private image preview protocol, so generated images can be shown inline in chat and then copied into the workspace.

## Tools

- `generate_image` creates one or more images from a prompt.
- `edit_image` creates an image using workspace reference images.
- `list_generated_images` returns recent generated images with ids, paths, preview URLs, provider/model, and workspace copies.
- `save_generated_image` copies a generated image into the current workspace, for example `public/hero.png` or `assets/sprites/player.png`.

## Providers

The default provider is CLIProxy at the configured local base URL, usually `http://127.0.0.1:8317`.

- CLIProxy default model: `gpt-image-2`
- Gemini Nano Banana 2 model: `gemini-3.1-flash-image`

Gemini generation uses the Gemini API key stored in Privora settings, or `GEMINI_API_KEY` when running from a development environment.

## Storage

Generated image files are stored under:

```text
userData/generated-images/{workspaceId-or-global}/
```

Privora also stores a binary preview artifact and returns a URL like:

```text
privora-attachment://artifact/{sha256}.bin?mime=image/png
```

The renderer can display this URL inline, but the agent also receives the real absolute filesystem path. This lets the agent rename, copy, or export the generated image into workspace assets without re-generating it.

## Workspace Export

Use `saveToWorkspacePath` on `generate_image`/`edit_image` when the destination is known up front:

```json
{
  "prompt": "A clean product hero image for a developer desktop app",
  "saveToWorkspacePath": "public/hero.png"
}
```

Use `save_generated_image` when choosing or changing the destination later:

```json
{
  "id": "generated-image-id",
  "destinationPath": "assets/sprites/player.png"
}
```

All workspace exports are workspace-relative. Generated image storage outside the workspace is managed by Privora.

## Safety

Generated image tool outputs include paths, sizes, MIME types, provider, model, and preview URLs. They do not inline base64 image data in chat/tool output. Reference images must come from the current workspace.
