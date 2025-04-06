# Audio/Video Transcription App

A web application for transcribing audio and video files using different AI models, with options for speaker diarization and summarization.

## Features

*   **File Upload:** Accepts various audio and video file formats.
*   **Transcription Engines:**
    *   **Deepgram:** Uses Nova-2 or Nova-3 models via the Pre-recorded API. Handles large files via FFMpeg chunking (chunk size selectable: 2, 5, 10 MB).
    *   **Google Gemini:** Uses `gemini-2.5-pro-exp-03-25` via the Generative AI API (inline data method, current limit ~15MB).
*   **Model Selection:** Dropdown to choose between available Deepgram and Gemini models.
*   **Diarization:** Optional speaker identification (checkbox).
    *   Uses Deepgram's `diarize=true` feature (formats by speaker paragraph).
    *   Uses prompting for Gemini (attempts to label by speaker).
*   **Summarization:** Optional concise summary generation (checkbox).
    *   Uses Google Gemini API for summarization (either summarizing Deepgram transcript or as part of Gemini transcription prompt).
*   **Real-time Updates:** Uses Server-Sent Events (SSE) to show processing status and append transcript chunks (for Deepgram) or the full transcript/summary (for Gemini).
*   **Transcript Actions:** Buttons to copy the full output (transcript + summary) or save it as a `.txt` file.
*   **Reset/Cancel:** Button to reset the form or cancel frontend listening (backend cancellation not implemented).
*   **Auto-Scroll:** Transcription text area automatically scrolls down.

## Tech Stack

*   **Frontend:** React, Axios, CSS
*   **Backend:** Node.js, Express, Multer (for file uploads), SSE-Express
*   **APIs:**
    *   Deepgram API (Pre-recorded)
    *   Google Gemini API (`@google/generative-ai`)
*   **Utilities:** FFMpeg (via `ffmpeg-static`), FFprobe (via `ffprobe-static`), `uuid`, `mime-types`, `dotenv`

## Setup

1.  **Clone Repository:** `git clone <repository_url>` (Replace with the actual URL once pushed)
2.  **Install Backend Dependencies:**
    ```bash
    cd backend
    npm install
    ```
3.  **Install Frontend Dependencies:**
    ```bash
    cd ../frontend
    npm install
    ```
4.  **Create Environment File:** Create a file named `.env` inside the `backend` directory.
5.  **Add API Keys:** Add your API keys to the `backend/.env` file:
    ```dotenv
    DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    PORT=5000 # Optional: specify port for backend server
    ```
    *   Get Deepgram key from [deepgram.com](https://deepgram.com/)
    *   Get Gemini key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Running the App

1.  **Start Backend Server:**
    ```bash
    cd backend
    npm run dev 
    ```
    (Listens on port 5000 by default)
2.  **Start Frontend Server:** (In a separate terminal)
    ```bash
    cd frontend
    npm start
    ```
    (Opens automatically at http://localhost:3000)

## Current Status

*   This code is on the `feature/gemini-transcription-option` branch.
*   The `master` branch contains a stable version tagged `v1.0-basic-working` which uses Deepgram only (with chunking) and has a simpler UI.

## Known Issues / Limitations

*   Gemini transcription currently uses inline data, limiting file size to ~15MB. Implementing the Gemini File API for larger files encountered errors previously.
*   The "Cancel" button only stops the frontend SSE connection, it doesn't terminate ongoing backend processes (FFMpeg or API calls).
*   The UI uses basic HTML/CSS after MUI integration caused rendering errors.

## Potential Next Steps

*   Re-attempt UI modernization using MUI or another library.
*   Implement backend cancellation logic.
*   Refine FFMpeg chunk sizing calculation.
*   Investigate and fix Gemini File API usage for >15MB files.
*   Integrate a different LLM for more advanced/customizable summarization.
*   Prepare for deployment (build scripts, environment variables, hosting).
