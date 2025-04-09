# Product Requirements Document: Audio/Video Transcription App

## 1. Introduction

This document outlines the requirements for a web application designed to provide users with an easy way to transcribe audio and video files using state-of-the-art AI models. The application offers flexibility through model selection and optional features like speaker diarization and summarization.

## 2. Goals

*   Provide a user-friendly interface for uploading audio/video files.
*   Offer transcription using high-quality AI models (Deepgram and Google Gemini).
*   Support processing of large media files.
*   Provide optional features for speaker diarization and text summarization.
*   Allow users to easily access, copy, and save the generated results.
*   Give feedback to the user during the transcription process.

## 3. Target Audience

*   Content Creators (Podcasters, YouTubers) needing transcripts.
*   Researchers analyzing audio/video data.
*   Students needing lecture notes.
*   Developers experimenting with STT APIs.
*   General users needing occasional transcription.

## 4. Features / User Stories

*   **F1: File Upload:** As a user, I can select and upload an audio or video file from my local machine through the web interface.
*   **F2: Model Selection:** As a user, I can choose the desired transcription model from a list of available options (currently Deepgram Nova-2, Nova-3, Gemini 1.5 Pro Exp).
*   **F3: Chunk Size (Deepgram):** As a user, when selecting a Deepgram model, I can choose an approximate target chunk size (2MB, 5MB, 10MB) to influence how large files are processed.
*   **F4: Diarization Option:** As a user, I can enable or disable speaker diarization via a checkbox to identify different speakers in the transcript.
*   **F5: Summarization Option:** As a user, I can enable or disable summary generation via a checkbox (uses Gemini API).
*   **F6: Transcription Process:** As a user, I can initiate the transcription process by clicking a button after selecting a file.
*   **F7: Progress Feedback:** As a user, I can see status messages indicating the current stage of the process (uploading, analyzing, splitting, transcribing chunk X/Y, summarizing, complete, error).
*   **F8: Transcript Display:** As a user, I can see the generated transcript displayed in a readable text area. If diarization is enabled and successful, speaker labels should precede the corresponding text.
*   **F9: Summary Display:** As a user, if summarization was enabled and successful, I can see the generated summary displayed in a separate text area.
*   **F10: Copy Output:** As a user, once transcription is complete, I can click a button to copy the full output (summary + transcript) to my clipboard.
*   **F11: Save Output:** As a user, once transcription is complete, I can click a button to save the full output (summary + transcript) as a `.txt` file.
*   **F12: Reset:** As a user, I can click a button to clear the selected file, results, and options, resetting the interface.
*   **F13: Cancel (Frontend):** As a user, while processing is ongoing, I can click a button to stop *listening* for updates and reset the UI (backend process may continue).
*   **F14: Auto-Scroll:** As a user, the transcription text area should automatically scroll to the bottom as new text is added (relevant for Deepgram chunked output).

## 5. Non-Functional Requirements

*   **File Size:** The application should handle uploads up to 500MB (as configured in Multer). Note Gemini inline data limit is ~15MB.
*   **Security:** API keys must not be exposed in the frontend code and should be loaded from environment variables on the backend.
*   **Error Handling:** Clear error messages should be displayed to the user for common issues (e.g., file upload failure, API errors, unsupported file types).
*   **Usability:** The interface should be intuitive and easy to use.

## 6. Future Considerations / Potential Enhancements

*   **UI Modernization:** Re-implement the frontend using a component library like MUI for a more polished look and feel.
*   **Backend Cancellation:** Implement full cancellation on the backend to stop FFMpeg/API calls.
*   **Gemini Large File Support:** Investigate and implement the Gemini File API to support transcription of files larger than ~15MB with Gemini models.
*   **Advanced Summarization:** Integrate external LLMs (OpenAI, Anthropic) for more customizable summary lengths and styles via prompting.
*   **Deployment:** Containerize (Docker) and deploy the application to a cloud hosting platform (Vercel, Netlify, AWS, Google Cloud Run, etc.).
*   **Format Options:** Allow users to select output format (e.g., plain text, SRT subtitles).
*   **Authentication:** Add user accounts if intended for wider use beyond personal tool.
*   **Cost Management:** Implement checks or warnings related to potential API costs, especially for Gemini.
