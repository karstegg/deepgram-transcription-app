import express from 'express';
import cors from 'cors';
import multer from 'multer';
// import { createClient } from '@deepgram/sdk'; // Moved to deepgramService.js
// import { exec } from 'child_process'; // Moved to ffmpegUtils.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// import sseExpress from 'sse-express'; // Now handled by sseHandler.js
import { v4 as uuidv4 } from 'uuid';
// import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; // Moved to geminiService.js
// import mime from 'mime-types'; // Moved to geminiService.js
import config from './config.js'; 

// Import services
import { transcribeChunkPrerecorded } from './services/deepgramService.js';
import { transcribeWithGemini, summarizeTextWithGemini, geminiModel } from './services/geminiService.js'; 

// Import utils
import { splitMediaIntoAudioChunks, getMediaDuration } from './utils/ffmpegUtils.js';
import { initializeSSE, sendProgress, closeAndRemoveSSEConnection } from './utils/sseHandler.js'; // Import SSE utilities

// Helper
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = config.PORT;

// Middleware & Multer setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: 'uploads/', limits: { fileSize: 500 * 1024 * 1024 } }); 
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) { fs.mkdirSync(uploadsDir); }

// SDKs are now initialized within their respective services.

// Track active FFmpeg processes for cancellation (still needed here as it's passed to sseHandler and ffmpegUtils)
const activeProcesses = {};

// Initialize SSE Handler (passes app, activeProcesses, uploadsDir, fs, path for on-close cleanup in sseHandler)
initializeSSE(app, activeProcesses, uploadsDir, fs, path); // fs and path are passed for sseHandler's cleanup logic

// Cancellation endpoint
app.post('/cancel/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  console.log(`[${clientId}] Received client cancellation request.`);
  
  // Terminate any active FFmpeg processes associated with this client ID
  if (activeProcesses[clientId] && activeProcesses[clientId].length > 0) {
    console.log(`[${clientId}] Cancelling ${activeProcesses[clientId].length} active FFmpeg process(es).`);
    activeProcesses[clientId].forEach(ffmpegProcess => {
      try {
        ffmpegProcess.kill('SIGTERM'); // Send SIGTERM to allow graceful shutdown
        console.log(`[${clientId}] Sent SIGTERM to FFmpeg process PID ${ffmpegProcess.pid}.`);
      } catch (killError) {
        console.error(`[${clientId}] Error sending SIGTERM to FFmpeg process PID ${ffmpegProcess.pid}: ${killError.message}`);
      }
    });
    // It's important to clear the array for this client, 
    // as ffmpegUtils will also try to remove them on 'close' or 'error'.
    // This ensures we don't try to operate on killed processes if events fire late.
    delete activeProcesses[clientId]; 
  } else {
    console.log(`[${clientId}] No active FFmpeg processes were found for this client ID during cancellation.`);
  }
  
  // Clean up any orphaned chunk files
  try {
    const chunkPattern = new RegExp(`^${clientId}_chunk_.*\\.mp3$`); // Matches files like "CLIENTID_chunk_001.mp3"
    const filesInUploads = fs.readdirSync(uploadsDir);
    const clientChunks = filesInUploads.filter(filename => chunkPattern.test(filename));
    
    if (clientChunks.length > 0) {
        console.log(`[${clientId}] Cleaning up ${clientChunks.length} orphaned audio chunk(s) due to cancellation.`);
        clientChunks.forEach(chunkFilename => {
          const chunkPath = path.join(uploadsDir, chunkFilename);
          if (fs.existsSync(chunkPath)) {
            try {
                fs.unlinkSync(chunkPath);
                // console.log(`[${clientId}] Deleted orphaned chunk: ${chunkPath}`); // Can be too verbose
            } catch (unlinkError) {
                console.error(`[${clientId}] Error deleting orphaned chunk ${chunkPath}: ${unlinkError.message}`);
            }
          }
        });
    } else {
        // console.log(`[${clientId}] No orphaned audio chunks found for cleanup upon cancellation.`);
    }
  } catch (readDirError) {
    console.error(`[${clientId}] Error reading uploads directory for chunk cleanup during cancellation: ${readDirError.message}`);
  }
  
  // Notify client and close SSE stream
  closeAndRemoveSSEConnection(clientId, 'cancelled', 'Process cancelled by user request.', 'Cancellation processed.');
  
  res.status(200).json({ success: true, message: 'Cancellation request acknowledged and processed.' });
});

// sendProgress is now imported from sseHandler.js
// const sendProgress = (clientId, type, data) => { ... };

// FFMpeg Chunking Function is now in ffmpegUtils.js
// const splitMediaIntoAudioChunks = (clientId, filePath, targetChunkSizeMB = config.DEFAULT_CHUNK_SIZE_MB, sendProgress, activeProcesses, uploadsDir) => { ... }

// Deepgram Pre-recorded Transcription Function is now in deepgramService.js
// const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, model) => { ... }

// Gemini Transcription/Summarization Function is now in geminiService.js
// const transcribeWithGemini = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, modelIdentifier) => { ... }


// Main transcription processing function
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB) => {
    const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : config.DEFAULT_CHUNK_SIZE_MB;
    let duration = Infinity;
    let chunkPaths = [];
    let accumulatedTranscript = ''; 
    const useGeminiForTranscription = model.startsWith('gemini-');
    let processingError = null; // Holds error object if one occurs

    try {
        console.log(`[${clientId}] Orchestrating transcription for ${originalName}. Model: ${model}. Options: Diarize=${diarizeEnabled}, Summarize=${summarizeEnabled}, ChunkSizeMB=${chunkSizeMB}.`);
        sendProgress(clientId, 'status', { message: `Initiating processing for ${originalName} using ${model}...` });

        if (useGeminiForTranscription) {
            if (!geminiModel) { // Guard against uninitialized Gemini model
                 throw new Error("Gemini model is not available. Please check server configuration and API key status.");
            }
            // For Gemini, the entire file is processed at once by the service.
            // The service itself handles sending transcript and summary (if enabled) via sendProgress.
            await transcribeWithGemini(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, sendProgress);
        } else {
            // DEEPGRAM PATH (involves potential chunking)
            try {
                duration = await getMediaDuration(filePath, clientId, sendProgress);
            } catch (durationError) {
                console.warn(`[${clientId}] Failed to determine media duration for ${originalName} (Error: ${durationError.message}). Assuming chunking is necessary if file is large.`);
                duration = Infinity; // Default to chunking if duration is unknown
            }

            if (duration > config.DIRECT_PROCESSING_THRESHOLD_SEC) { 
                console.log(`[${clientId}] Media duration (${duration.toFixed(2)}s) exceeds direct processing threshold (${config.DIRECT_PROCESSING_THRESHOLD_SEC}s). Chunking required for ${originalName}.`);
                chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, effectiveChunkSizeMB, sendProgress, activeProcesses, uploadsDir);
                const totalChunks = chunkPaths.length;
                
                if (totalChunks === 0 && duration > 0) { 
                    sendProgress(clientId, 'warning', { message: 'Media processing resulted in no transcribable audio chunks. File might be too short or an unsupported format.' });
                } else {
                    console.log(`[${clientId}] ${originalName} split into ${totalChunks} chunks for transcription.`);
                }

                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = chunkPaths[i]; // Path to the individual chunk
                    const progressMsg = `Transcribing audio chunk ${i + 1} of ${totalChunks} using ${model}...`; 
                    sendProgress(clientId, 'status', { message: progressMsg });
                    try {
                        const chunkTranscript = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, model, sendProgress); 
                        if (chunkTranscript !== null) { accumulatedTranscript += (chunkTranscript + " "); } // Append space for proper sentence joining
                    } catch (transcriptionError) { 
                        console.warn(`[${clientId}] Error during transcription of chunk ${i+1} for ${originalName}: ${transcriptionError.message}. This chunk may be skipped.`);
                        // transcribeChunkPrerecorded should use sendProgress for specific error, this is a fallback log.
                    } 
                    // Chunk cleanup is handled in the finally block of this function
                }
                if (totalChunks > 0) sendProgress(clientId, 'status', { message: `All ${totalChunks} audio chunks for ${originalName} have been processed.` });

            } else if (duration > 0) { // File is short enough for direct processing
                 console.log(`[${clientId}] Media duration (${duration.toFixed(2)}s) is suitable for direct transcription for ${originalName}.`);
                 sendProgress(clientId, 'status', { message: `Transcribing short audio file ${originalName} directly...` });
                 const transcript = await transcribeChunkPrerecorded(clientId, filePath, diarizeEnabled, model, sendProgress); 
                 if (transcript !== null) { accumulatedTranscript = transcript; }
            } else { // Duration is zero, negative, or undetermined in a way that prevents processing
                const noTranscriptionMsg = `Media duration for ${originalName} is zero, negative, or undetermined. Skipping transcription.`;
                console.warn(`[${clientId}] ${noTranscriptionMsg}`);
                sendProgress(clientId, 'warning', { message: noTranscriptionMsg });
            }

            // Summarization for Deepgram path (if transcript exists and summarization enabled)
            if (summarizeEnabled && accumulatedTranscript.trim().length > 0 && geminiModel) {
                console.log(`[${clientId}] Transcript for ${originalName} (length: ${accumulatedTranscript.trim().length}) is ready. Proceeding with summarization.`);
                sendProgress(clientId, 'status', { message: `Generating summary for ${originalName}...` });
                await summarizeTextWithGemini(clientId, accumulatedTranscript.trim(), sendProgress);
            } else if (summarizeEnabled && !geminiModel) { 
                sendProgress(clientId, 'warning', { message: `Summarization requested for ${originalName}, but Gemini model is not available.` }); 
            } else if (summarizeEnabled && accumulatedTranscript.trim().length === 0) { 
                sendProgress(clientId, 'warning', { message: `Summarization requested for ${originalName}, but no transcript was generated.` }); 
            }
        } // End of Deepgram/Gemini specific path

    } catch (err) { // Catch-all for errors within the processTranscription orchestration
        processingError = err; 
        console.error(`[${clientId}] Critical error in 'processTranscription' for ${originalName}: ${err.message}`, err.stack ? `\nStack: ${err.stack}` : '');
        // Fallback error message. Services should ideally send more specific errors via sendProgress.
        if (!err.message?.includes('aborted by client') && !err.message?.includes('Client disconnected')) { // Avoid resending if error is due to client actions handled elsewhere
             sendProgress(clientId, 'error', { message: `An unexpected server error occurred while processing ${originalName}: ${err.message}` });
        }
    } finally {
        console.log(`[${clientId}] Finalizing 'processTranscription' for ${originalName}. Error status: ${processingError ? processingError.message : 'None'}`);
        
        // Cleanup original uploaded file
        if (fs.existsSync(filePath)) { 
            try { fs.unlinkSync(filePath); console.log(`[${clientId}] Cleaned up original uploaded file: ${filePath}`); }
            catch (unlinkErr) { console.error(`[${clientId}] Error cleaning up original uploaded file '${filePath}': ${unlinkErr.message}`); }
        }
        // Cleanup any generated chunk files
        console.log(`[${clientId}] Attempting to clean up ${chunkPaths.length} generated chunk(s) for '${originalName}'.`);
        chunkPaths.forEach(generatedChunkPath => { 
            if (fs.existsSync(generatedChunkPath)) { 
                try { 
                    fs.unlinkSync(generatedChunkPath); 
                    // console.log(`[${clientId}] Cleaned up generated chunk: ${generatedChunkPath}`); // Can be verbose
                } catch (unlinkErr) { 
                    console.error(`[${clientId}] Error cleaning up generated chunk '${generatedChunkPath}': ${unlinkErr.message}`); 
                }
            }
        });
        console.log(`[${clientId}] File and chunk cleanup process completed for '${originalName}'.`);
        
        const finalMessageText = processingError ? `Processing of ${originalName} failed: ${processingError.message}` : `Successfully processed ${originalName}.`;
        const finalMessageType = processingError ? 'error' : 'done';
        closeAndRemoveSSEConnection(clientId, finalMessageType, finalMessageText, `Finalizing all operations for ${originalName}.`);
    }
};

// Transcription endpoint
app.post('/transcribe', upload.single('audio'), (req, res) => {
   if (!req.file) { 
       console.warn(`[SERVER] /transcribe: Received request without a file.`);
       return res.status(400).json({ error: 'No audio file uploaded.' }); 
   }
   const clientId = uuidv4(); // Unique ID for this transcription request
   const { path: filePath, originalname: originalName } = req.file;
   const { diarize, enableDiarization, summarize, enableSummarization, model: requestedModel, chunkSizeMB: requestedChunkSize } = req.body;

   const diarizeEnabled = diarize === 'true' || enableDiarization === 'true';
   const summarizeEnabled = summarize === 'true' || enableSummarization === 'true';
   const model = requestedModel || config.DEEPGRAM_MODEL_NAME; 
   const chunkSizeMB = model.startsWith('gemini-') ? null : (parseInt(requestedChunkSize, 10) || config.DEFAULT_CHUNK_SIZE_MB); 
   
   console.log(`[${clientId}] /transcribe: Request for '${originalName}'. Model: ${model}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, ChunkSize: ${chunkSizeMB ?? 'N/A'}.`);
   
   // Intentionally not awaiting processTranscription as it's a long-running background task.
   processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB); 
   
   res.status(202).json({ 
       message: `Transcription process initiated for '${originalName}'. Monitor progress via SSE.`,
       clientId 
   }); 
});

// Summarization-only endpoint
app.post('/summarize', upload.single('audio'), (req, res) => {
   const clientId = uuidv4();
   const existingTranscription = req.body.existingTranscription;
   
   if (!existingTranscription) {
      return res.status(400).json({ error: 'No transcription provided for summarization.' });
   }
   
   console.log(`[${clientId}] Received summarization request for existing transcription (${existingTranscription.length} chars).`);
   
// Summarization-only endpoint
app.post('/summarize', upload.single('audio'), (req, res) => { // 'audio' key might not be used if only text is sent
   const clientId = uuidv4(); // Unique ID for this summarization request
   const { existingTranscription } = req.body;
   
   if (!existingTranscription || typeof existingTranscription !== 'string' || existingTranscription.trim().length === 0) {
      console.warn(`[${clientId}] /summarize: Received request with no or empty 'existingTranscription'.`);
      return res.status(400).json({ error: 'No transcription text provided for summarization.' });
   }
   
   console.log(`[${clientId}] /summarize: Request for existing transcript (length: ${existingTranscription.length} chars).`);
   
   // Process summarization asynchronously
   (async () => {
      let summarizationError = null; 
      try {
         sendProgress(clientId, 'status', { message: 'Initiating summarization of provided transcript...' });
         
         if (!geminiModel) { // Check if Gemini model is available
            throw new Error('Gemini model for summarization is not available. Check server configuration.');
         }
         
        await summarizeTextWithGemini(clientId, existingTranscription, sendProgress);
        // summarizeTextWithGemini is responsible for sending its own success or error messages via sendProgress.

      } catch (err) { // Catch errors from the async block itself or if summarizeTextWithGemini re-throws
         summarizationError = err; 
         const errMsg = summarizationError.message || 'Unknown error during summarization endpoint processing.';
         console.error(`[${clientId}] Error in /summarize async execution: ${errMsg}`, summarizationError.stack ? `\nStack: ${summarizationError.stack}`: '');
         // Fallback error message if service didn't send one.
         if (!errMsg.includes('geminiService')) { // Avoid duplicate if geminiService already sent specific error
            sendProgress(clientId, 'error', { message: `Summarization task failed: ${errMsg}` });
         }
      } finally {
         const finalLogMsg = `[${clientId}] Finalizing /summarize request. Error state: ${summarizationError ? summarizationError.message : 'None'}`;
         console.log(finalLogMsg);
         
         const finalSseMsg = summarizationError ? `Summarization failed: ${summarizationError.message}` : 'Summarization of provided transcript complete.';
         const finalSseType = summarizationError ? 'error' : 'done';
         closeAndRemoveSSEConnection(clientId, finalSseType, finalSseMsg, 'Finalizing summarization task.');
      }
   })();
   
   res.status(202).json({ 
       message: 'Summarization process initiated for the provided transcript. Monitor progress via SSE.',
       clientId 
   });
});

// Start the server
app.listen(config.PORT, () => { 
  console.log(`[SERVER] Application server listening on port ${config.PORT}`);
});
