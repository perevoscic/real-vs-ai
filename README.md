# Real vs AI

This application is built as two separate systems: a backend and a frontend.

## 1. Backend (Express + Node)

The backend handles the Pollo API integration and manages the following endpoints:

- `/api/generate`
- `/api/status/:id`
- `/api/meta`
- `/api/jobs`

It is also responsible for saving generated videos to the `downloads/` directory.

### How to Start the Backend

To start the backend server, run the following command in the project root:

```bash
npm run dev:server
```

The backend will be accessible at: http://localhost:4000

## 2. Frontend (React + Vite + TypeScript)

The frontend is your UI dashboard, providing a control panel for video generation. It handles:

- The control panel
- Engine dropdown
- Aspect ratio selection
- Prompt input
- Seed input
- Job table display

### How to Start the Frontend

To start the frontend development server, navigate to the `frontend` directory and run:

```bash
cd frontend
npm run dev
```

The frontend / Pollo pipeline UI will be accessible at: http://localhost:5173

## Application Flow

The UI sends video generation requests to the backend. The backend then communicates with the Pollo API to process these requests, manages job statuses, and handles video downloads.

### Video Duration

- Every engine now exposes a seconds slider/number input, defaulting to the provider's recommended value.
- Pollo v1.6 accepts 5-20 second clips, with a 10s default. Runway Gen-3 Alpha Turbo supports 5 second or 10 second clips, defaulting to 5s in the UI.
- Kling, Pika, and Wanx presets load their documented ranges (5–15s or 5–20s) and clamp UI input to prevent invalid durations.

## Fal AI MCP Integration

This project includes Fal AI Pipeline integration with Model Context Protocol (MCP) support. To connect Fal AI's MCP server to Cursor:

1. **Open Command Palette**: Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
2. **Search for MCP Settings**: Type "Open MCP settings"
3. **Add Custom MCP**: Select "Add custom MCP" to open the `mcp.json` file
4. **Configure Fal Server**: Add the following configuration (or copy from `mcp.json` in this project):

```json
{
  "mcpServers": {
    "fal": {
      "url": "https://docs.fal.ai/mcp"
    }
  }
}
```

5. **Restart Cursor**: Save the file and restart Cursor to activate the MCP connection

Once connected, Cursor will have access to:

- Complete Fal AI documentation
- API references for models, endpoints, and parameters
- Code examples and best practices
- Contextual assistance based on Fal AI's knowledge base

For more details, see the [Fal AI MCP documentation](https://docs.fal.ai/model-apis/mcp).

## Engine Catalog & Docs

- **Fal AI** - Serverless inference endpoints with per-second billing. Supports multiple text-to-video generation models:
  - `fal-ai/wan-t2v` - Wan-2.1 Text-to-Video (High quality, 5-6s clips, 720p, $0.40/video)
  - `fal-ai/vidu/q2/text-to-video` - Vidu Q2 (Enhanced quality, up to 1080p)
  - `fal-ai/ltxv-2/text-to-video` - LTX Video 2.0 Pro (Up to 4K resolution, with audio)
  - `fal-ai/fast-animatediff/text-to-video` - AnimateDiff (Fast text-to-video generation)
  - [Fal AI Documentation](https://docs.fal.ai/)
  - [Fal AI MCP Integration](https://docs.fal.ai/model-apis/mcp)
- **Pollo v1.6** (`pollo-v1-6`) - [Pollo v1.6 API doc](https://docs.pollo.ai/m/pollo/pollo-v1-6). Supports prompt, resolution, mode, length, and optional seed fields.
- **Runway Gen-3 Alpha Turbo** (`runway-gen3a`) - integrates with Runway's `/v1/image_to_video` endpoint using the `gen3a_turbo` model by default. Reference docs:
  - [Create image_to_video](https://docs.dev.runwayml.com/reference/image_to_video_create)
  - [Runway API versioning](https://docs.dev.runwayml.com/api/api-versioning)
  - [Retrieve a task](https://docs.dev.runwayml.com/reference/tasks_retrieve)
- **Kling AI**:
  - `kling-v2-5-turbo` — [Kling v2.5 Turbo doc](https://docs.pollo.ai/m/kling-ai/kling-v2-5-turbo) (no seed support)
  - `kling-v2-1-master` — [Kling v2.1 Master doc](https://docs.pollo.ai/m/kling-ai/kling-v2-1-master) (no seed support)
- **Pika**:
  - `pika-v2-2` — [Pika v2.2 doc](https://docs.pollo.ai/m/pika/pika-v2-2)
  - `pika-v2-1` — [Pika v2.1 doc](https://docs.pollo.ai/m/pika/pika-v2-1)
- **Wanx**:
  - `wan-v2-5-preview` — [Wanx v2.5 Preview doc](https://docs.pollo.ai/m/wanx/wan-v2-5-preview)
  - `wan-v2-2-flash` — [Wanx v2.2 Flash doc](https://docs.pollo.ai/m/wanx/wan-v2-2-flash)
  - `wan-v2-2-plus` — [Wanx v2.2 Plus doc](https://docs.pollo.ai/m/wanx/wan-v2-2-plus)
  - `wanx-v2-1` — [Wanx v2.1 doc](https://docs.pollo.ai/m/wanx/wanx-v2-1)

Everything is working correctly with the following components implemented:

- Backend
- Frontend
- Routing
- UI
- Pollo integration
- Fal AI integration with MCP support
- ES modules
- TypeScript on UI
- Downloads folder auto-structure

## Testing a Full Video Generation

To test a full video generation, follow these steps in your UI:

1.  **Engine:** Select `Runway Gen-3 Alpha Turbo (runway-gen3a)`
2.  **Aspect Ratio:** Select `9:16`
3.  **Source image:** Upload the still frame you want to drive. The UI converts it to the `promptImage` data URL required by Runway.
