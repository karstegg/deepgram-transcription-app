# Deployment and Running Instructions (Google Cloud)

This document provides instructions for deploying the backend service to Google Cloud Run and running the full application locally.

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

1.  **Navigate to the project root directory** (the directory containing the `backend` and `frontend` folders).
2.  **Run the deployment command:**
    ```bash
    gcloud run deploy deepgram-backend --source ./backend --project deepgram-transcription-app --region us-central1
    ```
    *   This command builds a container image from the `backend` directory using its `Dockerfile`, pushes it to Google Container Registry (or Artifact Registry), and deploys it as a Cloud Run service named `deepgram-backend` in the `us-central1` region of the `deepgram-transcription-app` project.
    *   You might be prompted to allow unauthenticated invocations if the service needs to be publicly accessible.
    *   **Important Security Note:** Ensure your `backend/.env` file is **NOT** committed to your source control (add it to `.gitignore`). For the deployed application, you must configure secrets securely in Cloud Run, for example, by integrating with [Google Secret Manager](https://cloud.google.com/secret-manager). The deployment command above does *not* automatically transfer local `.env` variables to the deployed environment. You will need to set environment variables (like `DEEPGRAM_API_KEY`, `GEMINI_API_KEY`, and potentially `PORT`) in the Cloud Run service configuration.

**Deployed Service URL (Example):**
After a successful deployment, Cloud Run will provide a service URL, similar to the last known deployment: `https://deepgram-backend-upcbdbi5la-uc.a.run.app`

**Note:** This process only covers the backend deployment. The frontend application needs to be built and deployed separately (e.g., using a static hosting service like Firebase Hosting, Netlify, Vercel, or potentially another Cloud Run service configured for static hosting).
