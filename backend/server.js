import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routers
import sseRoutes from './routes/sseRoutes.js';
import transcriptionRoutes from './routes/transcriptionRoutes.js';
import summarizationRoutes from './routes/summarizationRoutes.js';

// Import UPLOADS_DIR_PATH from multerUpload.js to log its path and ensure it's evaluated.
// The actual creation and management of the uploads directory is handled within multerUpload.js.
import { UPLOADS_DIR_PATH } from './middleware/multerUpload.js';

// Helper for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Core Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log the uploads directory path (which is created by multerUpload.js if it doesn't exist)
console.log(`Uploads directory is managed by multerUpload.js and located at: ${UPLOADS_DIR_PATH}`);

// Mount routers
// The imported routers (sseRoutes, transcriptionRoutes, summarizationRoutes)
// already define their specific paths (e.g., /progress/:clientId, /transcribe, /summarize).
// So, we mount them at the root of the application.
app.use(sseRoutes);
app.use(transcriptionRoutes);
app.use(summarizationRoutes);

// Basic error handler (can be expanded as needed)
app.use((err, req, res, next) => {
  console.error("Global error handler caught an error:", err.stack);
  res.status(500).json({ error: 'Something went wrong on the server!', details: err.message });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Backend refactor phase 2: server.js now delegates to modular routers, controllers, and services.`);
});
