import { createClient } from '@deepgram/sdk';
import config from '../config.js';
import path from 'path';
import fs from 'fs';

// Initialize Deepgram client
const deepgramClient = createClient(config.DEEPGRAM_API_KEY);

// deepgramService.js - Handles interactions with the Deepgram API.

// Initialize Deepgram client
const dgClient = createClient(config.DEEPGRAM_API_KEY); // Renamed for clarity

/**
 * Transcribes a single audio chunk using Deepgram's pre-recorded audio API.
 * @param {string} clientId - Identifier for the client request.
 * @param {string} chunkPath - Path to the audio chunk file.
 * @param {boolean} diarizeEnabled - Whether to enable diarization.
 * @param {string} modelName - The Deepgram model to use for transcription.
 * @param {function} sendProgress - Callback function to send progress/results via SSE.
 * @returns {Promise<string|null>} The plain transcript string, or null if transcription failed.
 */
const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, modelName, sendProgress) => {
    const chunkFilename = path.basename(chunkPath);
    const effectiveModel = modelName || config.DEEPGRAM_MODEL_NAME;
    console.log(`[${clientId}] Starting Deepgram transcription for chunk: ${chunkFilename}. Options: Diarize=${diarizeEnabled}, Model=${effectiveModel}`);
    
    const transcriptionOptions = { 
        punctuate: true, 
        smart_format: true, 
        model: effectiveModel,
        ...(diarizeEnabled && { diarize: true }) // Conditionally add diarize option
    };

    try {
        const audioBuffer = fs.readFileSync(chunkPath);
        console.log(`[${clientId}] Read audio buffer for ${chunkFilename} (${(audioBuffer.length / 1024).toFixed(2)} KB). Sending to Deepgram API.`);
        
        // Note: Deepgram SDK's transcribeFile can also take a URL. Using buffer here.
        const { result, error: dgError } = await dgClient.listen.prerecorded.transcribeFile(
            audioBuffer, 
            transcriptionOptions
        );

        if (dgError) { 
            // Deepgram SDK error object often contains more details.
            const errorDetails = typeof dgError === 'object' ? JSON.stringify(dgError, null, 2) : dgError;
            console.error(`[${clientId}] Deepgram API returned an error for chunk ${chunkFilename}: ${errorDetails}`);
            throw new Error(`Deepgram API Error: ${dgError.message || errorDetails}`); 
        }

        if (!result || !result.results || !result.results.channels || result.results.channels.length === 0) {
            console.warn(`[${clientId}] Deepgram response for ${chunkFilename} did not contain expected results structure. Result: ${JSON.stringify(result)}`);
            throw new Error("Deepgram returned an invalid or empty response structure.");
        }

        let formattedTranscript = '';
        const plainTranscript = result.results.channels[0].alternatives?.[0]?.transcript ?? '';

        if (diarizeEnabled && result.results.channels[0].alternatives?.[0]?.paragraphs?.paragraphs) {
            const paragraphsData = result.results.channels[0].alternatives[0].paragraphs;
            console.log(`[${clientId}] Diarization successful for ${chunkFilename}. Confidence: ${paragraphsData.confidence}, Paragraphs: ${paragraphsData.paragraphs.length}.`);
            paragraphsData.paragraphs.forEach(p => {
                const speakerLabel = p.speaker !== null && p.speaker !== undefined ? `Speaker ${p.speaker}` : 'Unknown Speaker';
                const sentenceText = p.sentences?.map(s => s.text).join(' ') ?? '';
                formattedTranscript += `${speakerLabel}: ${sentenceText}\n\n`;
            });
        } else {
            if (diarizeEnabled) { 
                console.warn(`[${clientId}] Diarization enabled for ${chunkFilename}, but no paragraph data found. Transcript length: ${plainTranscript.length}.`); 
            }
            formattedTranscript = plainTranscript + ' '; // Ensure a space for joining plain transcripts later
        }
        
        console.log(`[${clientId}] Deepgram transcription successful for ${chunkFilename}. Plain transcript length: ${plainTranscript.length}.`);
        if (formattedTranscript.trim().length > 0) {
             sendProgress(clientId, 'partial_transcript', { transcript: formattedTranscript }); 
        }
        return plainTranscript; 
    } catch (error) {
        console.error(`[${clientId}] Error during Deepgram transcription for ${chunkFilename}: ${error.message}`, error.stack ? `\nStack: ${error.stack}` : '');
        sendProgress(clientId, 'error', { message: `Deepgram processing failed for chunk ${chunkFilename}: ${error.message}` });
        return null; 
    }
};

// Exporting deepgramClient (aliased as dgClient internally) for potential direct use if ever needed, though typically not.
export { dgClient as deepgramClient, transcribeChunkPrerecorded };
