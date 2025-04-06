# Audio/Video Transcription App (v1.0 - Basic)

A web application for transcribing audio and video files using the Deepgram API with basic options. This version corresponds to the `v1.0-basic-working` tag.

## Features (v1.0)

*   **File Upload:** Accepts various audio and video file formats.
*   **Transcription Engine:** Uses Deepgram Pre-recorded API.
*   **Large File Handling:** Uses FFMpeg chunking (default ~10min chunks, size calculation needs refinement).
*   **Real-time Updates:** Uses Server-Sent Events (SSE) to show processing status and append transcript chunks.
*   **UI:** Basic HTML/CSS interface.

*(Note: Optional Diarization, Summarization, Model Selection, Chunk Size Selection, Copy/Save buttons were added in later feature branches).*

## Tech Stack

*   **Frontend:** React, Axios, CSS
*   **Backend:** Node.js, Express, Multer, SSE-Express
*   **APIs:** Deepgram API (Pre-recorded)
*   **Utilities:** FFMpeg (via `ffmpeg-static`), FFprobe (via `ffprobe-static`), `uuid`, `dotenv`

## Setup

1.  **Clone Repository:** `git clone <repository_url>`
2.  **Checkout Tag/Branch:** `git checkout v1.0-basic-working` or `git checkout master` (as of commit `705ba9f`)
3.  **Install Backend Dependencies:**
    ```bash
    cd backend
    npm install
    ```
4.  **Install Frontend Dependencies:**
    ```bash
    cd ../frontend
    npm install
    ```
5.  **Create Environment File:** Create `.env` in `backend` directory.
6.  **Add API Key:** Add your Deepgram key to `backend/.env`:
    ```dotenv
    DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY
    PORT=5000 
    ```

## Running the App

1.  **Start Backend Server:**
    ```bash
    cd backend
    npm run dev 
    ```
2.  **Start Frontend Server:** (In a separate terminal)
    ```bash
    cd frontend
    npm start
    ```
    (Opens automatically at http://localhost:3000)
