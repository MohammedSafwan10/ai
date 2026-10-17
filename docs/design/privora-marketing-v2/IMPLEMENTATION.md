# Approved Privora website

The user approved `homepage-gpt6-astra.png` and asked to continue the complete site using design-taste-frontend. This supersedes the earlier three-direction selection gate. The approved large left-aligned light hero and full-width desktop image take precedence over the previously dealt split hero.

Direction: product-performs, seed 1679809205, Schibsted Grotesk, brand charcoal / neutral paper / mint. No random redraw after approval. The Portal doorway connects the idea of a local workspace to the files, browser and chat selector. That selector is the live interaction: it shows real current interface fragments rather than pretending to run an agent.

Implemented pages: home, Windows download with metadata/retry states, access/security, existing legal content in the new typography, and a real 404. The old pricing page is removed; the server redirects legacy pricing URLs to the models explanation. No account, billing, credits, analytics or cloud inference service is added.

Assets: approved Portal artwork exported by ImageGen with transparency; desktop illustrative asset extracted from the approved GPT-6 Astra concept with ImageGen. Files/browser/project captures are current build 0.1.48 from 17 October 2026, using prepared Fieldnotes sample content. `chat-tools.png` is rendered directly from current ChatMessage and ToolTimeline components. Demo conversation, completion time and sample output are illustrative. No real research or credentials appear. Existing old poster and Appwrite-hosted video are retired from the website. No external stock pictures are used. Schibsted Grotesk is locally served with its SIL Open Font License in `public/fonts/OFL.txt`.

Image edit prompts are recorded in CHAT-FIDELITY.md and ASTRA-EDIT.md. Additional ImageGen production prompts requested a tight extraction of the approved application window and a transparent extraction of the approved icon tile, preserving internal shapes, labels and colors. Image format conversion and icon-size exports do not redraw the artwork.

## Visual review

Baseline rejected prototype: 13 inspector failures (including tiny type, ornaments, overflow and long headings). Final home and download inspect runs at 1440, 768 and 390 report zero FAIL. Home's remaining warning is no video; the user rejected the old footage, and no new live-task footage exists. Download's restrained motion is intentional for a utility page. Local reports/screenshots are in the ignored root `.taste-skill/marketing-home` and `marketing-download` folders.

Fourteen-pass critique: clear headline and product proof first; consistent shell edges; neutral paper, charcoal fields and mint actions; no repeated icon-card grids; real current raster fragments; native mobile stacking; primary actions remain visible; no clipping; clear free-app versus provider-cost explanation; live explorer works with keyboard and touch. The first pass exposed tablet three-line headings and mobile sideways scrolling; both were corrected. Actual source snippets prove the tool styling. The generated product image remains approximate, so it is labeled as a demo.

Self-assessment (not an independent jury): design 7.5, usability 8, creativity 7, content 8; weighted overall 7.6/10. The weaker point is raster UI readability on a small phone; product copy remains native text and the explorer isolates the important areas. A newly recorded real task would improve the product proof further.

Production assets are in `apps/marketing/public`. The same approved source artwork is exported to the desktop PNG, multi-resolution ICO and ICNS assets. Asset changes do not update an already-running desktop executable or publish a new binary.
