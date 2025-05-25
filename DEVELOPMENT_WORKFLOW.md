# Development Workflow Guidelines

This document outlines the recommended workflow for building and adding new features to the Audio/Video Transcription App. Following these guidelines will help maintain code quality, consistency, and a stable development environment.

## 1. Define the Feature & Plan

*   **Scope Definition:** Clearly define the requirements and user stories for the new feature.
*   **Task Breakdown:** Break down the feature into smaller, manageable tasks.
*   **Impact Assessment:** Identify which parts of the existing codebase will be affected or can be reused (e.g., existing components, services, backend endpoints).

## 2. Create a Feature Branch

*   Always start new work on a dedicated feature branch to keep `development-refactor` (or the main development branch) stable.
*   Branch off from the latest version of `development-refactor`:
    ```bash
    git checkout development-refactor
    git pull origin development-refactor
    git checkout -b feature/your-new-feature-name
    ```
    *(Replace `your-new-feature-name` with a descriptive name, e.g., `feature/user-authentication` or `feature/export-transcript-pdf`)*

## 3. Develop Incrementally

*   **Frontend (`frontend/src/`):**
    *   Leverage the modular structure:
        *   New UI elements: Create components in `src/components/`.
        *   Complex state logic or side effects: Create custom hooks in `src/hooks/`.
        *   API interactions: Add/update functions in `src/services/apiService.js`.
        *   Shared utilities: Add to `src/utils/utils.js`.
        *   Constants: Add to `src/constants/constants.js`.
    *   Prioritize creating reusable components.
*   **Backend (`backend/server.js`):**
    *   Add new routes or modify existing ones.
    *   Organize business logic, potentially using helper functions if routes become complex.
*   **Commit Frequently:** Make small, logical commits with clear, descriptive messages (e.g., "Feat: Add user registration form component", "Fix: Correct API endpoint for summary"). This makes tracking and reverting changes easier.

## 4. Test Locally

*   Continuously test the feature as you develop.
*   Ensure both frontend and backend are running locally and communicating correctly.
*   Test edge cases and error handling.

## 5. Update Documentation

*   As you develop, make notes of changes that will affect `CODE_DOCUMENTATION.md` or other relevant documentation.
*   Update the documentation concurrently with feature development, not just as an afterthought. This includes:
    *   New components, services, or API endpoints.
    *   Changes to the communication flow.
    *   Updates to the folder structure if applicable.
*   Keep `latest_progress_log.md` updated with significant milestones.

## 6. Review

*   **Self-Review:** Before considering the feature complete, review all your changes. Check for:
    *   Code quality and clarity.
    *   Adherence to the established project structure and conventions.
    *   Whether the feature meets all defined requirements.
    *   Removal of any debugging code or unnecessary comments.
*   **Pull Request (Recommended even for solo work):**
    *   Push your feature branch to the remote repository:
        ```bash
        git push origin feature/your-new-feature-name
        ```
    *   Create a Pull Request (PR) on GitHub (or your Git platform) from your feature branch to `development-refactor`.
    *   The PR description should summarize the changes and the purpose of the feature.
    *   Review the "Files changed" tab in the PR to see a consolidated diff.

## 7. Merge into Development Branch

*   Once the feature is complete, tested, documented, and reviewed (and any CI checks pass if configured):
    *   Ensure `development-refactor` is up-to-date:
        ```bash
        git checkout development-refactor
        git pull origin development-refactor
        ```
    *   Merge the feature branch. Using `--no-ff` (no fast-forward) is recommended as it creates a merge commit, preserving the history of the feature branch.
        ```bash
        git merge --no-ff feature/your-new-feature-name
        ```
    *   Resolve any merge conflicts carefully.
    *   Push the updated `development-refactor` branch:
        ```bash
        git push origin development-refactor
        ```

## 8. Deploy

*   After merging to `development-refactor`, the integrated changes can be deployed.
*   Follow the established deployment procedures for the backend (Google Cloud Run) and frontend (Firebase Hosting).

## 9. Clean Up Feature Branch (Optional but Recommended)

*   After a successful merge and deployment, the feature branch is no longer needed and can be deleted to keep the repository clean.
    *   Delete the local branch:
        ```bash
        git branch -d feature/your-new-feature-name
        ```
    *   Delete the remote branch:
        ```bash
        git push origin --delete feature/your-new-feature-name
        ```

## Key Principles for Ongoing Development

*   **Modularity:** Continue to build small, focused, and reusable components and functions.
*   **Separation of Concerns:** Maintain clear distinctions between UI logic, state management, business logic, and API interactions.
*   **DRY (Don't Repeat Yourself):** Actively look for opportunities to abstract and reuse code.
*   **Iterative Refactoring:** If you identify small areas for improvement or code smells while working on a new feature, address them. This prevents the accumulation of technical debt and avoids the need for large, disruptive refactors later.
*   **Consistent Naming & Style:** Follow the established naming conventions and code style of the project.

By adhering to this workflow, we can ensure a more streamlined, robust, and maintainable development process for the project.