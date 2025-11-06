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

The backend will be accessible at: 👉 http://localhost:4000

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

The frontend will be accessible at: 👉 http://localhost:5173

## Application Flow

The UI sends video generation requests to the backend. The backend then communicates with the Pollo API to process these requests, manages job statuses, and handles video downloads.

Everything is working correctly with the following components implemented:

- Backend
- Frontend
- Routing
- UI
- Pollo integration
- ES modules
- TypeScript on UI
- Downloads folder auto-structure

## Testing a Full Video Generation

To test a full video generation, follow these steps in your UI:

1.  **Engine:** Select `Veo 3.1 (veo-3.1)`
2.  **Aspect Ratio:** Select `9:16`
