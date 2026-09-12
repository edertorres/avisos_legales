<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/08c22f97-110d-44e6-8a11-daaf064de123

Manual de usuario: [MANUAL_USUARIO.md](MANUAL_USUARIO.md)

## Run Locally

**Prerequisites:** Node.js, Typst CLI and Ghostscript (`gs`) available in your `PATH`


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

The local server renders PDF exports with Puppeteer and then Ghostscript (`gs`) converts every generated PDF to DeviceGray/K output for print. The app export uses PDF 1.4 to preserve vector quality and transparency. The gray conversion requires `ISOnewspaper26v4_gr.icc` in the project root, or an ICC file path in `GRAY_ICC_PROFILE`. The `/api/pdf/convert-gray` endpoint can still use the legacy PDF 1.3/PDF/X-1a flattened path for external PDFs when RIP compatibility requires it.

There is also an experimental parallel export at `/api/pdf/render-weasyprint`. It renders a server-generated HTML/CSS version with WeasyPrint, then runs Ghostscript in preserve mode to force and verify DeviceGray/K output.

## Deploy

Production runs through the Express server in `server.ts`:

- Build: `npm run build`
- Start: `npm start`
- Port: `3000`

For Coolify, use the included `Dockerfile`. Configure the public domain as:

`https://avisos.rreditores.com`

The Docker image installs Typst CLI, Ghostscript, WeasyPrint and the system fonts used by the PDF renderer
(`Roboto`, `Lato`, `Arimo`, `Tinos`, `Liberation` and `Noto` fallbacks).
