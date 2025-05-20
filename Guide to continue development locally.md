I. Local Development Environment Setup

This section ensures your local environment is ready. You're likely already set up, but this is a good checklist.

Verify API Keys for Local Backend:

Navigate to your backend directory.
Ensure you have a .env file (backend/.env).
Confirm it contains your actual API keys and the local port:
DEEPGRAM_API_KEY=YOUR_ACTUAL_DEEPGRAM_API_KEY
GEMINI_API_KEY=YOUR_ACTUAL_GEMINI_API_KEY
PORT=5000


If these keys are missing or incorrect, your local backend won't be able to communicate with Deepgram or Gemini.
Ensure Dependencies are Installed:

Backend:
cd backend
npm install 
cd ..



Frontend:
cd frontend
npm install
cd ..



II. Local Development & Testing Workflow

This is your day-to-day workflow for making and testing changes.

Branching Strategy (Highly Recommended):

Always create a new branch for each new feature, bug fix, or refactoring task. This keeps your development branch clean and stable.
# Make sure you are on the development branch
git switch development
git pull origin development # Ensure it's up-to-date

# Create and switch to a new feature branch
git switch -c my-new-feature



Do all your work on this my-new-feature branch.
Running the Backend Locally:

Open a terminal and navigate to the backend directory.
Start the backend server. Based on your DEPLOY_RUN_INSTRUCTIONS_GCP.md, use:
cd backend
node server.js



(Or npm run dev if you have a dev script configured in backend/package.json that runs server.js, perhaps with nodemon).
The backend should now be running, typically on http://localhost:5000 (or the PORT specified in backend/.env).
Running the Frontend Locally:

Open another terminal and navigate to the frontend directory.
Start the React development server:
cd frontend
npm start



This will usually open your application in a browser at http://localhost:3000.
Connecting Local Frontend to Local Backend:

Your frontend needs to know where to send API requests. When running locally, it should target your local backend.
In frontend/src/App.js, you have lines like:
// For handleSummarization
const backendUrl = 'https://deepgram-backend-upcbdbi5la-uc.a.run.app'; 
// ...
await axios.post(`${backendUrl}/summarize`, payload);

// For handleTranscription
const response = await axios.post('http://localhost:5000/transcribe', formData, { ... });
// ...
const eventSource = new EventSource(`http://localhost:5000/progress/${clientId}`);


Crucial: For local development, ensure all backend URLs used by Axios (for /transcribe, /summarize, and EventSource for /progress) point to your local backend (e.g., http://localhost:5000).
Recommendation: Use environment variables for the backend URL.
Create a .env file in your frontend directory (frontend/.env).
Add: REACT_APP_BACKEND_URL=http://localhost:5000
In App.js, use process.env.REACT_APP_BACKEND_URL instead of hardcoding the URL.
const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'; // Fallback for safety


When you build for production (Firebase deployment), this variable can be different or omitted if the production frontend is intended to call the production Cloud Run URL.
Making & Testing Changes:

Modify your code in the frontend or backend directories.
The local React development server (frontend) will usually hot-reload your changes in the browser.
If you change backend code, you'll need to restart the backend server (Ctrl+C then node server.js again, unless you're using nodemon which restarts automatically).
Test thoroughly in your local browser.
III. Deployment Workflow (Testing Changes on Cloud)

Once you're happy with local changes on your feature branch, deploy them to see how they behave in the cloud environment.

Commit Your Changes:

Commit the work on your feature branch:
git add .
git commit -m "Description of my new feature or fix"



Deploying the Backend to Google Cloud Run:

Service Naming:
For testing experimental changes, it's best to deploy to a separate, temporary Cloud Run service to avoid disrupting your main deepgram-backend service. For example, deepgram-backend-testing.
If you're confident and updating the main service, you can use deepgram-backend.
API Keys & Secrets:
Verify your secret names in Google Secret Manager for the deepgram-transcription-app project. The error you saw ('projects/.../secrets/deepgram-api-key' is not a valid secret name) means the name was incorrect.
Let's assume your actual secret names are MY_DEEPGRAM_SECRET_NAME and MY_GEMINI_SECRET_NAME.
Deployment Command (Replace placeholders):
gcloud run deploy [YOUR_SERVICE_NAME] \
  --source backend \
  --region us-central1 \
  --project deepgram-transcription-app \
  --set-secrets="DEEPGRAM_API_KEY=projects/deepgram-transcription-app/secrets/MY_DEEPGRAM_SECRET_NAME:latest,GEMINI_API_KEY=projects/deepgram-transcription-app/secrets/MY_GEMINI_SECRET_NAME:latest" \
  --set-env-vars="PORT=8080" \ # Cloud Run listens on port 8080 by default
  --allow-unauthenticated # If your service needs to be publicly accessible



Replace [YOUR_SERVICE_NAME] (e.g., deepgram-backend-testing or deepgram-backend).
Replace MY_DEEPGRAM_SECRET_NAME and MY_GEMINI_SECRET_NAME with the actual names from Secret Manager.
This command builds the container from your backend directory and deploys it. Note the service URL output at the end.
Deploying the Frontend to Firebase Hosting:

Configure Backend URL for Production (if needed): If you used REACT_APP_BACKEND_URL, ensure that for a production build, it points to your deployed Cloud Run service URL (e.g., https://deepgram-backend-upcbdbi5la-uc.a.run.app). You can manage this through different .env files (e.g., .env.production) or by temporarily changing it before building.
Build the Frontend:
cd frontend
npm run build
cd ..



Deploy to Firebase:
firebase deploy --only hosting



This will deploy the contents of your frontend/build folder.
Testing Deployed Versions:

Open your Firebase Hosting URL (e.g., https://deepgram-transcription-app.web.app).
Perform a hard refresh (Ctrl+Shift+R or Cmd+Shift+R) in your browser to ensure you're loading the latest frontend files.
Test the full transcription and summarization flow.
IV. Debugging Deployed Versions

Backend (Cloud Run): Check the logs for your service in the Google Cloud Console (Logging > Logs Explorer, filter by Cloud Run Revision). Look at both stdout and stderr.
Frontend: Use your browser's developer tools (Console and Network tabs) to check for errors or inspect API requests/responses.
V. Merging and Syncing

If Deployed Test is Successful:
Merge your feature branch into your local development branch:
git switch development
git merge my-new-feature



Push the updated development branch to your remote repository:
git push origin development



You can then delete your feature branch if you no longer need it:
git branch -d my-new-feature # Local
git push origin --delete my-new-feature # Remote (optional)



Deploy development Branch: If you were testing on a temporary Cloud Run service (deepgram-backend-testing), you might now want to deploy the merged development branch to your main deepgram-backend Cloud Run service using the same gcloud run deploy command, but targeting the main service name.
Key Considerations for Smooth Workflow:

API Key Management:
Local: Use backend/.env (and ensure this file is in .gitignore so it's not committed).
Cloud Run (Production/Staging): Use Google Secret Manager as recommended. This is more secure and manageable. The gcloud run deploy --set-secrets flag is the way to link these.
Backend URL Configuration in Frontend: Using REACT_APP_BACKEND_URL in frontend/.env (for local) and managing build configurations or manually setting it for production deployments makes it easier to switch between environments.
Clean Commits: Make small, logical commits on your feature branches.
Regular Pushes: Push your feature branches to the remote repository regularly to back them up.
By following this structured approach, you can effectively manage local development, test changes in the cloud, and maintain a stable development branch. Remember to adjust service names and secret names in the deployment commands according to your actual setup.




