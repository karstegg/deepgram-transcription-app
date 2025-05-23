import express from 'express';
import cors from 'cors';
// SDK imports below are removed as they are now handled in services
// import { createClient } from '@deepgram/sdk'; 
import ffmpeg from 'ffmpeg-static'; // Keep for now if any direct use remains, or move later
import ffprobe from 'ffprobe-static'; // Keep for now if any direct use remains, or move later
// import { exec } from 'child_process'; // This is used by controllers, not directly by server.js
// import fs from 'fs'; // This is used by controllers, not directly by server.js
// import path from 'path'; // This is used by controllers, not directly by server.js
// import { fileURLToPath } from 'url'; // This is used by controllers, not directly by server.js
import sseExpress from 'sse-express'; // Used for SSE route setup if routes remain in server.js
// import { v4 as uuidv4 } from 'uuid'; // This is used by controllers
// import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; 
// import mime from 'mime-types'; // This is used by controllers

import { PORT } from './config/config.js'; // UPLOADS_DIR_NAME removed as it's not used directly
import upload from './middleware/multerUpload.js';
// sseExpress and addClientConnection are no longer needed here as they are handled in sseRoutes.js
// import sseExpress from 'sse-express'; 
// import { addClientConnection } from './services/sseService.js'; 

import transcriptionRoutes from './routes/transcriptionRoutes.js';
import summarizationRoutes from './routes/summarizationRoutes.js';
import sseRoutes from './routes/sseRoutes.js';

// Helper comments remain

const app = express();
const port = PORT; // Use imported PORT

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SDK Initializations are removed from here. They are now handled within their respective services.
// Deepgram client is initialized in deepgramService.js
// Gemini client is initialized in geminiService.js

// Use the routers
app.use('/', sseRoutes); // Handles /progress/:clientId
app.use('/', transcriptionRoutes); // Handles /transcribe and /cancel/:clientId
app.use('/', summarizationRoutes); // Handles /summarize

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
