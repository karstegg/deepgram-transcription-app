# Frontend Refactoring Instructions

## 1. Current Project Status (as of May 25, 2025)

*   **Objective for Next Session:** Refactor the frontend application.
*   **Current Git Branch:** `development-refactor`
    *   Local and `origin/development-refactor` are synced at commit `be4fcf2` ("Fix: Consolidate working frontend and backend").
*   **Application URL:** [https://deepgram-transcription-app.web.app](https://deepgram-transcription-app.web.app)
    *   Status: Live and working. Transcription and summarization features tested successfully.
*   **Backend URL:** `https://deepgram-backend-upcbdbi5la-uc.a.run.app`
*   **Key Frontend Configuration:**
    *   API calls are centralized in `frontend/src/services/apiService.js`.
    *   `API_BASE_URL` in `apiService.js` is configured using `process.env.REACT_APP_BACKEND_URL` with a fallback to the live backend URL. This resolved previous SSE connection issues.
    *   Custom hooks (`useSummarizationService.js`, `useTranscriptionService.js`) import and utilize `apiService.js` for backend interactions.
*   **Build Process:**
    *   Command: `npm run build` (executed from the `frontend/` directory).
*   **Deployment Process:**
    *   Command: `firebase deploy --only hosting` (executed from the project root directory).
*   **Recent Milestone:** The application was successfully built and deployed from the `development-refactor` branch, resolving previous critical issues related to incorrect backend URL configurations affecting the summarization service.

## 2. Frontend Refactoring Guidelines for AI Assistant

### A. Core Objective
Improve the code structure, maintainability, readability, and potentially the performance of the React frontend, while ensuring all existing functionalities remain intact. The primary focus is `frontend/src/App.js` and its related components/hooks.

### B. General Principles & User Preferences
*   **Adhere to User-Defined Rules:** Strictly follow all rules specified in the global user memory (`MEMORY[user_global]`).
*   **Maintain All Existing Functionality:** The refactor must not introduce breaking changes or remove any features. The application should behave identically from a user's perspective.
*   **Improve Readability & Maintainability:** Use clear, descriptive names for variables, functions, components, and modules. Add JSDoc comments where logic is complex or non-obvious.
*   **Increase Modularity & Single Responsibility Principle (SRP):** Each new module, component, or function should have a single, well-defined responsibility.
*   **Reduce Code Complexity:** Break down large, complex functions into smaller, more manageable ones.
*   **Enhance Testability:** Smaller, focused units are generally easier to unit test.
*   **Follow Language/Framework Best Practices:** Adhere to established best practices for React (e.g., hooks rules, component patterns).
*   **Preserve Environment Variable Usage:** Ensure `apiService.js` continues to correctly use `process.env.REACT_APP_BACKEND_URL`.
*   **Manage Asynchronous Operations:** Ensure `async/await`, Promises, and callbacks are handled correctly to prevent race conditions or unhandled rejections, particularly within custom hooks and `apiService.js`.
*   **Clear Import/Export:** Ensure clear and correct `import` and `export` statements between the new modules.
*   **Styling:** Continue using Tailwind CSS as per current project setup.
*   **Accessibility (a11y):** Maintain or improve accessibility standards.

### C. Detailed Refactoring Strategies for `frontend/src/App.js`

`App.js` currently handles UI rendering, state management, API interactions, and event handling. The goal is to decouple these responsibilities.

1.  **Componentization (Break Down UI):**
    *   Divide the main UI in `App.js` into smaller, reusable presentational and container components.
    *   **Potential Components to Create/Refine:**
        *   `FileUploadArea`: Handling file input, drag-and-drop functionality.
        *   `TranscriptionControls`: Buttons for start/cancel transcription, model selection dropdown, advanced options toggle.
        *   `AdvancedOptionsPanel`: Checkboxes for diarization, transcription-based summarization, chunk size selection.
        *   `ProgressDisplay`: Showing progress messages, progress bar, and any SSE-related status updates.
        *   `ResultsTabs`: Managing the 'Transcription' and 'Summary' tabs and their content display.
        *   `Header`, `Footer`: Ensure they are clean and focused.
    *   Ensure clear separation of presentational and container logic where applicable.

2.  **Custom Hooks (Consolidate Logic):**
    *   Refine existing custom hooks (`useTranscriptionService.js`, `useSummarizationService.js`) and potentially create new ones to encapsulate business logic and state related to specific features.
    *   **Focus Areas for Hooks:**
        *   Transcription process logic (API calls via `apiService`, state, SSE handling).
        *   Summarization process logic (API calls via `apiService`, state, SSE handling).
        *   Overall application state management if certain states are shared across many new components (see State Management).
    *   Ensure hooks are well-defined, adhere to SRP, and follow the rules of hooks.

3.  **State Management:**
    *   Analyze the current state management in `App.js` (numerous `useState`, `useRef`, `useEffect`).
    *   Distribute state to the most relevant components or custom hooks.
    *   If shared state becomes complex across many sibling/distant components, consider React Context API for more idiomatic state sharing. For now, refactor within existing patterns (prop drilling, lifting state up, custom hooks) unless a clear need for a global state manager like Zustand or Redux is identified and explicitly requested by the user.

4.  **Service Layer (API Interactions):**
    *   Ensure `frontend/src/services/apiService.js` remains the *sole* point of interaction with the backend.
    *   All direct `axios` or `EventSource` calls should be within `apiService.js`.
    *   Custom hooks and components should call methods from `apiService.js`.

5.  **Utility Functions:**
    *   Identify any pure helper functions within `App.js` or other components.
    *   Move these to a dedicated `frontend/src/utils/` directory, organized into logical files (e.g., `fileUtils.js`, `textUtils.js`).

### D. Other Frontend Areas for Consideration
*   **`constants.js`:** Keep this file well-organized and ensure it only contains true, project-wide constants.
*   **Error Handling:** Review and enhance error handling throughout the application. Aim for clear, user-friendly error messages and consider robust error boundaries for critical sections.

### E. Refactoring Process
*   **Incremental Changes:** Propose changes in manageable, incremental steps.
*   **Clear Rationale:** For any significant structural changes, explain the reasoning and benefits.
*   **Testability:** After each set of refactoring changes, the application must remain buildable (`npm run build`) and all functionalities must be manually tested and confirmed to be working as before.
*   **Linting & Formatting:**
    *   Address ESLint warnings identified during builds (e.g., unused variables in `App.js` like `Share2`, `Github`).
    *   Ensure code formatting is consistent (Prettier is typically used with CRA).

### F. Output Expectations for Frontend Refactor
*   A revised directory structure within `frontend/src/` reflecting modularization (e.g., `components/`, `hooks/`, `services/`, `utils/`).
*   `frontend/src/App.js` will be significantly smaller, primarily serving as an entry point or orchestrator.
*   The application must build (`npm run build`) and run successfully without errors.
*   All functionalities must be thoroughly tested and confirmed to be working as before the refactor.

### G. Communication
*   Clearly state the files being modified and the nature of the changes.
*   If unsure about a refactoring approach, ask for user clarification.

### H. Step-by-Step Checkpoint-Based Refactor Process

To ensure stability and manage complexity, the frontend refactoring will follow an iterative, checkpoint-based approach. After each logical set of changes corresponding to a checkpoint, the following steps **must** be performed:

1.  **Build Frontend:** Execute `npm run build` from the `frontend/` directory. Ensure the build completes without errors.
2.  **Deploy Frontend:** Execute `firebase deploy --only hosting` from the project root directory. Ensure deployment is successful.
3.  **Thorough Testing:** Manually test all application functionalities on the live deployed version (`https://deepgram-transcription-app.web.app`). This includes:
    *   File selection and upload.
    *   Transcription with Deepgram models (various options like diarization).
    *   Transcription with Gemini models.
    *   Summarization with and without transcription.
    *   Progress updates (SSE).
    *   Error handling and display.
    *   Copy/Save transcript and summary.
    *   Reset/Cancel functionality.
    *   UI responsiveness and layout.
4.  **Commit Changes:** If all tests pass, commit the changes with a clear message detailing the refactoring step completed.
5.  **Proceed:** Only after successful testing and commit, proceed to the next checkpoint.

**Logical Refactoring Checkpoints:**

*   **Checkpoint 1: Initial Setup & Constants (`constants.js`)**
    *   Ensure `frontend/src/constants/constants.js` is created and populated with all relevant static values currently in `App.js` (e.g., `AVAILABLE_MODELS`, `DEFAULT_MODEL`, `CHUNK_SIZES_MB`, `SSE_EVENT_TYPES`, `TAB_IDS`).
    *   Update `App.js` and any other relevant files to import and use these constants.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 2: API Service Abstraction (`apiService.js`)**
    *   Ensure `frontend/src/services/apiService.js` is created (if not already present and correctly configured from previous work on `development-refactor` branch, verify its state).
    *   Centralize all direct backend API calls (`axios` POST requests, `EventSource` SSE connections for `/transcribe` and `/summarize`) from `App.js` into `apiService.js`.
    *   `apiService.js` should export functions that `App.js` (and later, custom hooks) can call (e.g., `initiateTranscriptionRequest`, `initiateSummarizationRequest`, `establishSSEConnection`).
    *   Ensure `API_BASE_URL` is correctly configured within `apiService.js` (using `process.env.REACT_APP_BACKEND_URL` with fallback).
    *   Update `App.js` to use these service functions.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 3: Transcription Logic to Custom Hook (`useTranscriptionService.js`)**
    *   Create `frontend/src/hooks/useTranscriptionService.js`.
    *   Move all state and logic related to the transcription process from `App.js` into this hook. This includes:
        *   State: `selectedFile`, `transcription`, `isLoading` (transcription part), `progressMessage`, `transcriptionError`, `selectedModel`, `enableDiarization`, `selectedChunkSize`, `eventSourceRef` (for transcription SSE).
        *   Logic: `handleFileChange`, `handleTranscription` (or its core parts), SSE event handlers for transcription, cancellation logic for transcription.
    *   The hook should expose necessary state values and action functions (e.g., `startTranscription`, `cancelTranscription`).
    *   `App.js` should import and use this hook, simplifying its own logic significantly.
    *   This hook will use `apiService.js` for backend communication.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 4: Summarization Logic to Custom Hook (`useSummarizationService.js`)**
    *   Create `frontend/src/hooks/useSummarizationService.js`.
    *   Move all state and logic related to the summarization process from `App.js` into this hook. This includes:
        *   State: `summary`, `isSummarizing`, `summarizationError`, `eventSourceRef` (if a separate SSE is used for summarization, or manage shared SSE).
        *   Logic: `handleSummarization` (or its core parts), SSE event handlers for summarization.
    *   The hook should expose necessary state values and action functions (e.g., `startSummarization`).
    *   `App.js` should import and use this hook.
    *   This hook will use `apiService.js`.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 5: UI Components - Advanced Options (`AdvancedOptionsPanel.js`)**
    *   Create `frontend/src/components/AdvancedOptionsPanel.js`.
    *   Move the UI and logic for selecting transcription model, chunk size, diarization toggle, and summarization toggle from `App.js` into this component.
    *   This component will receive current option values as props and call callback functions (also passed as props from `App.js` or relevant hooks) when options change.
    *   `App.js` will render `AdvancedOptionsPanel`, passing down necessary state and handlers (which might now come from the new hooks).
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 6: UI Components - File Upload & Controls (`FileUploadArea.js`, `TranscriptionControls.js`)**
    *   Create `frontend/src/components/FileUploadArea.js`: Manages file input, display of selected file name.
    *   Create `frontend/src/components/TranscriptionControls.js`: Contains "Transcribe File" and "Reset/Cancel" buttons.
    *   Move relevant JSX and logic from `App.js` to these components.
    *   These components will interact with `App.js` (or hooks) via props and callbacks.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 7: UI Components - Display Areas (`ProgressDisplay.js`, `ResultsTabs.js`, `TranscriptionOutput.js`, `SummaryOutput.js`)**
    *   Create `frontend/src/components/ProgressDisplay.js`: Shows loading indicators and progress messages.
    *   Create `frontend/src/components/ResultsTabs.js`: Manages the tabbed view for Transcription and Summary.
    *   Create `frontend/src/components/TranscriptionOutput.js`: Displays the formatted transcript and copy/save buttons for it.
    *   Create `frontend/src/components/SummaryOutput.js`: Displays the summary and copy/save buttons for it.
    *   Move relevant JSX and logic from `App.js`.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 8: Utility Functions (`utils/`)**
    *   Identify any pure helper functions remaining in `App.js` or newly created components/hooks (e.g., text formatting, file utilities if any).
    *   Move these to a new `frontend/src/utils/` directory, organized into logical files (e.g., `textUtils.js`, `fileUtils.js`).
    *   Update all imports.
    *   *Perform Build, Deploy, Test, Commit.*

*   **Checkpoint 9: Final `App.js` Cleanup & Review**
    *   Review `App.js`. It should now be significantly smaller, primarily orchestrating the main hooks and components.
    *   Remove any redundant state, props, or logic.
    *   Ensure consistent error handling and state management patterns are followed.
    *   Address any remaining ESLint warnings (e.g., unused imports like `Share2`, `Github` if still present).
    *   *Perform Final Build, Deploy, Thorough Test, Commit.*

This checkpoint-based approach, while meticulous, will help maintain a working application throughout the refactoring process and make it easier to pinpoint issues if they arise.

## 3. Future Backend Refactoring (Note)

The document `Refactor_Instructions_For_Jules.md` also contains detailed instructions for refactoring `backend/server.js`. This is out of scope for the immediate frontend refactoring task but can be revisited in a future session if desired.