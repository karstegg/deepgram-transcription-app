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
│   └── server.js                      # Main backend Express server logic
└── frontend/
    ├── node_modules/                  # (Not tracked by Git)
    ├── public/                        # Static assets (index.html, favicon, etc.)
    ├── src/
    │   ├── components/
    │   │   ├── AdvancedOptionsPanel.js  # UI for advanced transcription/summarization settings
    │   │   ├── ErrorDisplay.js          # Component to show error messages
    │   │   ├── FileUploadArea.js        # Component for file drag-and-drop/selection
    │   │   ├── ProgressDisplay.js       # Component to show transcription/summarization progress
    │   │   ├── ResultsTabs.js           # Tabs for switching between transcript and summary
    │   │   ├── SummaryPanel.js          # Panel to display summarization results
    │   │   ├── TranscriptionControls.js # Buttons and inputs for controlling transcription
    │   │   └── TranscriptionPanel.js    # Panel to display transcription results
    │   ├── constants/
    │   │   └── constants.js             # Application-wide constants (models, SSE types, etc.)
    │   ├── hooks/
    │   │   ├── useSummarizationService.js # Custom hook for summarization logic
    │   │   └── useTranscriptionService.js # Custom hook for transcription logic
    │   ├── services/
    │   │   └── apiService.js            # Centralized API calls to the backend
    │   ├── utils/
    │   │   └── utils.js                 # Utility functions
    │   ├── App.css
    │   ├── App.js                     # Main React application component (now orchestrates sub-components)
    │   ├── App.test.js
    │   ├── firebaseConfig.js          # Firebase configuration (if used beyond hosting)
    │   ├── index.css
    │   ├── index.js                   # Entry point for React app
    │   ├── logo.svg
    │   ├── reportWebVitals.js
    │   └── setupTests.js
    ├── .gitignore                     # Frontend specific ignores
    ├── package.json                   # Frontend dependencies and scripts
    └── package-lock.json              # Lockfile for frontend dependencies
```

## Backend (`server.js`) Overview

Th
<truncated 8284 bytes>
 the Google Cloud Run service configuration.

*   **Frontend (React - Refactored Structure):**
    *   **Platform:** Firebase Hosting
    *   **Hosting URL:** `https://deepgram-transcription-app.web.app`
    *   **Build Process:** The React app is built using the `npm run build` script (which incorporates `cross-env CI=false react-scripts build`) in the `frontend` directory.
    *   **Deployment:** The static assets from the `frontend/build` directory are deployed using the Firebase CLI (`firebase deploy --only hosting`).
    *   **Configuration:** The `firebase.json` file at the project root specifies `"hosting": { "public": "frontend/build", ... }` to direct Firebase Hosting to the correct build output.
    *   **Note on Refactor:** The frontend, particularly `App.js`, has been refactored. Logic is now more modular, distributed across components in `src/components/`, custom hooks in `src/hooks/`, and services like `src/services/apiService.js`. `App.js` primarily serves as an orchestrator.

## Communication Flow

1.  User interacts with components in Frontend (e.g., `FileUploadArea.js`, `TranscriptionControls.js`).
2.  State and actions are managed by `App.js` and relevant custom hooks (e.g., `useTranscriptionService.js`).
3.  On "Transcribe File", `apiService.js` sends file and options via POST request to Backend (`/transcribe`).
4.  Backend immediately responds with a unique `clientId`.
5.  `apiService.js` (or a hook using it) uses `clientId` to open an SSE connection to Backend (`/progress/:clientId`).
6.  Backend starts processing asynchronously (`processTranscription`).
7.  Backend sends `status` updates via SSE to Frontend.
8.  If using Deepgram:
    *   Backend splits file (if needed) via `ffmpeg`.
    *   Backend sends chunks to Deepgram Pre-recorded API.
    *   Backend sends formatted transcript chunks via `partial_transcript` SSE event.
    *   Backend potentially calls Gemini for summary after all chunks.
9.  If using Gemini:
    *   Backend prepares inline data or uses File API (currently inline).
    *   Backend calls Gemini `generateContent`.
    *   Backend parses response.
    *   Backend sends full transcript via `partial_transcript` SSE event.
    *   Backend sends summary (if requested/extracted) via `summary_result` SSE event.
10. Backend sends `done` or `error` message via SSE.
11. Frontend components (e.g., `TranscriptionPanel.js`, `SummaryPanel.js`, `ProgressDisplay.js`) update UI based on received SSE messages and state from hooks/`App.js`.
12. Backend/Frontend close SSE connection.
13. Backend cleans up temporary files.