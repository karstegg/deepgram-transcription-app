// Suggested code may be subject to a license. Learn more: ~LicenseLog:3516441262.
// Suggested code may be subject to a license. Learn more: ~LicenseLog:4030635869.
// Suggested code may be subject to a license. Learn more: ~LicenseLog:781540894.
// Add Global Error Handlers at the very top (or early in the script)
process.on('uncaughtException', (err, origin) => {
  console.error(`
--------------------------------------------------
UNCAUGHT EXCEPTION DETECTED
--------------------------------------------------
Error:`, err);
  console.error(`Origin:`, origin);
  // Optionally exit: process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error(`
--------------------------------------------------
UNHANDLED PROMISE REJECTION DETECTED
--------------------------------------------------
Reason: ${reason}
Promise: ${promise}
`);
});

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore'; // Added Firestore imports
import authenticateToken from './middleware/authenticateToken.js'; // Added Auth Middleware import

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@deepgram/sdk'; 
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static'; 
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sseExpress from 'sse-express';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"; 
import mime from 'mime-types'; 

// Helper
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

let db; // Declare db variable
// Initialize Firebase Admin SDK using ADC
if (getApps().length === 0) { // Check if already initialized
  try {
    initializeApp(); // Uses Application Default Credentials (ADC) automatically
    db = getFirestore(); // Get Firestore instance
    console.log('Firebase Admin SDK Initialized successfully. Firestore is ready.');
  } catch (error) {
    console.error('Firebase Admin SDK Initialization Error:', error);
    db = null; // Set db to null if initialization fails
  }
} else {
  // If already initialized, just get the firestore instance
  db = getFirestore();
}

const app = express();
const port = process.env.PORT || 5000;

// Middleware & Multer setup
app.use(cors());
app.use(express.json()); // Ensure body parsing middleware is used *before* routes that need req.body
app.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: 'uploads/', limits: { fileSize: 500 * 1024 * 1024 } });
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) { fs.mkdirSync(uploadsDir); }

// Initialize SDKs
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
let geminiModel = null; 
if (!genAI) { 
    console.warn("GEMINI_API_KEY not found. Gemini features disabled."); 
} else {
    try {
        geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro-exp-03-25" }); 
        console.log("Gemini model initialized:", "gemini-2.5-pro-exp-03-25");
    } catch (initError) {
         console.error("Failed to initialize Gemini model:", initError);
         geminiModel = null; 
    }
}

// SSE Store & Helper
const sseConnections = {};
// Track active processes for cancellation
const activeProcesses = {};

// --- Public Routes (No Auth Required) ---

app.get('/progress/:clientId', sseExpress, (req, res) => {
  const clientId = req.params.clientId;
  console.log(`Client ${clientId} connected.`);
  sseConnections[clientId] = res;
  res.sse('connected', { message: 'Connected' });
  req.on('close', () => {
    console.log(`Client ${clientId} disconnected.`);
    delete sseConnections[clientId];
  });
});

app.post('/cancel/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  console.log(`Received cancellation request for ${clientId}`);
  
  // Kill any active FFmpeg processes
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
  
  // Clean up any chunks that might have been created
  try {
    const chunks = fs.readdirSync(uploadsDir)
      .filter(f => f.startsWith(`${clientId}_chunk_`) && f.endsWith('.mp3'))
      .map(f => path.join(uploadsDir, f));
    
    chunks.forEach(chunkPath => {
      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(chunkPath);
        console.log(`[${clientId}] Cleaned up chunk: ${chunkPath}`);
      }
    });
  } catch (e) {
    console.error(`[${clientId}] Error cleaning up chunks:`, e);
  }
  
  // Send cancellation message via SSE
  if (sseConnections[clientId]) {
    try {
      sseConnections[clientId].sse('status', { message: 'Transcription cancelled.' });
      sseConnections[clientId].sse('done', { message: 'Cancelled' });
      setTimeout(() => {
        if (sseConnections[clientId]) {
          try { sseConnections[clientId].end(); } catch(e){}
          delete sseConnections[clientId];
          console.log(`[${clientId}] Closed SSE connection after cancellation.`);
        }
      }, 1000);
    } catch (e) {
      console.error(`[${clientId}] Error sending cancellation message:`, e);
    }
  }
  
  res.json({ success: true, message: 'Cancellation request received' });
});

// Modified Transcription endpoint (Public)
app.post('/transcribe', upload.single('audio'), (req, res) => {
   if (!req.file) { return res.status(400).json({ error: 'No file uploaded.' }); }
   const clientId = uuidv4();
   const filePath = req.file.path;
   const originalName = req.file.originalname; 
   const diarizeEnabled = req.body.diarize === 'true' || req.body.enableDiarization === 'true';
   const summarizeEnabled = req.body.summarize === 'true' || req.body.enableSummarization === 'true';
   const model = req.body.model || 'nova-2'; 
   const chunkSizeMB = model.startsWith('gemini-') ? null : (parseInt(req.body.chunkSizeMB, 10) || 10); 
   console.log(`[${clientId}] Received file: ${originalName}, Path: ${filePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkTargetMB: ${chunkSizeMB ?? 'N/A'}. Starting async processing.`);
   
   // Final log before calling the async function
   console.log(`[${clientId}] --- PRE-CALL processTranscription ---`); 
   processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB);
   
   res.json({ clientId }); 
});

// Summarization-only endpoint (Public)
app.post('/summarize', upload.single('audio'), (req, res) => {
   const clientId = uuidv4();
   const existingTranscription = req.body.existingTranscription;
   
   if (!existingTranscription) {
      return res.status(400).json({ error: 'No transcription provided for summarization.' });
   }
   
   console.log(`[${clientId}] Received summarization request for existing transcription (${existingTranscription.length} chars).`);
   
   // Process the summarization asynchronously
   (async () => {
      try {
         sendProgress(clientId, 'status', { message: 'Generating summary...' });
         
         if (!geminiModel) {
            sendProgress(clientId, 'error', { message: 'Summarization failed: Gemini API key not configured.' });
            return;
         }
         
         const prompt = `Analyze the following transcript and create a structured summary with these specific sections:

1. Key discussion points (bullet points)
2. Key decisions taken (bullet points)
3. Key actions to be completed (bullet points)

Format your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".

Transcript:
---
${existingTranscription.trim()}
---`;
         const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
         ];
         
         sendProgress(clientId, 'status', { message: 'Sending request to Gemini...' });
         const result = await geminiModel.generateContent(prompt, {safetySettings});
         const response = result.response;
         const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
         
         console.log(`[${clientId}] Gemini summary received.`);
         
         if (summaryText.trim().length > 0) {
            sendProgress(clientId, 'summary_result', { summary: summaryText, text: summaryText });
            sendProgress(clientId, 'status', { message: 'Summary generated successfully.', progress: 100 });
         } else {
            sendProgress(clientId, 'error', { message: 'Failed to generate summary: Empty response from Gemini.' });
         }
      } catch (error) {
         console.error(`[${clientId}] Error during summarization:`, error);
         sendProgress(clientId, 'error', { message: `Summarization failed: ${error.message || 'Unknown error'}` });
      } finally {
         sendProgress(clientId, 'done', { message: 'Summarization process finished.' });
         
         if (sseConnections[clientId]) {
            setTimeout(() => {
               if (sseConnections[clientId]) {
                  try { sseConnections[clientId].end(); } catch(e){}
                  delete sseConnections[clientId];
                  console.log(`[${clientId}] Closed SSE connection.`);
               }
            }, 1500);
         }
      }
   })();
   
   res.json({ clientId });
});


// --- API Routes (Auth Required) ---

// Define a router for API endpoints
const apiRouter = express.Router();

// Apply authentication middleware to all routes in this router
apiRouter.use(authenticateToken);

// POST /api/transcripts - Save a new transcript
apiRouter.post('/transcripts', async (req, res) => {
  if (!db) {
    console.error("Firestore database is not initialized.");
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  const { originalFilename, transcript, summary, modelUsed, processingOptions } = req.body;
  const userId = req.user.uid; // Get user ID from authenticated token

  if (!transcript && !summary) {
    return res.status(400).json({ error: 'Transcript or summary content is required.' });
  }

  try {
    console.log(`Attempting to save transcript for user ${userId}`);
    const docRef = await db.collection('transcripts').add({
      userId: userId,
      filename: originalFilename || 'Untitled',
      transcript: transcript || null,
      summary: summary || null,
      modelUsed: modelUsed || null,
      processingOptions: processingOptions || {},
      createdAt: Timestamp.now() // Use Firestore Timestamp
    });
    console.log(`Transcript saved with ID: ${docRef.id} for user ${userId}`);
    res.status(201).json({ id: docRef.id, message: 'Transcript saved successfully.' });
  } catch (error) {
    console.error(`Error saving transcript for user ${userId}:`, error);
    res.status(500).json({ error: 'Failed to save transcript.' });
  }
});

// GET /api/transcripts - Retrieve user's transcripts (Add later)
// apiRouter.get('/transcripts', async (req, res) => { ... });

// DELETE /api/transcripts/:id - Delete a transcript (Add later)
// apiRouter.delete('/transcripts/:id', async (req, res) => { ... });


// Mount the API router under the /api path
app.use('/api', apiRouter);


// --- Helper Functions (Chunking, Transcription etc.) ---

const sendProgress = (clientId, type, data) => {
  if (sseConnections[clientId]) {
    try {
        sseConnections[clientId].sse(type, data);
        if (type !== 'partial_transcript' && type !== 'summary_result') { 
            const logData = { ...data };
            // console.log(`Sent SSE [${type}] to ${clientId}:`, logData); // Reduce log verbosity slightly
        }
    } catch (sseError) {
         console.error(`[${clientId}] Failed to send SSE message type ${type}:`, sseError);
         delete sseConnections[clientId];
    }
  }
};

const splitMediaIntoAudioChunks = (clientId, filePath, targetChunkSizeMB = 10) => {
  return new Promise(async (resolve, reject) => { // Use reject for critical failures
    const targetChunkSizeBytes = targetChunkSizeMB * 1024 * 1024;
    let segmentDurationSec = 600; // Default large segment time
    const safeClientId = clientId.replace(/[^a-z0-9_-]/gi, '_'); // Ensure safe filename

    // Ensure tracking array exists for this client
    activeProcesses[clientId] = activeProcesses[clientId] || [];

    try {
        sendProgress(clientId, 'status', { message: 'Analyzing file for chunking...' });
        const ffprobePath = ffprobe.path;
        // Added quotes around filePath for safety
        const probeCommand = `\\"${ffprobePath}\\" -v error -show_format -show_streams -of json \\"${filePath}\\"`;
        let probeProcess;

        const { stdout: probeJson } = await new Promise((resolveCmd, rejectCmd) => { // Use rejectCmd here
            probeProcess = exec(probeCommand, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout, stderr) => {
                 // Remove from active tracking once done
                 activeProcesses[clientId] = activeProcesses[clientId]?.filter(p => p !== probeProcess);
                 probeProcess = null; // Clear process variable

                if (error) {
                    // If ffprobe fails critically (e.g., file not found, invalid format)
                    console.error(`[${clientId}] [Chunking] FFprobe critical failure: ${stderr || error.message}.`);
                    // Reject the promise here as we cannot proceed reliably
                    rejectCmd(new Error(`FFprobe analysis failed: ${stderr || error.message}`));
                } else {
                    resolveCmd({ stdout });
                }
            });
             // Add ffprobe process to tracking if created
            if (probeProcess) {
                activeProcesses[clientId].push(probeProcess);
            } else {
                console.error(`[${clientId}] [Chunking] Failed to create ffprobe process.`);
                // Reject if process couldn't even be created
                rejectCmd(new Error('Failed to start ffprobe process.'));
            }
        });
        // Ensure probe process is cleaned up if it timed out/didn't exit cleanly
         if (probeProcess) {
             activeProcesses[clientId] = activeProcesses[clientId]?.filter(p => p !== probeProcess);
             try { probeProcess.kill('SIGTERM'); } catch(e){}
         }


        const probeData = JSON.parse(probeJson); // This might fail if ffprobe didn't return valid JSON
        const format = probeData.format;
        if (format?.duration && format?.size) {
            const totalDurationSec = parseFloat(format.duration);
            const totalSizeBytes = parseInt(format.size, 10);
            const avgBitrateBps = totalDurationSec > 0 ? (totalSizeBytes * 8 / totalDurationSec) : 0;
            if (avgBitrateBps > 0) {
                const expectedChunks = Math.max(1, Math.ceil(totalSizeBytes / targetChunkSizeBytes));
                segmentDurationSec = Math.ceil(totalDurationSec / expectedChunks);
                segmentDurationSec = Math.max(10, Math.min(segmentDurationSec, 900)); // Clamp 10s - 15min
                console.log(`[${clientId}] File size: ${(totalSizeBytes/1024/1024).toFixed(2)}MB, Target chunk size: ${targetChunkSizeMB}MB`);
                console.log(`[${clientId}] Expected chunks: ${expectedChunks}, Calculated segment duration: ${segmentDurationSec}s`);
            } else { console.warn(`[${clientId}] Could not calculate bitrate, using default duration: ${segmentDurationSec}s.`); }
        } else { console.warn(`[${clientId}] Could not get valid duration/size from ffprobe, using default duration: ${segmentDurationSec}s.`); }

        sendProgress(clientId, 'status', { message: `Splitting into ~${segmentDurationSec}s chunks...` });

    } catch (probeError) {
        // Catch errors from ffprobe execution OR JSON parsing
        console.error(`[${clientId}] Error during ffprobe analysis step:`, probeError);
        sendProgress(clientId, 'warning', { message: `Could not analyze file, using default chunk duration.` });
        // Decide if we should reject or proceed with default duration
         if (probeError.message.includes('Failed to start ffprobe process') || probeError.message.includes('FFprobe analysis failed')) {
             return reject(probeError); // Reject the main promise for critical ffprobe failures
         }
        // Otherwise, continue with default segmentDurationSec
    }

    // Ensure uploads directory exists before proceeding
     if (!fs.existsSync(uploadsDir)) {
        const dirError = new Error(`Uploads directory ${uploadsDir} does not exist.`);
        console.error(`[${clientId}] [Chunking] ${dirError.message}`);
        return reject(dirError); // Reject if the target dir is missing
     }

    const outputPattern = path.join(uploadsDir, `${safeClientId}_chunk_%03d.mp3`);
    // USE -f segment and -segment_time
    const command = `\\"${ffmpeg}\\" -nostdin -i \\"${filePath}\\" -f segment -segment_time ${segmentDurationSec} -vn -acodec libmp3lame -ar 16000 -ac 1 -ab 32k -map a -segment_format mp3 -reset_timestamps 1 -threads 1 \\"${outputPattern}\\"`;
    console.log(`[${clientId}] Executing FFmpeg segment command: ${command}`);
    let ffmpegProcess; // Declare outside

    try {
        ffmpegProcess = exec(command, { maxBuffer: 50 * 1024 * 1024, timeout: 1800000 }); // 30 min timeout

        // Track the process for potential cancellation
        activeProcesses[clientId].push(ffmpegProcess);

        let stderrData = '';
        ffmpegProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`[${clientId}] FFmpeg process closed with code ${code}.`);
             // Log full stderr on close for debugging if code is non-zero or for verbose logging
            if (code !== 0) {
                 const maxStderrLogLength = 2000;
                 console.error(`[${clientId}] FFmpeg exited non-zero (${code}). Stderr (last ${maxStderrLogLength} chars):\\n${stderrData.slice(-maxStderrLogLength)}`);
            } else {
                 // console.log(`[${clientId}] FFmpeg stderr output:\\n${stderrData}`); // Optional: Log stderr even on success
            }

            // Remove this process from active processes
             activeProcesses[clientId] = activeProcesses[clientId]?.filter(p => p !== ffmpegProcess);
             if (activeProcesses[clientId]?.length === 0) {
                 delete activeProcesses[clientId]; // Clean up client tracking if no processes left
             }

             // --- CRITICAL: Check exit code before resolving ---
             if (code !== 0) {
                 // If ffmpeg failed, reject the promise
                 return reject(new Error(`Error splitting file (FFmpeg exited with code ${code}). Check stderr logs.`));
             }

            // Check if we still have an active connection (not cancelled / disconnected)
            if (!sseConnections[clientId]) {
                console.log(`[${clientId}] Client disconnected during/after chunking, aborting resolution.`);
                 return resolve([]); // Resolve with empty array as client is gone, let finally block clean up
            }

            // --- Find chunks AFTER confirming ffmpeg success (code 0) ---
            try {
                const chunks = fs.readdirSync(uploadsDir)
                    .filter(f => f.startsWith(`${safeClientId}_chunk_`) && f.endsWith('.mp3'))
                    .map(f => path.join(uploadsDir, f))
                    .sort();
                console.log(`[${clientId}] Found ${chunks.length} MP3 chunks.`);
                sendProgress(clientId, 'status', { message: `Found ${chunks.length} audio chunks.` });

                if (chunks.length === 0) {
                     // If ffmpeg exited cleanly (code 0) but produced no chunks
                     console.warn(`[${clientId}] FFmpeg completed successfully but no chunks were found. This might happen for very short files.`);
                     resolve([]); // Resolve empty, main function handles 0 chunks case
                 }
                 else {
                    resolve(chunks); // Resolve with the found chunks
                 }
            } catch (readErr) {
                 console.error(`[${clientId}] Error reading directory for chunks after ffmpeg success:`, readErr);
                 reject(new Error(`Failed to read chunk directory after successful split: ${readErr.message}`));
            }
        }); // End of ffmpegProcess.on('close')

        ffmpegProcess.on('error', (err) => {
            console.error(`[${clientId}] Error executing FFmpeg process itself:`, err);
            // Remove this process from active processes on error
             activeProcesses[clientId] = activeProcesses[clientId]?.filter(p => p !== ffmpegProcess);
             if (activeProcesses[clientId]?.length === 0) {
                 delete activeProcesses[clientId];
             }
            reject(new Error(`Error executing FFmpeg command: ${err.message}`));
        });

    } catch(execError) {
        // Catch synchronous errors during exec creation itself
         console.error(`[${clientId}] Failed to start FFmpeg process:`, execError);
         reject(new Error(`Failed to start FFmpeg: ${execError.message}`));
    }
  });
};


const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, model) => {
    try {
        console.log(`[${clientId}] Starting transcribeChunkPrerecorded for ${chunkPath}, diarization: ${diarizeEnabled}, model: ${model}`); // Detailed log
        
        const source = { buffer: fs.readFileSync(chunkPath), mimetype: mime.lookup(chunkPath) };
        const options = {
            punctuate: true,
            diarize: diarizeEnabled,
            model: model,
        };

        sendProgress(clientId, 'status', { message: `Sending audio to Deepgram...`, model: model });
        console.log(`[${clientId}] Deepgram transcribe.prerecorded call in progress...`); // Added log
        const { results } = await deepgramClient.listen.prerecorded.transcribe(source, options);
        console.log(`[${clientId}] Deepgram transcribe.prerecorded call complete.`); // Added log

        const transcript = results.channels[0].alternatives[0].transcript;
        const partialTranscript = transcript.length > 250 ? transcript.substring(0, 250) + '...' : transcript;
        sendProgress(clientId, 'partial_transcript', { text: partialTranscript, model: model }); // Send progress message

        console.log(`[${clientId}] Partial transcript: ${partialTranscript}`);
        return transcript;
    } catch (error) {
        console.error(`[${clientId}] Deepgram failed for ${chunkPath}:`, error);
        sendProgress(clientId, 'error', { message: `Deepgram processing failed for chunk: ${error.message || 'Unknown error'}` }); // Error message
        return null;
    }
};

const transcribeWithGemini = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model) => {
    console.log(`[${clientId}] Entering transcribeWithGemini...`);
    let accumulatedTranscript = '';

    try {
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})` });
        sendProgress(clientId, 'status', { message: 'Sending request to Gemini...' });

        const fileBuffer = fs.readFileSync(filePath);
        const fileMimeType = mime.lookup(filePath);
        
        if (!fileMimeType || !fileMimeType.startsWith('audio/')) {
            throw new Error('Unsupported file type for Gemini');
        }
        
        const parts = [ { inlineData: { data: fileBuffer.toString('base64'), mimeType: fileMimeType } } ];
        const config = { safetySettings: [ { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } ] };
        console.log(`[${clientId}] Gemini model generateContent request about to send...`);
        
        const result = await geminiModel.generateContent({contents: [{role: 'user', parts}], ...config});
        const response = result.response;
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        console.log(`[${clientId}] Gemini transcription response received.`);
        if (text.trim().length > 0) {
          accumulatedTranscript = text.trim();
          sendProgress(clientId, 'partial_transcript', { text: text.trim(), model: model });
          sendProgress(clientId, 'status', { message: 'Transcription complete.' });
        } else {
            sendProgress(clientId, 'error', { message: 'Failed to generate transcription: Empty response from Gemini.' });
        }

        // Summarize Gemini transcript if enabled
        if (summarizeEnabled && accumulatedTranscript.trim().length > 0) {
            sendProgress(clientId, 'status', { message: 'Generating summary with Gemini...' });
            console.log(`[${clientId}] Sending Gemini transcript (length: ${accumulatedTranscript.length}) to Gemini for summarization...`);
            try {
                const prompt = `Analyze the following transcript and create a structured summary with these specific sections:

1. Key discussion points (bullet points)
2. Key decisions taken (bullet points)
3. Key actions to be completed (bullet points)

Format your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".

Transcript:
---
${accumulatedTranscript.trim()}
---`;
                
                const safetySettings = [ { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } ];
                
                const result = await geminiModel.generateContent(prompt, {safetySettings}); // Pass prompt string directly
                const response = result.response;
                const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                
                console.log(`[${clientId}] Gemini summary received.`);
                
                // Send summary with both 'summary' and 'text' properties for compatibility
                sendProgress(clientId, 'summary_result', { summary: summaryText, text: summaryText });
            } catch (geminiError) {
                 console.error(`[${clientId}] Gemini API error during summarization:`, geminiError);
                 sendProgress(clientId, 'error', { message: `Failed to generate summary: ${geminiError.message || 'Unknown Gemini error'}` });
            }
        } else if (summarizeEnabled) { sendProgress(clientId, 'warning', { message: 'Summarization skipped: No transcript generated.' }); }
        
    } catch (error) {
        console.error(`[${clientId}] transcribeWithGemini error:`, error);
        if (error.message.includes('Unsupported file type')) {
            sendProgress(clientId, 'error', { message: `Gemini processing failed: Unsupported file type.` });
        } else if (error.message.includes('Empty response')) {
            sendProgress(clientId, 'error', { message: `Gemini processing failed: Empty response.` });
        } else {
            sendProgress(clientId, 'error', { message: `Gemini processing failed: ${error.message || 'Unknown error'}` });
        }
    } finally {
         console.log(`[${clientId}] Exiting transcribeWithGemini...`);
    }
    
    return accumulatedTranscript;
};

// processTranscription function with added logging
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB) => {
    console.log(`[${clientId}] --- ENTERING processTranscription ---`); // ADDED
    const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : 10; 
    const DIRECT_PROCESSING_THRESHOLD_SEC = 30; 
    let duration = Infinity;
    let chunkPaths = [];
    let accumulatedTranscript = ''; 
    const useGeminiForTranscription = model.startsWith('gemini-');
    console.log(`[${clientId}] useGeminiForTranscription = ${useGeminiForTranscription}`); // ADDED

    try {
        console.log(`[${clientId}] Initial processing message send attempt.`); // ADDED
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})` });

        if (useGeminiForTranscription) {
            console.log(`[${clientId}] Entering Gemini Path...`); // ADDED
            if (!genAI || !geminiModel) { 
                 throw new Error("Gemini API key not configured or model initialization failed.");
            }
            await transcribeWithGemini(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model);

        } else {
            console.log(`[${clientId}] Entering Deepgram Path...`); // ADDED
             try {
                console.log(`[${clientId}] Getting file duration via ffprobe...`); // ADDED
                const ffprobePath = ffprobe.path;
                const durationCommand = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
                const { stdout } = await new Promise((resolve, reject) => {
                    exec(durationCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                        if (error) reject(stderr || error); else resolve({ stdout });
                    });
                });
                duration = parseFloat(stdout);
                console.log(`[${clientId}] ffprobe complete. Duration: ${duration} seconds`); // ADDED
                sendProgress(clientId, 'status', { message: `File duration: ${Math.round(duration)}s` });
            } catch (err) {
                console.error(`[${clientId}] Error getting file duration:`, err);
                sendProgress(clientId, 'status', { message: 'Could not determine duration, assuming large file.' });
                duration = Infinity; 
            }

            if (duration > DIRECT_PROCESSING_THRESHOLD_SEC) {
                console.log(`[${clientId}] Duration > threshold. Attempting chunking...`); // ADDED
                chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, effectiveChunkSizeMB); 
                
                // Safety checks for chunkPaths
                if (!Array.isArray(chunkPaths)) {
                  console.error(`[${clientId}] chunkPaths is not a valid array. Skipping chunk processing.`);
                  sendProgress(clientId, 'error', { message: 'Failed to process chunks: Invalid chunk paths.' });
                  return;
                } else if (chunkPaths.length === 0) {
                  console.warn(`[${clientId}] No chunks created. Proceeding with direct file processing.`);
                  sendProgress(clientId, 'warning', { message: 'No chunks created, proceeding with direct file.' });
                }
                
                const totalChunks = chunkPaths.length;
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = chunkPaths[i];
                    const progressMsg = `Transcribing chunk ${i + 1}/${totalChunks}...`; 
                    sendProgress(clientId, 'status', { message: progressMsg, model: model });
                    try {
                        console.log(`[${clientId}] Calling transcribeChunkPrerecorded for chunk ${i + 1}...`); // ADDED
                        const chunkTranscript = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, model); 
                        if (chunkTranscript !== null) { accumulatedTranscript += chunkTranscript; } 
                    } catch (err) { sendProgress(clientId, 'warning', { message: `Error processing chunk ${i + 1}. Skipping.` }); } 
                    finally { if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); } }
                }
                sendProgress(clientId, 'status', { message: 'All chunks processed.' });
            } else {
                 sendProgress(clientId, 'status', { message: 'Transcribing file directly (Pre-recorded)...', model: model });
                 try {
                     console.log(`[${clientId}] Calling transcribeChunkPrerecorded for direct file...`); // ADDED
                     const transcript = await transcribeChunkPrerecorded(clientId, filePath, diarizeEnabled, model); 
                     if (transcript !== null) { accumulatedTranscript = transcript; }
                     sendProgress(clientId, 'status', { message: 'Processing complete.' });
                 } catch (err) { /* Error handled in transcribeChunkPrerecorded */ }
            }

            // Summarize Deepgram transcript using Gemini if enabled
            if (summarizeEnabled && accumulatedTranscript.trim().length > 0 && geminiModel) {
                sendProgress(clientId, 'status', { message: 'Generating summary with Gemini...' });
                console.log(`[${clientId}] Sending Deepgram transcript (length: ${accumulatedTranscript.length}) to Gemini...`);
                try {
                    const prompt = `Analyze the following transcript and create a structured summary with these specific sections:

1. Key discussion points (bullet points)
2. Key decisions taken (bullet points)
3. Key actions to be completed (bullet points)

Format your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".

Transcript:
---
${accumulatedTranscript.trim()}
---`;
                    const safetySettings = [ { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } ];
                    
                    // *** CORRECTED Gemini API call structure for text-only input ***
                    const result = await geminiModel.generateContent(prompt, {safetySettings}); // Pass prompt string directly
                    
                    const response = result.response;
                    // *** CORRECTED RESPONSE PARSING for summary call ***
                    const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''; 
                    console.log(`[${clientId}] Gemini summary received.`);
                    // Send summary with both 'summary' and 'text' properties for compatibility
                    sendProgress(clientId, 'summary_result', { summary: summaryText, text: summaryText });
                } catch (geminiError) {
                     console.error(`[${clientId}] Gemini API error during summarization:`, geminiError);
                     sendProgress(clientId, 'error', { message: `Failed to generate summary: ${geminiError.message || 'Unknown Gemini error'}` });
                }
            } else if (summarizeEnabled && !geminiModel) { sendProgress(clientId, 'warning', { message: 'Summarization skipped: Gemini API key not configured.' }); }
              else if (summarizeEnabled) { sendProgress(clientId, 'warning', { message: 'Summarization skipped: No transcript generated.' }); }
        } // End of Deepgram path

        sendProgress(clientId, 'done', { message: 'Transcription process finished.' });

    } catch (error) {
        console.error(`[${clientId}] --- CATCH BLOCK in processTranscription ---`); // ADDED
        console.error(`[${clientId}] Top-level transcription processing error:`, error);
        // Ensure error is sent if not already handled within specific paths
        if (!error.message?.includes('Gemini processing failed') && !error.message?.includes('Deepgram failed')) {
             sendProgress(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
        }
    } finally {
        console.log(`[${clientId}] --- FINALLY BLOCK in processTranscription ---`); // ADDED
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); console.log(`[${clientId}] Cleaned up original file: ${filePath}`); }
        chunkPaths.forEach(chunkPath => { if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); } });
        console.log(`[${clientId}] Final cleanup complete.`);
        if (sseConnections[clientId]) {
             setTimeout(() => {
                if (sseConnections[clientId]) { try { sseConnections[clientId].end(); } catch(e){} delete sseConnections[clientId]; console.log(`[${clientId}] Closed SSE connection.`); }
             }, 1500);
        }
    }
};


// --- Start Server ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
