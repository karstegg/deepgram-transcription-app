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
│   ├── package.json       # Backend dependencies and scripts
│   ├── package-lock.json  # Lockfile for backend dependencies
│   └── server.js          # Main backend Express server logic
└── frontend/
    ├── node_modules/      # (Not tracked by Git)
    ├── public/            # Static assets (index.html, favicon, etc.)
    ├── src/
    │   ├── App.css        # Basic CSS styling
    │   ├── App.js         # Main React application component and logic
    │   ├── index.css      # Global CSS
    │   ├── index.js       # Entry point for React app
    │   └── ... (other React boilerplate files)
    ├── .gitignore         # Frontend specific ignores
    ├── package.json       # Frontend dependencies and scripts
    └── package-lock.json  # Lockfile for frontend dependencies
```

## Backend (`server.js`) Overview

The backend is a Node.js application using the Express framework.

**Key Dependencies:**

*   `express`: Web framework.
*   `cors`: Enables Cross-Origin Resource Sharing (for frontend communication).
*   `dotenv`: Loads environment variables from `.env`.
*   `multer`: Handles file uploads (`multipart/form-data`).
*   `sse-express`: Implements Server-Sent Events (SSE) for progress updates.
*   `uuid`: Generates unique IDs for client requests.
*   `@deepgram/sdk`: Deepgram Node.js SDK for transcription.
*   `@google/generative-ai`: Google Gemini Node.js SDK for transcription/summarization.
*   `ffmpeg-static`, `ffprobe-static`: Provides FFMpeg/FFprobe binaries for audio processing (chunking, analysis) when using Deepgram.
*   `mime-types`: Detects file MIME types for Gemini API.

**Core Logic:**

1.  **Initialization:**
    *   Sets up Express app, middleware (CORS, JSON parsing).
    *   Configures Multer for file uploads to the `./uploads/` directory.
    *   Initializes Deepgram and Google Gemini SDK clients using API keys from `.env`.
2.  **SSE Endpoint (`/progress/:clientId`):**
    *   Uses `sse-express` to establish a persistent connection with a specific client (identified by `clientId`).
    *   Stores the client's response object (`res`) to send updates later.
    *   Handles client disconnection.
3.  **Transcription Endpoint (`POST /transcribe`):**
    *   Receives file upload via Multer (`upload.single('audio')`).
    *   Receives options (model, diarize, summarize, chunkSizeMB) from `req.body`.
    *   Generates a unique `clientId` using `uuid`.
    *   Immediately responds to the client with the `clientId`.
    *   Calls the main `processTranscription` function asynchronously (does not wait for it to finish).
4.  **`processTranscription` Function:**
    *   Determines whether to use the Deepgram or Gemini workflow based on the selected `model`.
    *   **Deepgram Path:**
        *   Checks file duration using `ffprobe`.
        *   If file is long (>30s), calls `splitMediaIntoAudioChunks` to split the audio into MP3 chunks based on target `chunkSizeMB` (uses `ffmpeg`).
        *   Iterates through chunks, calling `transcribeChunkPrerecorded` for each.
        *   If file is short, calls `transcribeChunkPrerecorded` directly on the original file.
        *   Accumulates the plain transcript text from chunks.
        *   If summarization is enabled, calls the Gemini API with the accumulated Deepgram transcript.
    *   **Gemini Path:**
        *   Checks if Gemini client is initialized.
        *   Calls `transcribeWithGemini`.
    *   Sends status updates (`status`, `warning`, `error`) and final `done` message via SSE using `sendProgress`.
    *   Includes extensive `finally` block for cleaning up uploaded files and SSE connections.
5.  **`splitMediaIntoAudioChunks` Function:**
    *   Uses `ffprobe` to analyze input file duration/bitrate.
    *   Calculates an appropriate `-segment_time` for `ffmpeg` based on target chunk size (MB).
    *   Uses `ffmpeg` to extract the audio (`-vn`), convert to 16kHz mono MP3 (`-acodec libmp3lame -ar 16000 -ac 1`), and split into time-based segments.
    *   Returns an array of chunk file paths.
6.  **`transcribeChunkPrerecorded` Function (Deepgram):**
    *   Takes a chunk file path, diarize flag, and model name.
    *   Reads the chunk file buffer.
    *   Calls Deepgram's Pre-recorded API (`deepgramClient.listen.prerecorded.transcribeFile`) with appropriate options (`diarize`, `model`, `punctuate`, `smart_format`).
    *   Parses the response:
        *   If diarization enabled and successful, formats output with "Speaker X:" labels based on the `paragraphs` array.
        *   Otherwise, uses the plain transcript.
    *   Sends the formatted transcript chunk via the `partial_transcript` SSE event.
    *   Returns the *plain* transcript text for accumulation (used for potential Gemini summarization).
7.  **`transcribeWithGemini` Function:**
    *   Takes file path, original name, diarize/summarize flags, and model identifier.
    *   Reads the file, converts to base64 (`inlineData`).
    *   Checks file size against ~15MB limit for inline data.
    *   Determines MIME type using manual checks and `mime-types` library.
    *   Constructs a prompt asking for transcription and optionally diarization/summarization.
    *   Calls Gemini API (`geminiModel.generateContent`) using the inline data method.
    *   Parses the response text to extract transcript and summary (if requested).
    *   Sends the full transcript via `partial_transcript` SSE event and summary via `summary_result` SSE event.

## Frontend (`App.js`) Overview

The frontend is a single-page React application created using Create React App (CRA). It currently uses standard HTML elements and CSS for the UI after issues with MUI.

**Key State Variables:**

*   `selectedFile`: Holds the uploaded file object.
*   `transcription`: Stores the accumulating transcript text.
*   `summary`: Stores the received summary text.
*   `isLoading`: Boolean flag for loading state.
*   `error`: Stores error messages for display.
*   `progressMessage`: Stores status updates from the backend.
*   `enableDiarization`, `enableSummarization`: Boolean flags for options.
*   `selectedModel`, `selectedChunkSize`: Stores user selections for options.

**Core Logic:**

1.  **UI Rendering:** Renders input elements, option selectors (model, chunk size, checkboxes), action buttons (Transcribe, Reset/Cancel, Copy, Save), and display areas for progress, errors, summary, and transcription.
2.  **State Management:** Uses `useState` hooks to manage all application state.
3.  **File Handling:** Uses a standard `<input type="file">` triggered by a button. Stores the selected file in state.
4.  **Option Handling:** Updates state variables when dropdowns or checkboxes change. Conditionally renders the chunk size selector based on whether a Gemini model is chosen.
5.  **`handleTranscription` Function:**
    *   Triggered by the "Transcribe File" button.
    *   Resets previous results, sets loading state.
    *   Creates `FormData` including the file and selected options.
    *   Makes a `POST` request to the backend `/transcribe` endpoint using `axios`.
    *   Receives the `clientId` from the backend response.
    *   Establishes an SSE connection to `/progress/:clientId` using `new EventSource()`.
    *   Sets up event listeners (`onopen`, `status`, `partial_transcript`, `summary_result`, `warning`, `done`, `error`) for the SSE connection.
    *   Updates state (`progressMessage`, `transcription`, `summary`, `error`, `isLoading`) based on received SSE messages.
    *   Closes the SSE connection on `done` or `error`.
6.  **`handleCancelReset` Function:**
    *   If loading, closes the SSE connection and resets loading/progress state (frontend only).
    *   If not loading, calls `resetState` to clear the form completely.
7.  **Copy/Save Functions:** Use browser APIs (`navigator.clipboard`, `Blob`/`URL.createObjectURL`) to copy or save the displayed transcript/summary.
8.  **Auto-Scroll:** Uses a `useRef` on the transcription textarea and a `useEffect` hook to scroll to the bottom when the `transcription` state changes.

## Communication Flow

1.  User selects file and options in Frontend (`App.js`).
2.  User clicks "Transcribe File".
3.  Frontend sends file and options via POST request to Backend (`/transcribe`).
4.  Backend immediately responds with a unique `clientId`.
5.  Frontend uses `clientId` to open an SSE connection to Backend (`/progress/:clientId`).
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
11. Frontend updates UI based on received SSE messages.
12. Backend/Frontend close SSE connection.
13. Backend cleans up temporary files.
