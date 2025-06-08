# Audio/Video Transcription App

A web application for transcribing audio and video files using different AI models, with options for speaker diarization and summarization.

## Features

*   **Transcription Modes:**
    *   **File-Based Transcription (Pre-recorded API):**
        *   Upload audio/video files for transcription.
        *   Supports Deepgram (Nova-2/Nova-3 with FFMpeg chunking for large files) and Google Gemini.
        *   Accepts various audio and video file formats.
    *   **Streaming Transcription (Deepgram):**
        *   **Live Microphone Streaming:** Transcribe audio in real-time directly from the user's microphone.
        *   **File Streaming:** Upload an audio/video file and have it streamed for transcription.
        *   Utilizes Deepgram's streaming API.
*   **Model Selection:** Dropdown to choose between available Deepgram and Gemini models (Note: Streaming currently primarily uses Deepgram).
*   **Model Selection:** Dropdown to choose between available Deepgram and Gemini models.
*   **Diarization:** Optional speaker identification (checkbox).
    *   Uses Deepgram's `diarize=true` feature (formats by speaker paragraph).
    *   Uses prompting for Gemini (attempts to label by speaker).
*   **Summarization:** Optional concise summary generation (checkbox).
    *   Uses Google Gemini API for summarization (either summarizing Deepgram transcript or as part of Gemini transcription prompt).
*   **Real-time Updates:** Uses Server-Sent Events (SSE) for pre-recorded mode to show processing status and append transcript chunks (for Deepgram) or the full transcript/summary (for Gemini). WebSocket is used for streaming mode to display live transcript updates.
*   **Transcript Actions:** Buttons to copy the full output (transcript + summary) or save it as a `.txt` file.
*   **Reset/Cancel:** Button to reset the form or cancel frontend listening (backend cancellation not implemented).
*   **Auto-Scroll:** Transcription text area automatically scrolls down.
*   **User Authentication:** Sign in with Google via Firebase Authentication to manage user sessions.

## Tech Stack

*   **Frontend:** React, Axios, CSS, `cross-env` (for build scripting)
*   **Backend:** Node.js, Express, Multer (for file uploads), SSE-Express
*   **Deployment Platforms:**
    *   Backend: Google Cloud Run
    *   Frontend: Firebase Hosting
*   **APIs:**
    *   Deepgram API (Pre-recorded)
    *   Google Gemini API (`@google/generative-ai`)
*   **Utilities:** FFMpeg (via `ffmpeg-static`), FFprobe (via `ffprobe-static`), `uuid`, `mime-types`, `dotenv`, Firebase CLI (`firebase-tools`)
*   **Authentication:** Firebase Authentication (Google Sign-In)

## Setup

1.  **Clone Repository:** `git clone https://github.com/karstegg/deepgram-transcription-app.git`
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

6.  **(Optional) Install Firebase CLI for Frontend Deployment:** If you plan to re-deploy the frontend, install the Firebase CLI globally:
    ```bash
    npm install -g firebase-tools
    ```
    Then log in:
    ```bash
    firebase login
    ```

## Running the App Locally

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

## Deployment

The application is deployed with the following setup:

*   **Backend (Node.js/Express):**
    *   Deployed on **Google Cloud Run**.
    *   Service URL: `https://deepgram-backend-upcbdbi5la-uc.a.run.app`
    *   Environment variables (`DEEPGRAM_API_KEY`, `GEMINI_API_KEY`) are configured directly in the Cloud Run service.
*   **Frontend (React):**
    *   Deployed on **Firebase Hosting**.
    *   Hosting URL: `https://deepgram-transcription-app.web.app`
    *   The frontend is built using `npm run build` (which utilizes `cross-env`) and deployed via the Firebase CLI (`firebase deploy --only hosting`).
    *   The `firebase.json` in the project root is configured with `"public": "frontend/build"`.

## Current Status

*   The `development` branch contains the latest stable and deployed version of the application.
*   Both transcription and summarization features are functional in the deployed environment.
*   The `master` branch may contain an older version.

## Known Issues / Limitations

*   Gemini transcription currently uses inline data, limiting file size to ~15MB. Implementing the Gemini File API for larger files encountered errors previously.
*   The "Cancel" button only stops the frontend SSE connection, it doesn't terminate ongoing backend processes (FFMpeg or API calls).
*   The UI uses basic HTML/CSS after MUI integration caused rendering errors.

## Project Roadmap & Future Objectives

The following outlines the planned enhancements and future direction for the application:

1.  **Refactor `frontend/src/App.js` and `backend/server.js`:**
    *   Utilize a tool like "Jules by Google" or similar methods to modularize these large files.
    *   **Goal:** Improve code organization, readability, and maintainability for easier debugging and development.
2.  **Test Refactored Implementation:**
    *   Conduct thorough end-to-end testing after refactoring to ensure all functionalities remain intact.
3.  **Handle File Size Limits on Google Cloud Run (GCR):**
    *   Address GCR's request size limits (e.g., default 32MB) for large audio/video file uploads.
    *   **Potential Solutions:** Explore streaming uploads, client-side file chunking with server-side reassembly, or leveraging Google Cloud Storage (GCS) as an intermediary for uploads.
4.  **Verify User Account Management & Deploy to Production:**
    *   User account management (Google Sign-In via Firebase) has been implemented on the frontend.
    *   Thoroughly test and prepare for deployment to a designated production environment.
5.  **Structured Summarization:**
    *   Enhance the summarization feature to allow users to define or select predefined sections/headings (e.g., for meeting minutes: "Action Items," "Decisions," "Key Discussion Points"), guiding the AI to produce more structured output.
6.  **Update Existing Documents with New Transcripts:**
    *   Implement functionality for users to upload an existing document (e.g., previous meeting minutes).
    *   The application will then use a new audio transcript to intelligently update the existing document or generate a new version, incorporating the latest information.

*(For detailed refactoring guidelines, see `Refactor_Instructions_For_Jules.md`)*
