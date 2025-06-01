// backend/controllers/transcriptionController.js
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

import { UPLOADS_DIR_NAME, GEMINI_MODEL_NAME } from '../config/config.js'; // Added GEMINI_MODEL_NAME
import { sendSseMessage, closeSseConnection } from '../services/sseService.js';

import { Storage } from '@google-cloud/storage';

// SDK clients are now imported from services
import { transcribeAudioFile } from '../services/deepgramService.js';
import { generateGeminiContent, getGeminiModelInstance } from '../services/geminiService.js'; // getGeminiModelInstance for checking if summarization is possible

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
  console.error('CRITICAL ERROR: GCS_BUCKET_NAME is not set in environment variables. GCS operations will fail.');
  // This module might still load, but GCS-dependent operations will throw errors.
}
const uploadsDir = path.join(__dirname, '..', UPLOADS_DIR_NAME); // Correct path from controller

// Track active processes for cancellation, moved from server.js
const activeProcesses = {};

// FFMpeg Chunking Function (moved from server.js)
const splitMediaIntoAudioChunks = (clientId, filePath, targetChunkSizeMB = 10) => {
    return new Promise(async (resolve, reject) => {
        const targetChunkSizeBytes = targetChunkSizeMB * 1024 * 1024;
        let segmentDurationSec = 600;
        try {
            sendSseMessage(clientId, 'status', { message: 'Analyzing file for chunking...' });
            const ffprobePath = ffprobe.path;
            const probeCommand = `"${ffprobePath}" -v error -show_format -show_streams -of json "${filePath}"`;
            const { stdout: probeJson } = await new Promise((resolveCmd, rejectCmd) => {
                exec(probeCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                    if (error) { rejectCmd(new Error(`FFprobe failed: ${stderr || error.message}`)); } else { resolveCmd({ stdout }); }
                });
            });
            const probeData = JSON.parse(probeJson);
            const format = probeData.format;
            if (format?.duration && format?.size) {
                const totalDurationSec = parseFloat(format.duration);
                const totalSizeBytes = parseInt(format.size, 10);
                const avgBitrateBps = totalSizeBytes / totalDurationSec;
                if (avgBitrateBps > 0) {
                    const expectedChunks = Math.ceil(totalSizeBytes / targetChunkSizeBytes);
                    segmentDurationSec = Math.ceil(totalDurationSec / expectedChunks);
                    segmentDurationSec = Math.max(10, Math.min(segmentDurationSec, 900));
                    console.log(`[${clientId}] File size: ${(totalSizeBytes / 1024 / 1024).toFixed(2)}MB, Target chunk size: ${targetChunkSizeMB}MB`);
                    console.log(`[${clientId}] Expected chunks: ${expectedChunks}, Calculated segment duration: ${segmentDurationSec}s`);
                } else { console.warn(`[${clientId}] Could not calculate bitrate, using default duration.`); }
            } else { console.warn(`[${clientId}] Could not get duration/size, using default duration.`); }
            sendSseMessage(clientId, 'status', { message: `Splitting into ~${segmentDurationSec}s chunks...` });
        } catch (probeError) {
            console.error(`[${clientId}] Error during ffprobe analysis:`, probeError);
            sendSseMessage(clientId, 'warning', { message: `Could not analyze file, using default chunk duration.` });
        }
        const outputPattern = path.join(uploadsDir, `${clientId}_chunk_%03d.mp3`);
        const command = `"${ffmpeg}" -i "${filePath}" -f segment -segment_time ${segmentDurationSec} -vn -acodec libmp3lame -ar 16000 -ac 1 -reset_timestamps 1 "${outputPattern}"`;
        const ffmpegProcess = exec(command);

        if (!activeProcesses[clientId]) {
            activeProcesses[clientId] = [];
        }
        activeProcesses[clientId].push(ffmpegProcess);

        let stderrData = '';
        ffmpegProcess.stderr.on('data', (data) => { stderrData += data.toString(); });

        ffmpegProcess.on('close', (code) => {
            console.warn(`[${clientId}] FFmpeg stderr output:\n${stderrData}`);
            if (activeProcesses[clientId]) {
                const index = activeProcesses[clientId].indexOf(ffmpegProcess);
                if (index !== -1) activeProcesses[clientId].splice(index, 1);
                if (activeProcesses[clientId].length === 0) delete activeProcesses[clientId];
            }
            if (code !== 0 && code !== null) {
                return reject(new Error(`Error splitting file (FFmpeg code ${code})`));
            }
            const chunks = fs.readdirSync(uploadsDir).filter(f => f.startsWith(`${clientId}_chunk_`) && f.endsWith('.mp3')).map(f => path.join(uploadsDir, f)).sort();
            console.log(`[${clientId}] Found ${chunks.length} MP3 chunks.`);
            sendSseMessage(clientId, 'status', { message: `Found ${chunks.length} audio chunks.` });
            if (chunks.length === 0) { return reject(new Error(`No audio chunks created.`)); }
            resolve(chunks);
        });
        ffmpegProcess.on('error', (err) => {
            if (activeProcesses[clientId]) {
                const index = activeProcesses[clientId].indexOf(ffmpegProcess);
                if (index !== -1) activeProcesses[clientId].splice(index, 1);
                if (activeProcesses[clientId].length === 0) delete activeProcesses[clientId];
            }
            reject(new Error(`Error executing FFmpeg: ${err.message}`));
        });
    });
};

// Deepgram Pre-recorded Transcription Function (moved from server.js)
const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, model) => {
    const chunkName = path.basename(chunkPath);
    console.log(`[${clientId}] Transcribing chunk: ${chunkName} (Diarize: ${diarizeEnabled}, Model: ${model})`);
    const transcriptionOptions = { punctuate: true, smart_format: true, model: model || 'nova-2' };
    if (diarizeEnabled) { transcriptionOptions.diarize = true; }
    try {
        const audioBuffer = fs.readFileSync(chunkPath);
        const { result, error: dgError } = await transcribeAudioFile(audioBuffer, transcriptionOptions); // Use service
        if (dgError) { throw dgError; } // Service returns error in dgError.error
        
        let formattedTranscript = '';
        let plainTranscript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
        if (diarizeEnabled && result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs) {
            const paragraphs = result.results.channels[0].alternatives[0].paragraphs.paragraphs;
            paragraphs.forEach(p => {
                const speaker = p.speaker !== null && p.speaker !== undefined ? `Speaker ${p.speaker}: ` : '';
                const text = p.sentences?.map(s => s.text).join(' ') ?? '';
                formattedTranscript += speaker + text + '\n\n';
            });
        } else {
            if (diarizeEnabled) { console.warn(`[${clientId}] Diarization enabled but no paragraphs found.`); }
            formattedTranscript = plainTranscript + ' ';
        }
        if (formattedTranscript.trim().length > 0) {
            sendSseMessage(clientId, 'partial_transcript', { transcript: formattedTranscript });
        }
        return plainTranscript;
    } catch (err) {
        console.error(`[${clientId}] Failed Deepgram transcription for chunk ${chunkName}:`, err);
        sendSseMessage(clientId, 'error', { message: `Deepgram failed on chunk ${chunkName}: ${err.message}` });
        return null;
    }
};

// Gemini Transcription/Summarization Function (moved from server.js)
// Note: This function relies on 'geminiModel' and 'mime' which need to be available.
// mime is imported, geminiModel is assumed to be imported from server.js for now.
import mime from 'mime-types'; 
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; // For safety settings

const transcribeWithGemini = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, modelIdentifier) => {
    console.log(`[${clientId}] Processing with Gemini: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${modelIdentifier})`);
    sendSseMessage(clientId, 'status', { message: `Processing with ${modelIdentifier}...`, model: modelIdentifier });

    try {
        // No need to check geminiModel here, service will handle it.
        sendSseMessage(clientId, 'status', { message: 'Preparing audio data...', model: modelIdentifier });
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString("base64");
        const fileExt = path.extname(originalName).toLowerCase();
        let mimeType = mime.lookup(originalName) || (fileExt === '.mp3' ? 'audio/mp3' : 'application/octet-stream'); // Simplified mime lookup
        console.log(`[${clientId}] Using MIME type: ${mimeType}`);

        if (mimeType === 'application/octet-stream' && !['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.mp4'].includes(fileExt)) {
             throw new Error(`Could not determine a supported MIME type for file: ${originalName}`);
        }
        // Add more specific mime types if needed, otherwise rely on mime.lookup or allow common ones
        if (fileExt === '.mp3') mimeType = 'audio/mp3';
        else if (fileExt === '.wav') mimeType = 'audio/wav';
        else if (fileExt === '.m4a') mimeType = 'audio/m4a';
        else if (fileExt === '.aac') mimeType = 'audio/aac';
        else if (fileExt === '.ogg') mimeType = 'audio/ogg';
        else if (fileExt === '.flac') mimeType = 'audio/flac';
        else if (fileExt === '.mp4') mimeType = 'video/mp4';


        const MAX_INLINE_BYTES = 15 * 1024 * 1024;
        if (fileBuffer.length > MAX_INLINE_BYTES) {
            throw new Error(`File size (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB) exceeds limit for direct Gemini processing.`);
        }
        const audioDataPart = { inlineData: { mimeType: mimeType, data: base64Data } };
        let promptText = "Transcribe the following audio accurately.";
        if (diarizeEnabled) promptText += " Identify different speakers and label their utterances clearly (e.g., 'Speaker 0:', 'Speaker 1:').";
        if (summarizeEnabled) promptText += " After the transcription, provide a concise summary starting with the exact text 'Summary:'.";
        const contents = [{ role: "user", parts: [{ text: promptText }, audioDataPart] }];
        const safetySettings = [ { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } ];

        sendSseMessage(clientId, 'status', { message: 'Sending request to Gemini...', model: modelIdentifier });
        const result = await generateGeminiContent(contents, safetySettings); // Use service
        
        // Check for errors from the service call if the service wraps the error similarly
        if (result.response && result.response.error) {
            throw new Error(result.response.error.message || "Gemini content generation failed in service.");
        }

        const response = result?.response; // result itself is the response from SDK via service
        const responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        let transcript = responseText;
        let summary = null;
        if (summarizeEnabled) {
            const summaryMarker = "\nSummary:";
            const summaryIndex = responseText.lastIndexOf(summaryMarker);
            if (summaryIndex !== -1) {
                summary = responseText.substring(summaryIndex + summaryMarker.length).trim();
                transcript = responseText.substring(0, summaryIndex).trim();
                sendSseMessage(clientId, 'summary_result', { summary: summary });
            } else { console.warn(`[${clientId}] Could not extract summary marker.`); }
        }
        if (transcript && transcript.trim().length > 0) {
            sendSseMessage(clientId, 'partial_transcript', { transcript: transcript });
        } else if (!summarizeEnabled || !summary) {
            throw new Error("Gemini response did not contain valid transcript text.");
        }
    } catch (err) {
        console.error(`[${clientId}] Failed to process with Gemini:`, err);
        sendSseMessage(clientId, 'error', { message: `Gemini processing failed: ${err.message || 'Unknown error'}` });
        throw err;
    }
};

// Main transcription processing function (moved from server.js)
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB) => {
    const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : 10;
    const DIRECT_PROCESSING_THRESHOLD_SEC = 30;
    let duration = Infinity;
    let chunkPaths = [];
    let accumulatedTranscript = '';
    const useGeminiForTranscription = model.startsWith('gemini-');

    try {
        sendSseMessage(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})` });

        if (useGeminiForTranscription) {
            // Removed direct client checks, service handles initialization
            await transcribeWithGemini(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model);
        } else { // Deepgram Path
            // Removed direct client checks, service handles initialization
            try {
                const ffprobePath = ffprobe.path;
                const durationCommand = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
                const { stdout } = await new Promise((resolve, reject) => {
                    exec(durationCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                        if (error) reject(stderr || error); else resolve({ stdout });
                    });
                });
                duration = parseFloat(stdout);
                sendSseMessage(clientId, 'status', { message: `File duration: ${Math.round(duration)}s` });
            } catch (err) {
                sendSseMessage(clientId, 'status', { message: 'Could not determine duration, assuming large file.' });
                duration = Infinity;
            }

            if (duration > DIRECT_PROCESSING_THRESHOLD_SEC) {
                chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, effectiveChunkSizeMB);
                for (let i = 0; i < chunkPaths.length; i++) {
                    const chunkPath = chunkPaths[i];
                    sendSseMessage(clientId, 'status', { message: `Transcribing chunk ${i + 1}/${chunkPaths.length}...`, model: model });
                    try {
                        const chunkTranscript = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, model);
                        if (chunkTranscript !== null) { accumulatedTranscript += chunkTranscript; }
                    } catch (err) { sendSseMessage(clientId, 'warning', { message: `Error processing chunk ${i + 1}. Skipping.` }); } 
                    finally { if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); } }
                }
                sendSseMessage(clientId, 'status', { message: 'All chunks processed.' });
            } else {
                sendSseMessage(clientId, 'status', { message: 'Transcribing file directly (Pre-recorded)...', model: model });
                const transcript = await transcribeChunkPrerecorded(clientId, filePath, diarizeEnabled, model);
                if (transcript !== null) { accumulatedTranscript = transcript; }
                sendSseMessage(clientId, 'status', { message: 'Processing complete.' });
            }

            // Check if Gemini model is available for summarization using the service
            const geminiModelInstance = getGeminiModelInstance(); 
            if (summarizeEnabled && accumulatedTranscript.trim().length > 0 && geminiModelInstance) {
                sendSseMessage(clientId, 'status', { message: 'Generating summary with Gemini...' });
                try {
                    const prompt = `Analyze the following transcript and create a structured summary with these specific sections:\n\n1. Key discussion points (bullet points)\n2. Key decisions taken (bullet points)\n3. Key actions to be completed (bullet points)\n\nFormat your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".\n\nTranscript:\n---\n${accumulatedTranscript.trim()}\n---`;
                    const safetySettings = [ 
                        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, 
                        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } 
                    ];
                    // Using generateGeminiContent which expects `contents` as an array of parts.
                    // For text-only, this means: [{ role: "user", parts: [{text: prompt}]}]
                    // However, the new generateTextOnly in geminiService is more direct. Let's use that.
                    // To ensure consistency, let's assume `generateGeminiContent` for all calls from controller for now, or create a specific text-only in service.
                    // The prompt for summarization is text-only.
                    // The geminiService now has generateTextOnly, so we can use that.
                    const summaryResult = await generateGeminiContent([{ role: "user", parts: [{text: prompt}]}], safetySettings); // Or use a dedicated text-only fn from service
                    
                    if (summaryResult.response && summaryResult.response.error) {
                         throw new Error(summaryResult.response.error.message || "Gemini summarization failed in service.");
                    }
                    const summaryText = summaryResult.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                    
                    sendSseMessage(clientId, 'summary_result', { summary: summaryText, text: summaryText });
                } catch (geminiError) {
                    sendSseMessage(clientId, 'error', { message: `Failed to generate summary: ${geminiError.message}` });
                }
            } else if (summarizeEnabled && !geminiModelInstance) { 
                sendSseMessage(clientId, 'warning', { message: 'Summarization skipped: Gemini model not available.' });
            } else if (summarizeEnabled) { 
                sendSseMessage(clientId, 'warning', { message: 'Summarization skipped: No transcript generated.' });
            }
        }
        sendSseMessage(clientId, 'done', { message: 'Transcription process finished.' });
    } catch (error) {
        sendSseMessage(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
    } finally {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        chunkPaths.forEach(chunkPath => { if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); } });
        closeSseConnection(clientId);
    }
};


export const handleTranscriptionRequest = async (req, res) => {
    const { 
        gcsObjectName, 
        originalName: clientOriginalName, // Renamed to avoid conflict with any local originalName variable
        diarize, 
        enableDiarization, 
        summarize, 
        enableSummarization, 
        model: modelFromReq, 
        chunkSizeMB: chunkSizeMBFromReq 
    } = req.body;

    if (!gcsObjectName) {
        return res.status(400).json({ error: 'gcsObjectName is required in the request body.' });
    }
    if (!bucketName) {
        console.error(`[transcriptionController] GCS_BUCKET_NAME is not configured. Cannot process GCS object.`);
        return res.status(500).json({ error: 'Server configuration error related to GCS.' });
    }

    const clientId = uuidv4();
    const tempGcsDownloadsDir = path.join(uploadsDir, 'gcs_temp_downloads');
    
    // Ensure the temporary directory for GCS downloads exists
    if (!fs.existsSync(tempGcsDownloadsDir)){
        try {
            fs.mkdirSync(tempGcsDownloadsDir, { recursive: true });
            console.log(`[${clientId}] Created temporary GCS download directory: ${tempGcsDownloadsDir}`);
        } catch (mkdirError) {
            console.error(`[${clientId}] Failed to create temporary GCS download directory ${tempGcsDownloadsDir}:`, mkdirError);
            return res.status(500).json({ error: 'Failed to create temporary storage for file processing.' });
        }
    }

    // Use a unique name for the local temporary file to avoid conflicts if multiple requests process the same gcsObjectName (though unlikely with clientId)
    const localTempFileName = `${clientId}-${path.basename(gcsObjectName)}`;
    const localTempFilePath = path.join(tempGcsDownloadsDir, localTempFileName);

    try {
        console.log(`[${clientId}] Attempting to download gs://${bucketName}/${gcsObjectName} to ${localTempFilePath}`);
        sendSseMessage(clientId, 'status', { message: `Downloading file from secure storage...` });

        await storage.bucket(bucketName).file(gcsObjectName).download({ destination: localTempFilePath });
        
        console.log(`[${clientId}] Successfully downloaded ${gcsObjectName} to ${localTempFilePath}.`);
        sendSseMessage(clientId, 'status', { message: `File downloaded. Starting transcription process...` });

        const diarizeEnabled = diarize === 'true' || enableDiarization === 'true';
        const summarizeEnabled = summarize === 'true' || enableSummarization === 'true';
        const model = modelFromReq || 'nova-2'; // Default to nova-2 if not specified
        const chunkSizeMB = model.startsWith('gemini-') ? null : (parseInt(chunkSizeMBFromReq, 10) || 10);
        
        // Use originalName from request if provided, otherwise derive from gcsObjectName (stripping UUID if present)
        const effectiveOriginalName = clientOriginalName || path.basename(gcsObjectName).substring(path.basename(gcsObjectName).indexOf('-') + 1);

        console.log(`[${clientId}] Processing downloaded file: ${effectiveOriginalName}, Path: ${localTempFilePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkTargetMB: ${chunkSizeMB ?? 'N/A'}. Starting async processing.`);
        
        // processTranscription will handle deleting localTempFilePath in its 'finally' block
        processTranscription(clientId, localTempFilePath, effectiveOriginalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB);
        
        res.json({ clientId });

    } catch (error) {
        console.error(`[${clientId}] Error during GCS download or pre-processing for ${gcsObjectName}:`, error);
        sendSseMessage(clientId, 'error', { message: `Failed to retrieve file from storage: ${error.message}` });
        closeSseConnection(clientId); // Close SSE as the process won't start

        // Clean up the partially downloaded file if it exists
        if (fs.existsSync(localTempFilePath)) {
            try {
                fs.unlinkSync(localTempFilePath);
                console.log(`[${clientId}] Cleaned up partially downloaded file ${localTempFilePath} after error.`);
            } catch (cleanupError) {
                console.error(`[${clientId}] Error cleaning up partially downloaded file ${localTempFilePath}:`, cleanupError);
            }
        }
        res.status(500).json({ error: 'Failed to process file from GCS.' });
    }
};

export const handleCancellationRequest = (req, res) => {
    const clientId = req.params.clientId;
    console.log(`Received cancellation request for ${clientId}`);

    if (activeProcesses[clientId]) {
        activeProcesses[clientId].forEach(process => {
            try {
                process.kill('SIGTERM');
                console.log(`[${clientId}] Killed process ${process.pid}`);
            } catch (e) {
                console.error(`[${clientId}] Failed to kill process:`, e);
            }
        });
        delete activeProcesses[clientId];
    }

    try {
        const clientChunkPattern = `${clientId}_chunk_`;
        const files = fs.readdirSync(uploadsDir);
        files.forEach(file => {
            if (file.startsWith(clientChunkPattern) && file.endsWith('.mp3')) {
                const chunkPath = path.join(uploadsDir, file);
                if (fs.existsSync(chunkPath)) {
                    fs.unlinkSync(chunkPath);
                    console.log(`[${clientId}] Cleaned up chunk: ${chunkPath}`);
                }
            }
        });
    } catch (e) {
        console.error(`[${clientId}] Error cleaning up chunks:`, e);
    }

    sendSseMessage(clientId, 'status', { message: 'Transcription cancelled.' });
    sendSseMessage(clientId, 'done', { message: 'Cancelled' });
    closeSseConnection(clientId);
    console.log(`[${clientId}] Closed SSE connection after cancellation.`);

    res.json({ success: true, message: 'Cancellation request received' });
};
