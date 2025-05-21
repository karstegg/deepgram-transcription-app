import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
// Potentially import other services like getFirestore if needed later

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCyJR1AlCT6B-Nl1mTLIYL9dJEhVSvpB0k",
  authDomain: "deepgram-transcription-app.firebaseapp.com",
  projectId: "deepgram-transcription-app",
  storageBucket: "deepgram-transcription-app.firebasestorage.app", // Corrected property name
  messagingSenderId: "628499708455",
  appId: "1:628499708455:web:598749deb42b3f8263ac02",
  measurementId: "G-5D3M5TCM27" // Optional
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Initialize Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Export the necessary Firebase services
export { app, auth, googleProvider };
