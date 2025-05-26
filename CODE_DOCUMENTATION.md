# Code Documentation: Audio/Video Transcription App

This document provides a technical overview of the project structure and code flow.

## Folder Structure

```
.
├── .gitignore
├── README.md
├── CODE_DOCUMENTATION.md              # This file
├── PRODUCT_REQUIREMENTS.md            # PRD file
├── Refactor_Instructions_For_Jules.md # Guidelines for future refactoring
├── latest_progress_log.md             # Consolidated progress tracking
├── firebase.json                      # Firebase Hosting configuration
├── backend/
│   ├── node_modules/                  # (Not tracked by Git)
│   ├── uploads/                       # Temp storage for uploads (Not tracked by Git)
│   ├── .env                           # API Keys & Config (Not tracked by Git)
│   ├── package.json                   # Backend dependencies and scripts
│   ├── package-lock.json              # Lockfile for backend dependencies
│   ├── server.js                      # Main backend Express server (delegates to routes/controllers)
│   ├── routes/                        # Express route definitions (e.g., transcriptionRoutes.js, summarizationRoutes.js)
│   │   ├── transcriptionRoutes.js
│   │   └── summarizationRoutes.js
│   ├── controllers/                   # Request handling logic (e.g., transcriptionController.js, summarizationController.js)
│   │   ├── transcriptionController.js
│   │   └── summarizationController.js
│   ├── services/                      # Business logic (e.g., deepgramService.js, geminiService.js, fileService.js)
│   │   ├── deepgramService.js
│   │   ├── geminiService.js
│   │   └── fileService.js
│   └── middleware/                    # Custom middleware (e.g., multerUpload.js, errorHandler.js)
│       ├── multerUpload.js
│       └── errorHandler.js
└── frontend/
    ├── node_modules/                  # (Not tracked by Git)
    ├── public/                        # Static assets (index.html, favicon, etc.)
    ├── src/
    │   ├── components/                # React UI components
    │   │   ├── AdvancedOptionsPanel.js
    │   │   ├── ErrorDisplay.js
    │   │   ├── FileUploadArea.js
    │   │   ├── ProgressDisplay.js
    │   │   ├── ResultsTabs.js
    │   │   ├── SummaryPanel.js
    │   │   ├── TranscriptionControls.js
    │   │   └── TranscriptionPanel.js
    │   ├── hooks/                     # Custom React hooks for managing state and side effects
    │   │   ├── useAdvancedOptions.js
    │   │   ├── useErrorHandler.js
    │   │   ├── useFileUpload.js
    │   │   ├── useProgress.js
    │   │   ├── useSSE.js
    │   │   ├── useSummarizationService.js
    │   │   └── useTranscriptionService.js
    │   ├── services/                  # Services for API calls and other utilities
    │   │   └── apiService.js
    │   ├── utils/                     # Utility functions
    │   │   └── formatUtils.js
    │   ├── App.css                    # Main app styles
    │   ├── App.js                     # Main application component, orchestrates UI and logic
    │   ├── index.css                  # Global styles
    │   └── index.js                   # Entry point for React app
    ├── .env                           # Environment variables for frontend (e.g., REACT_APP_BACKEND_URL)
    ├── package.json                   # Frontend dependencies and scripts
    └── package-lock.json              # Lockfile for frontend dependencies
```

## Backend Overview

*   **Framework:** Express.js
*   **Primary Logic (`server.js`):** Initializes the Express app, sets up middleware (CORS, JSON parsing, static file serving for uploads, global error handler), and mounts modular routers. The core request processing logic is delegated to controllers and services.
*   **Environment Variables (`backend/.env`):**
    *   `PORT`: Port for the backend server (defaults to 5000).
    *   `DEEPGRAM_API_KEY`: API key for Deepgram services.
    *   `GEMINI_API_KEY`: API key for Google Gemini services.
*   **File Uploads:** Handled by `multer` (configured in `middleware/multerUpload.js`), temporarily storing files in `backend/uploads/`.
*   **Transcription (`routes/transcriptionRoutes.js`, `controllers/transcriptionController.js`, `services/deepgramService.js`):
    *   Handles audio file uploads for transcription.
    *   Uses Deepgram SDK for transcription.
    *   Communicates progress and results via Server-Sent Events (SSE).
*   **Summarization (`routes/summarizationRoutes.js`, `controllers/summarizationController.js`, `services/geminiService.js`):
    *   Accepts text input for summarization.
    *   Uses Google Gemini Pro (`gemini-1.5-flash-latest`) for generating summaries.
    *   Communicates progress and results via Server-Sent Events (SSE).
*   **Error Handling:** A global error handler in `middleware/errorHandler.js` catches and processes errors.
*   **Dependencies:** Key dependencies include `express`, `dotenv`, `cors`, `multer`, `@deepgram/sdk`, `ffmpeg-static`, `ffprobe-static`, `sse-express`, `@google/generative-ai`.

## Frontend Overview

*   **Framework:** React (Create React App)
*   **Main Component (`App.js`):** Orchestrates the overall application state and UI, leveraging custom hooks for managing different aspects like file uploads, transcription, summarization, and progress updates.
*   **API Communication (`src/services/apiService.js`):** Handles all HTTP requests to the backend for transcription and summarization, and establishes SSE connections for real-time updates.
*   **State Management:** Primarily through React hooks (`useState`, `useEffect`, `useCallback`) and custom hooks defined in `src/hooks/`.
*   **Local Development (`frontend/package.json` `start` script):**
    *   The `start` script is configured as: `"start": "cross-env REACT_APP_BACKEND_URL=http://localhost:5000 react-scripts start"`.
    *   This sets the `REACT_APP_BACKEND_URL` environment variable, allowing the frontend to correctly target the local backend server during development.
    *   `apiService.js` uses `process.env.REACT_APP_BACKEND_URL` (or a fallback to the deployed backend URL) to determine the API base URL.
*   **Deployment (Firebase Hosting):**
    *   Build command: `npm run build` (or `yarn build`) in the `frontend/` directory.
    *   Configuration: The `firebase.json` file at the project root specifies `"hosting": { "public": "frontend/build", ... }` to direct Firebase Hosting to the correct build output.

## Communication Flow (Transcription & Summarization)

1.  **User Interaction:** User interacts with components in Frontend (e.g., `FileUploadArea.js`, `TranscriptionControls.js`).
2.  **State Management:** State and actions are managed by `App.js` and relevant custom hooks (e.g., `useTranscriptionService.js`, `useSummarizationService.js`).
3.  **Transcription Request:**
    *   On "Transcribe File", `apiService.js` sends the audio file and options via POST request to Backend (`/transcribe`).
    *   Backend (`transcriptionController.js`) receives the request, uses `deepgramService.js` for transcription via Deepgram SDK.
    *   An SSE connection is established via `/progress/:clientId` for real-time updates (status, partial transcripts, final transcript).
4.  **Summarization Request:**
    *   User provides text (e.g., from transcription results or pasted text) and clicks "Summarize".
    *   `apiService.js` sends the text via POST request to Backend (`/summarize`).
    *   Backend (`summarizationController.js`) receives the request, uses `geminiService.js` to generate a summary using Google Gemini.
    *   An SSE connection is established via `/progress/:clientId` for real-time updates (status, summary result).
5.  **SSE Communication:**
    *   Backend sends `status` updates (e.g., 'processing', 'transcribing', 'summarizing'), `partial_transcript`, `final_transcript`, and `summary_result` events via SSE to the Frontend.
6.  **UI Updates:** Frontend components (e.g., `TranscriptionPanel.js`, `SummaryPanel.js`, `ProgressDisplay.js`) update the UI based on received SSE messages and state from hooks/`App.js`.
7.  **Completion/Error:** Backend sends a `done` or `error` message via SSE, and the connection is closed.
8.  **Cleanup:** Backend cleans up temporary files from the `uploads/` directory after processing.