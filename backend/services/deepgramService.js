// backend/services/deepgramService.js
import { createClient } from '@deepgram/sdk';
import { DEEPGRAM_API_KEY } from '../config/config.js';

let deepgramClient;

const initializeDeepgramClient = () => {
    if (!DEEPGRAM_API_KEY) {
        console.warn("DEEPGRAM_API_KEY not found. Deepgram features may be limited.");
        return null;
    }
    if (!deepgramClient) {
        deepgramClient = createClient(DEEPGRAM_API_KEY);
        console.log("Deepgram client initialized.");
    }
    return deepgramClient;
};

// Initialize on load
initializeDeepgramClient();

export const getDeepgramClientInstance = () => {
    return initializeDeepgramClient(); // Ensures it's initialized
};

export const transcribeAudioFile = async (audioBuffer, options) => {
    const client = getDeepgramClientInstance();
    if (!client) {
        return { result: null, error: new Error("Deepgram client not initialized.") };
    }
    try {
        const { result, error } = await client.listen.prerecorded.transcribeFile(audioBuffer, options);
        if (error) { throw error; }
        return { result, error: null };
    } catch (err) {
        console.error("Error during Deepgram transcription:", err);
        return { result: null, error: err };
    }
};
