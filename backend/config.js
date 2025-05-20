import dotenv from 'dotenv';
import ffmpegPath from 'ffmpeg-static'; // Changed import
import ffprobeStatic from 'ffprobe-static'; // Changed import

dotenv.config();

const config = {
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  PORT: process.env.PORT || 5000,
  GEMINI_MODEL_NAME: "gemini-1.5-flash-latest", // Using the latest applicable model
  DEEPGRAM_MODEL_NAME: "nova-2",
  DEFAULT_CHUNK_SIZE_MB: 10,
  DIRECT_PROCESSING_THRESHOLD_SEC: 30,
  MAX_INLINE_BYTES_GEMINI: 15 * 1024 * 1024, // 15MB
  FFMPEG_PATH: ffmpegPath, // Use the imported path directly
  FFPROBE_PATH: ffprobeStatic.path, // Use the .path property from the imported object
};

export default config;
