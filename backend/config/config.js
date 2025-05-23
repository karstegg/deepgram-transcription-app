import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 5000;
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL_NAME = "gemini-1.5-flash-latest";
export const UPLOADS_DIR_NAME = "uploads"; // Name of the directory for uploads
