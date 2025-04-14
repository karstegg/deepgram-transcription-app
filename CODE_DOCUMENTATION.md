# Code Documentation: Audio/Video Transcription App

This document provides a technical overview of the project structure and code flow.

## Folder Structure

```
.
├── .gitignore
├── README.md
├── CODE_DOCUMENTATION.md  # This file
├── PRODUCT_REQUIREMENTS.md # PRD file
├── backend/
│   ├── node_modules/      # (Not tracked by Git)
│   ├── uploads/           # Temp storage for uploads (Not tracked by Git)
│   ├── .env               # API Keys & Config (Not tracked by Git)
│   ├── middleware/
│   │   └── authenticateToken.js # Firebase Auth middleware
│   ├── package.json       # Backend dependencies and scripts
│   ├── package-lock.json  # Lockfile for backend dependencies
│   └── server.js          # Main backend Express server logic
└── frontend/
    ├── node_modules/      # (Not tracked by Git)
    ├── public/            # Static assets (index.html, favicon, etc.)
    ├── src/
    │   ├── App.css        # Basic CSS styling
    │   ├── App.js         # Main React application component and logic
    │   ├── firebaseConfig.js # Firebase client config
    │   ├── index.css      # Global CSS
    │   ├── index.js       # Entry point for React app
    │   └── ... (other React boilerplate files)
    ├── .gitignore         # Frontend specific ignores
    ├── package.json       # Frontend dependencies and scripts
    └── package-lock.json  # Lockfile for frontend dependencies
```

## Backend (`server.js`) Overview

The backend is a Node.js application using the Express framework. It manages audio/video transcription processes.

**Key Dependencies:**

*   `express`: Web framework.
*   `cors`: Enables Cross-Origin Resource Sharing.
*   `dotenv`: Loads environment variables.
*   `multer`: Handles file uploads.
*   `sse-express`: Implements Server-Sent Events (SSE) for progress updates.
*   `uuid`: Generates unique IDs.
*   `@deepgram/sdk`: Deepgram SDK for transcription.
*   `@google/generative-ai`: Google Gemini SDK for transcription/summarization.
*   `ffmpeg-static`, `ffprobe-static`: Provides FFmpeg/FFprobe for audio processing.
*   `mime-types`: Detects file MIME types.
*   `firebase-admin`: For backend Firebase integration (Firestore, potentially Auth).

**Core Functionality:**

1.  **Initialization:** Sets up Express, middleware (CORS, JSON parsing, Firebase Admin SDK, Firestore).
2.  **File Upload:** Configures Multer for uploads to `./uploads/`.
3.  **SDK Initialization:** Initializes Deepgram and Google Gemini SDKs using API keys from `.env`.
4.  **SSE Endpoint (`/progress/:clientId`):** Establishes persistent connections using `sse-express` to send real-time updates to clients.
5.  **Transcription Endpoint (`POST /transcribe`):**
    *   Receives file uploads and options (model, diarize, summarize, chunkSizeMB).
    *   Generates a unique `clientId`.
    *   Responds immediately with `clientId`.
    *   Asynchronously calls `processTranscription`.
6.  **Summarization Endpoint (`POST /summarize`):**
    *   Receives existing transcription text.
    *   Generates a unique `clientId`.
    *   Asynchronously calls Gemini to generate a summary.
    *   Uses SSE to send status and the final summary.
7.  **Cancellation Endpoint (`POST /cancel/:clientId`):** Allows clients to request cancellation of an ongoing process (kills FFmpeg, cleans up chunks, notifies via SSE).
8.  **Authenticated API (`/api/transcripts`):
    *   Uses `authenticateToken` middleware (verifies Firebase ID token).
    *   Currently implements `POST /api/transcripts` to save transcript data (filename, transcript, summary, model, options, userId) to Firestore.
9.  **`processTranscription` Function:**
    *   Orchestrates the transcription workflow.
    *   Determines whether to use Deepgram or Gemini based on the selected `model`.
    *   **Deepgram Path:** Uses `ffprobe` to check duration. If long, calls `splitMediaIntoAudioChunks` (uses `ffmpeg`). Transcribes chunks/file using `transcribeChunkPrerecorded`. Optionally summarizes the final Deepgram transcript using Gemini.
    *   **Gemini Path:** Calls `transcribeWithGemini` (currently uses inline data).
    *   Sends status, warnings, errors, partial results, and final `done` message via SSE (`sendProgress` helper).
    *   Includes cleanup logic (`finally` block).
10. **Helper Functions:** `sendProgress`, `splitMediaIntoAudioChunks`, `transcribeChunkPrerecorded`, `transcribeWithGemini` encapsulate specific logic.

## Frontend (`App.js`) Overview

The frontend is a single-page React application built with Create React App, providing the user interface for the transcription service.

**Key Dependencies:**

*   `react`: Core UI library.
*   `axios`: For making HTTP requests to the backend.
*   `lucide-react`: For icons.
*   `react-markdown`: To render summaries formatted in Markdown.
*   `firebase`: For client-side Firebase Authentication.

**Core Functionality:**

1.  **UI Rendering:** Displays controls for file upload, model selection (Deepgram, Gemini), options (diarization, summarization, chunk size), and action buttons. Renders areas for progress messages, errors, transcription text, and summary.
2.  **State Management:** Uses React hooks (`useState`, `useEffect`, `useRef`) to manage application state (selected file, results, loading status, errors, user options, UI state like dark mode, authenticated user).
3.  **File Handling:** Uses a standard file input, supports drag-and-drop uploads.
4.  **Transcription Workflow:**
    *   User selects file and options.
    *   `handleTranscription` sends file and options to the backend `/transcribe` endpoint using `axios`.
    *   Receives `clientId` from the backend.
    *   Establishes an SSE connection to `/progress/:clientId` using `new EventSource()`.
    *   Listens for SSE events (`status`, `partial_transcript`, `summary_result`, `warning`, `done`, `error`) and updates the UI state accordingly.
5.  **Summarization Workflow:**
    *   `handleSummarization` sends the *existing* transcription text to the backend `/summarize` endpoint.
    *   Receives `clientId` and establishes an SSE connection similar to transcription.
    *   Listens for SSE events (`status`, `summary_result`, `warning`, `done`, `error`) to display progress and the final summary.
6.  **Firebase Authentication:**
    *   Integrates with Firebase client SDK (`firebaseConfig.js`).
    *   Provides "Sign In with Google" (`handleSignIn`) and "Sign Out" (`handleSignOut`) functionality using `signInWithPopup` and `signOut`.
    *   Uses `onAuthStateChanged` to listen for authentication state changes and update the `currentUser` state, displaying user info or the sign-in button.
7.  **User Experience:** Includes features like dark mode toggle, copy/save buttons for results, cancellation of ongoing jobs (`handleCancelReset`), auto-scrolling transcription area, and clear visual feedback for loading states and errors.
8.  **Result Display:** Uses tabs to switch between the transcription view (plain text in a `<pre>` tag) and the summary view (rendered using `ReactMarkdown`).

## Communication Flow

1.  **Transcription:** Frontend POSTs file/options to `/transcribe` -> Backend returns `clientId` -> Frontend opens SSE `/progress/:clientId` -> Backend sends SSE updates (`status`, `partial_transcript`, `summary_result`, `done`/`error`).
2.  **Summarization:** Frontend POSTs existing transcript to `/summarize` -> Backend returns `clientId` -> Frontend opens SSE `/progress/:clientId` -> Backend sends SSE updates (`status`, `summary_result`, `done`/`error`).
3.  **Cancellation:** Frontend POSTs to `/cancel/:clientId` -> Backend attempts to stop processing and notifies via existing SSE connection.
4.  **Saving (Future):** Authenticated Frontend POSTs transcript/summary data to `/api/transcripts` -> Backend verifies token and saves to Firestore.
