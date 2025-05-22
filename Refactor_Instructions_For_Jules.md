# Refactoring Instructions for `App.js` and `server.js` (Deepgram Transcription App)

## 1. Introduction

**Purpose:** To refactor `frontend/src/App.js` and `backend/server.js` for improved modularity, readability, and maintainability.

**Context:** These files have grown large and complex, making development, debugging, and onboarding new contributors challenging.

**Overall Goal:** Break down these monolithic files into smaller, more focused modules, components, and functions while preserving all existing functionality and ensuring the application remains robust and performant.

## 2. Refactoring `frontend/src/App.js` (React)

This file currently handles UI rendering, state management, API interactions, event handling, and more for the entire frontend application.

**Core Responsibilities to Decouple:**

*   **UI Rendering (JSX):** The main return statement and various conditional rendering blocks.
*   **State Management:** Numerous `useState`, `useRef`, and `useEffect` hooks managing various aspects of the application state.
*   **API Interaction Logic:** Asynchronous functions for transcription (`handleTranscription`), summarization (`handleSummarization`), and Server-Sent Events (SSE) for progress updates.
*   **Event Handling:** Functions for file selection, button clicks, drag-and-drop, tab changes, etc.
*   **Helper/Utility Functions:** Various smaller functions supporting the main logic.

**Suggested Refactoring Strategies:**

1.  **Componentization (Break Down UI):**
    *   Divide the main UI into smaller, reusable presentational and container components.
    *   **Potential Components:**
        *   `FileUploadArea`: Handling file input, drag-and-drop.
        *   `TranscriptionControls`: Buttons for start/cancel, model selection, advanced options toggle.
        *   `AdvancedOptionsPanel`: Checkboxes for diarization, summarization, chunk size selection.
        *   `ProgressDisplay`: Showing progress messages and the progress bar.
        *   `ResultsTabs`: Managing the 'Transcription' and 'Summary' tabs.
        *   `TranscriptionPanel`: Displaying the transcription text and copy/download controls.
        *   `SummaryPanel`: Displaying the summary text and copy/download controls.
        *   `ErrorDisplay`: Showing any error messages.
2.  **Custom Hooks (Extract Stateful Logic):**
    *   Extract complex stateful logic into custom React Hooks (e.g., `useTranscriptionService`, `useSummarizationService`).
    *   A `useTranscriptionService` hook could manage state related to file selection, transcription progress, results, and API calls to the `/transcribe` endpoint and its SSE progress.
    *   A `useSummarizationService` hook could manage state for summarization, API calls to `/summarize`, and its SSE progress.
3.  **Service Modules (Isolate API Calls):**
    *   Move Axios requests and EventSource setup/handling into dedicated service modules (e.g., `services/apiService.js` or more specific ones like `services/transcriptionService.js`, `services/summarizationService.js`).
    *   These services would be imported and used by custom hooks or components.
4.  **Utility Functions (`utils.js`):**
    *   Group general helper functions (e.g., formatting, simple calculations, DOM manipulations if any) into a `utils.js` file.
5.  **Constants (`constants.js`):**
    *   Move static values, default configurations (e.g., `backendUrl` if not from env, default model names, UI text strings if not internationalized) to a `constants.js` file.

**Key Areas in `App.js` to Focus On:**

*   The `handleTranscription` and `handleSummarization` async functions are prime candidates for extraction into custom hooks or service modules.
*   The main JSX `return (...)` statement is extensive and should be broken down into the components suggested above.
*   Numerous `useState` variables: Group related state within custom hooks or manage them within more localized components.

## 3. Refactoring `backend/server.js` (Node.js/Express)

This file currently sets up the Express server, defines all routes, handles request logic, interacts with external APIs (Deepgram, Gemini), manages file uploads, and handles SSE.

**Core Responsibilities to Decouple:**

*   **Express Server Setup:** Middleware configuration (`cors`, `express.json`, `dotenv`), port listening.
*   **Route Definitions:** Handlers for `/transcribe`, `/summarize`, `/progress/:clientId`.
*   **Request Handling Logic:** Business logic within each route.
*   **External API Interactions:** Deepgram SDK usage, Google Gemini SDK usage.
*   **File Handling:** Multer configuration and usage for audio file uploads.
*   **Server-Sent Events (SSE) Management:** Logic for managing client connections and streaming progress updates.

**Suggested Refactoring Strategies:**

1.  **Router Modules (`routes/` directory):**
    *   Move route definitions into separate files within a `routes/` directory (e.g., `routes/transcriptionRoutes.js`, `routes/sseRoutes.js`).
    *   The main `server.js` would then import and use these router modules.
2.  **Controller Functions (`controllers/` directory):**
    *   Extract the core logic from each route handler into dedicated controller functions.
    *   Example: `transcriptionController.js` could have `handleTranscribeRequest`, `geminiController.js` could have `handleSummarizeRequest`.
    *   Routers would call these controller functions.
3.  **Service Layers (`services/` directory):**
    *   For complex interactions with external APIs or core business logic, create service modules.
    *   Example: `services/deepgramService.js` to encapsulate all Deepgram SDK interactions, `services/geminiService.js` for Gemini interactions, `services/sseService.js` to manage SSE client connections and message broadcasting.
4.  **Configuration Management (`config/` directory or module):**
    *   While `.env` is used for API keys, a dedicated `config.js` module could centralize access to environment variables and other configurations (e.g., model names, default settings).
5.  **Middleware (`middleware/` directory):**
    *   Custom middleware (e.g., for error handling, request logging, authentication if added later) should reside in its own directory.
    *   Multer setup can be a middleware module.

**Key Areas in `server.js` to Focus On:**

*   The `/transcribe` endpoint logic: involves Multer, Deepgram SDK, SSE client registration, and asynchronous operations.
*   The `/summarize` endpoint logic: involves Gemini SDK and SSE client registration.
*   The `/progress/:clientId` SSE endpoint: manages client connections and event streaming.
*   Initialization of Deepgram and Gemini clients.

## 4. General Refactoring Guidelines (Applicable to Both Files)

*   **Maintain All Existing Functionality:** The refactor must not introduce breaking changes or remove any features. The application should behave identically from a user's perspective.
*   **Improve Readability & Maintainability:** Use clear, descriptive names for variables, functions, components, and modules. Add comments where logic is complex or non-obvious.
*   **Increase Modularity & Single Responsibility Principle (SRP):** Each new module, component, or function should have a single, well-defined responsibility.
*   **Reduce Code Complexity:** Break down large, complex functions into smaller, more manageable ones.
*   **Enhance Testability:** Smaller, focused units are generally easier to unit test.
*   **Follow Language/Framework Best Practices:** Adhere to established best practices for React (e.g., hooks rules, component patterns) and Node.js/Express (e.g., middleware patterns, asynchronous programming).
*   **Preserve Environment Variable Usage:** Continue to load API keys and other sensitive configurations via `dotenv` and `process.env`.
*   **Manage Asynchronous Operations:** Ensure `async/await`, Promises, and callbacks are handled correctly to prevent race conditions or unhandled rejections.
*   **Clear Import/Export:** Ensure clear and correct `import` and `export` statements between the new modules.

## 5. Output Expectations

*   A new directory structure for both `frontend/src` and `backend` reflecting the modularization (e.g., `components/`, `hooks/`, `services/`, `utils/` for frontend; `routes/`, `controllers/`, `services/`, `middleware/` for backend).
*   The original `App.js` and `server.js` files will be significantly smaller, primarily serving as entry points or orchestrators for their respective parts of the application.
*   The application must build and run successfully without errors after refactoring.
*   All functionalities must be tested and confirmed to be working as before.

Thank you for your assistance with this refactoring task!
