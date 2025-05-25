# Deployment and Running Instructions (Google Cloud)

This document provides instructions for deploying the backend service (Node.js/Express) to Google Cloud Run and running the full application (React frontend, Node.js backend) locally.

**Current Status (as of May 25, 2025):**
*   The backend is typically deployed to Google Cloud Run and the frontend to Firebase Hosting.
*   The `development` branch (or a feature branch based on it) is considered the stable version.
*   The frontend application's logic is primarily contained within `frontend/src/App.js`. A more granular, modular structure (e.g., separate files for constants, custom hooks, specific UI components, and services like `apiService.js`) is planned for future refactoring but is not part of the current stable branch structure.
*   API Keys for Deepgram and Gemini are typically configured as environment variables directly in the Google Cloud Run service settings for the `deepgram-backend` service.

## Prerequisites

1.  **Google Cloud SDK (`gcloud`):** Install and initialize the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install). Ensure you are authenticated (`gcloud auth login`) and have selected the correct project (`gcloud config set project deepgram-transcription-app`).
2.  **Node.js and npm:** Install [Node.js](https://nodejs.org/) (which includes npm). Version 18 or later is recommended (based on `backend/Dockerfile`).
3.  **Google Cloud Project:** A Google Cloud project with the ID `deepgram-transcription-app`.
4.  **Enabled APIs:** Ensure the Cloud Run API and Cloud Build API are enabled in your Google Cloud project.
5.  **API Keys:** Obtain API keys from [Deepgram](https://deepgram.com/) and [Google AI Studio](https://aistudio.google.com/app/apikey).

## Running Locally

1.  **Clone Repository:**
    ```bash
    # If you haven't already:
    # git clone <repository_url>
    # cd <repository_directory>
    ```
2.  **Install Backend Dependencies:**
    ```bash
    cd backend
    npm install
    ```
3.  **Create Environment File:** Create a file named `.env` inside the `backend` directory (`backend/.env`).
4.  **Add API Keys to `backend/.env`:**
    ```dotenv
    DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    PORT=5000 # Optional: specify port for backend server
    ```
5.  **Run Backend Server:**
    ```bash
    # Make sure you are in the backend directory
    node server.js
    ```
    The backend should now be running (likely on port 5000 or the value set in `.env`).

6.  **Install Frontend Dependencies:**
    ```bash
    # Navigate back to the root if needed, then into frontend
    cd ../frontend
    npm install
    ```
7.  **Run Frontend Development Server:**
    ```bash
    # Make sure you are in the frontend directory
    npm start
    ```
    The frontend should now be accessible in your browser, likely at `http://localhost:3000`.

## Deploying Backend to Google Cloud Run

To deploy the backend service to Google Cloud Run:

1.  **Ensure your local `backend/` directory reflects the code you want to deploy.**
2.  **Navigate to the project root directory** (the directory containing the `backend` and `frontend` folders).
3.  **Choose a deployment command option:**

    *   **Command Option 1 (Recommended if API keys and other environment variables are already correctly set in Google Cloud Run and you DON'T want to overwrite/manage them via this command):**
        ```bash
        gcloud run deploy deepgram-backend \
            --source ./backend \
            --platform managed \
            --region us-central1 \
            --allow-unauthenticated \
            --project deepgram-transcription-app
        ```
        *   This command builds a container image from the `backend` directory (using its `Dockerfile`), pushes it, and deploys it as a new revision to the `deepgram-backend` service.
        *   It relies on environment variables (like `DEEPGRAM_API_KEY`, `GEMINI_API_KEY`) being pre-configured and managed in the Cloud Run service settings via the Google Cloud Console. This command will use the existing environment variable configuration of the service.
        *   You might be prompted to allow unauthenticated invocations if the service needs to be publicly accessible (this is typical for web app backends).

    *   **Command Option 2 (For initial setup or to explicitly set/overwrite ALL environment variables via the command line):**
        ```bash
        gcloud run deploy deepgram-backend \
            --source ./backend \
            --platform managed \
            --region us-central1 \
            --allow-unauthenticated \
            --set-env-vars "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_KEY_HERE,GEMINI_API_KEY=YOUR_GEMINI_KEY_HERE,PORT=8080" \
            --project deepgram-transcription-app
        ```
        *   **CRITICAL Note for Option 2:** The `--set-env-vars` flag **REPLACES ALL** existing environment variables for the service with those specified in the command. If you only want to update one variable, you *must* include all other existing variables you wish to keep in the `--set-env-vars` string (e.g., `"EXISTING_VAR=value,NEW_VAR=new_value"`). Otherwise, unspecified variables will be removed. For managing individual or sensitive environment variables after initial setup, using the Google Cloud Console ("Edit & Deploy New Revision") is often safer and more explicit.
        *   Replace `YOUR_DEEPGRAM_KEY_HERE` and `YOUR_GEMINI_KEY_HERE` with actual secret values when executing. `PORT=8080` is standard for Cloud Run.

4.  **Important Security Note:** Ensure your local `backend/.env` file (used for local development) is **NOT** committed to your source control (it should be in `.gitignore`). For the deployed application, environment variables are managed directly in the Cloud Run service configuration as described above or by integrating with Google Secret Manager for enhanced security.

**Deployed Service URL (Example):**
After a successful deployment, Cloud Run will provide a service URL, similar to the last known deployment: `https://deepgram-backend-upcbdbi5la-uc.a.run.app`

**Note on Frontend Deployment:** This process only covers the backend. The frontend application (React) needs to be built (`npm run build` in `frontend/`) and deployed separately, typically to a static hosting service like Firebase Hosting (see `firebase.json` and Firebase deployment instructions).
