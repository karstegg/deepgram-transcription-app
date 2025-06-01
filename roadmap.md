# Project Roadmap & Future Objectives

The following outlines the planned enhancements and future direction for the application:

1.  **Refactor `frontend/src/App.js` and `backend/server.js`:**
    *   Utilize a tool like "Jules by Google" or similar methods to modularize these large files.
    *   **Goal:** Improve code organization, readability, and maintainability for easier debugging and development.
    *   **Status (June 2025):** Largely complete. Both frontend and backend have undergone significant modularization.

2.  **Test Refactored Implementation:**
    *   Conduct thorough end-to-end testing after refactoring to ensure all functionalities remain intact.
    *   **Status (June 2025):** Initial testing post-refactor was successful. Ongoing comprehensive testing is recommended.

3.  **Handle File Size Limits:**
    *   **Google Cloud Run (GCR):** Address GCR's request size limits (e.g., default 32MB) for large audio/video file uploads.
        *   **Status (June 2025):** Backend already chunks large files for Deepgram.
    *   **Google Gemini:** Address the ~15MB file size limit when using `inlineData` for Gemini transcription/summarization.
        *   **Status (June 2025):** This limit is still in place. An asynchronous plan using GCR Jobs for very large summarization was researched but deferred as current synchronous methods handled test cases. Re-evaluating Gemini File API or implementing the async plan could be future steps if needed.
    *   **Potential Solutions:** Explore streaming uploads, client-side file chunking with server-side reassembly, or leveraging Google Cloud Storage (GCS) more extensively.

4.  **Verify User Account Management & Deploy to Production:**
    *   If user account management features are planned or implemented, ensure they are robust and working correctly.
    *   Prepare for and execute deployment to a designated production environment beyond current setup.
    *   **Status (June 2025):** User account management has not been a recent focus. The application is deployed and functional, but "production" readiness might involve additional considerations (e.g., monitoring, advanced logging, separate environments).

5.  **Structured Summarization:**
    *   Enhance the summarization feature to allow users to define or select predefined sections/headings (e.g., for meeting minutes: "Action Items," "Decisions," "Key Discussion Points"), guiding the AI to produce more structured output.
    *   **Status (June 2025):** Planned new feature.

6.  **Update Existing Documents with New Transcripts:**
    *   Implement functionality for users to upload an existing document (e.g., previous meeting minutes).
    *   The application will then use a new audio transcript to intelligently update the existing document or generate a new version, incorporating the latest information.
    *   **Status (June 2025):** Planned new feature.

## Additional Considerations & Potential Enhancements:

*   **Address Frontend Lint Warnings:** Resolve outstanding ESLint warnings in the frontend codebase.
*   **Enhance "Cancel" Button:** Improve the frontend "Cancel" button to attempt termination of backend processes.
*   **UI/UX Improvements:** Consider further UI/UX enhancements beyond basic HTML/CSS.
*   **Error Handling Granularity:** Implement more specific and user-friendly error messages for various failure scenarios.
*   **Google Secret Manager Integration:** Revisit integrating Google Secret Manager for API key management in Cloud Run.
*   **Streaming Uploads:** For very large files, explore true end-to-end streaming capabilities.

*(For original refactoring guidelines, see `Refactor_Instructions_For_Jules.md`)*
