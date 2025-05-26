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

const app = express();
const port = process.env.PORT || 5000;

// Middleware & Multer setup
app.use(cors());
app.use(express.json());
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
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 
        console.log("Gemini model initialized:", "gemini-1.5-flash-latest");
    } catch (initError) {
         console.error("Failed to initialize Gemini model:", initError);
         geminiModel = null; 
    }
}

// SSE Store & Helper
const sseConnections = {};
// Track active processes for cancellation
const activeProcesses = {};

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

// Add cancellation endpoint
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
const sendProgress = (clientId, type, data) => {
  if (sseConnections[clientId]) {
    try {
        sseConnections[clientId].sse(type, data);
        if (type !== 'partial_transcript' && type !== 'summary_result') { 
            const logData = { ...data };
            console.log(`Sent SSE [${type}] to ${clientId}:`, logData);
        }
    } catch (sseError) {
         console.error(`[${clientId}] Failed to send SSE message type ${type}:`, sseError);
         delete sseConnections[clientId];
    }
  }
};

// FFMpeg Chunking Function
const splitMediaIntoAudioChunks = (clientId, filePath, targetChunkSizeMB = 10) => {
  return new Promise(async (resolve, reject) => { 
    const targetChunkSizeBytes = targetChunkSizeMB * 1024 * 1024;
    let segmentDurationSec = 600; 
    try {
        sendProgress(clientId, 'status', { message: 'Analyzing file for chunking...' });
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
                // Calculate how many chunks we should have based on file size
                const expectedChunks = Math.ceil(totalSizeBytes / targetChunkSizeBytes);
                // Calculate segment duration to achieve the expected number of chunks
                segmentDurationSec = Math.ceil(totalDurationSec / expectedChunks);
                // Still apply reasonable limits
                segmentDurationSec = Math.max(10, Math.min(segmentDurationSec, 900));
                console.log(`[${clientId}] File size: ${(totalSizeBytes/1024/1024).toFixed(2)}MB, Target chunk size: ${targetChunkSizeMB}MB`);
                console.log(`[${clientId}] Expected chunks: ${expectedChunks}, Calculated segment duration: ${segmentDurationSec}s`);
            } else { console.warn(`[${clientId}] Could not calculate bitrate, using default duration.`); }
        } else { console.warn(`[${clientId}] Could not get duration/size, using default duration.`); }
        sendProgress(clientId, 'status', { message: `Splitting into ~${segmentDurationSec}s chunks...` });
    } catch (probeError) {
        console.error(`[${clientId}] Error during ffprobe analysis:`, probeError);
        sendProgress(clientId, 'warning', { message: `Could not analyze file, using default chunk duration.` });
    }
    const outputPattern = path.join(uploadsDir, `${clientId}_chunk_%03d.mp3`);
    const command = `"${ffmpeg}" -i "${filePath}" -f segment -segment_time ${segmentDurationSec} -vn -acodec libmp3lame -ar 16000 -ac 1 -reset_timestamps 1 "${outputPattern}"`; 
    const ffmpegProcess = exec(command);
    
    // Track the process for potential cancellation
    if (!activeProcesses[clientId]) {
        activeProcesses[clientId] = [];
    }
    activeProcesses[clientId].push(ffmpegProcess);
    
    let stderrData = '';
    ffmpegProcess.stderr.on('data', (data) => { stderrData += data.toString(); });
    
    ffmpegProcess.on('close', (code) => {
        console.warn(`[${clientId}] FFmpeg stderr output:\n${stderrData}`);
        
        // Remove this process from active processes
        if (activeProcesses[clientId]) {
            const index = activeProcesses[clientId].indexOf(ffmpegProcess);
            if (index !== -1) {
                activeProcesses[clientId].splice(index, 1);
            }
            if (activeProcesses[clientId].length === 0) {
                delete activeProcesses[clientId];
            }
        }
        
        if (code !== 0 && code !== null) { 
            return reject(new Error(`Error splitting file (FFmpeg code ${code})`)); 
        }
        
        // Check if we still have an active connection (not cancelled)
        if (!sseConnections[clientId]) {
            console.log(`[${clientId}] Client disconnected during chunking, aborting.`);
            return reject(new Error('Client disconnected'));
        }
        
        const chunks = fs.readdirSync(uploadsDir).filter(f => f.startsWith(`${clientId}_chunk_`) && f.endsWith('.mp3')).map(f => path.join(uploadsDir, f)).sort();
        console.log(`[${clientId}] Found ${chunks.length} MP3 chunks.`);
        sendProgress(clientId, 'status', { message: `Found ${chunks.length} audio chunks.` });
        if (chunks.length === 0) { return reject(new Error(`No audio chunks created.`)); }
        resolve(chunks);
    });
    
    ffmpegProcess.on('error', (err) => {
        // Remove this process from active processes on error
        if (activeProcesses[clientId]) {
            const index = activeProcesses[clientId].indexOf(ffmpegProcess);
            if (index !== -1) {
                activeProcesses[clientId].splice(index, 1);
            }
            if (activeProcesses[clientId].length === 0) {
                delete activeProcesses[clientId];
            }
        }
        reject(new Error(`Error executing FFmpeg: ${err.message}`));
    });
  });
};

// Deepgram Pre-recorded Transcription Function
const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, model, summarizeEnabled) => {
    const chunkName = path.basename(chunkPath);
    console.log(`[${clientId}] Transcribing chunk/file: ${chunkName} (Diarize: ${diarizeEnabled}, Model: ${model}, DG Summary: ${summarizeEnabled})`);
    const transcriptionOptions = {
        punctuate: true,
        smart_format: true,
        model: model || 'nova-2',
        utterances: true // Ensure utterances are enabled
    };
    if (diarizeEnabled) { transcriptionOptions.diarize = true; }
    if (summarizeEnabled) { transcriptionOptions.summarize = 'v2'; }
    try {
        const audioStream = fs.createReadStream(chunkPath);
        const { result, error: dgError } = await deepgramClient.listen.prerecorded.transcribeFile(audioStream, transcriptionOptions);
        if (dgError) {
            console.error(`[${clientId}] Deepgram API error for ${chunkName}:`, dgError);
            sendProgress(clientId, 'error', { message: `Deepgram API error on ${chunkName}: ${dgError.message || 'Unknown Deepgram error'}` });
            throw dgError; // Re-throw to be caught by processTranscription
        }

        // Log if a summary was returned by Deepgram when requested
        if (summarizeEnabled && result?.results?.summary?.short) {
            console.log(`[${clientId}] Deepgram returned a summary for ${chunkName}.`);
        }

        // Send diarized transcript via SSE if available, otherwise plain transcript
        // This partial_transcript sending might be better handled in processTranscription after accumulating
        // For now, let's keep it but be mindful of multiple small updates if this function is called per chunk.
        // A better approach might be to only send 'partial_transcript' from processTranscription after a full chunk is processed.
        // For now, this provides immediate feedback for the current chunk/file.
        const firstAlternative = result?.results?.channels?.[0]?.alternatives?.[0];
        if (firstAlternative) {
            let transcriptToSend = firstAlternative.transcript ?? '';
            if (diarizeEnabled && firstAlternative.paragraphs?.paragraphs) {
                let diarizedText = '';
                firstAlternative.paragraphs.paragraphs.forEach(p => {
                    const speaker = p.speaker !== null && p.speaker !== undefined ? `Speaker ${p.speaker}: ` : '';
                    const text = p.sentences?.map(s => s.text).join(' ') ?? '';
                    diarizedText += speaker + text + '\n\n';
                });
                if (diarizedText.trim().length > 0) transcriptToSend = diarizedText;
            }
            if (transcriptToSend.trim().length > 0) {
                sendProgress(clientId, 'partial_transcript', { transcript: transcriptToSend.trim() });
            }
        }
        
        console.log(`[${clientId}] Deepgram processing complete for ${chunkName}.`);
        return result; // Return the full result object 
    }
    catch (err) {
        // Errors from deepgramClient.listen (like API errors) should be caught by the dgError check above.
        // This block would catch other unexpected errors (e.g., fs issues if audioStream failed, though unlikely here).
        console.error(`[${clientId}] Unexpected error in transcribeChunkPrerecorded for ${chunkName}:`, err);
        sendProgress(clientId, 'error', { message: `Unexpected error processing ${chunkName}: ${err.message}` });
        // Return null or throw, depending on how processTranscription should handle it.
        // Throwing is consistent with how dgError is handled.
        throw err;
}
};

// Helper function to summarize transcript with Gemini
async function summarizeTranscriptWithGemini(clientId, transcriptText, model) {
    if (!geminiModel) {
        sendProgress(clientId, 'warning', { message: 'Gemini summarization skipped: Gemini API key not configured or model not initialized.' });
        return;
    }
    if (!transcriptText || transcriptText.trim().length === 0) {
        sendProgress(clientId, 'warning', { message: 'Gemini summarization skipped: No transcript text provided.' });
        return;
    }

    sendProgress(clientId, 'status', { message: `Generating summary with Gemini for ${model} transcript...` });
    console.log(`[${clientId}] Sending transcript (length: ${transcriptText.length}) to Gemini for summarization...`);

    try {
        const prompt = `Analyze the following transcript and create a structured summary with these specific sections:

1. Key discussion points (bullet points)
2. Key decisions taken (bullet points)
3. Key actions to be completed (bullet points)

Format your response exactly with these three headings and bullet points under each. If any section has no relevant content, include the heading but note "None identified".

Transcript:
-----
${transcriptText.trim()}
-----`;
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ];
        
        const result = await geminiModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], safetySettings });
        const response = result.response;
        const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        
        if (summaryText.trim().length > 0) {
            console.log(`[${clientId}] Gemini summary received for transcript.`);
            sendProgress(clientId, 'summary_result', { summary: summaryText, provider: 'gemini' });
        } else {
            sendProgress(clientId, 'warning', { message: 'Gemini summarization resulted in an empty summary.' });
        }
    } catch (geminiError) {
        console.error(`[${clientId}] Gemini API error during summarization of transcript:`, geminiError);
        sendProgress(clientId, 'error', { message: `Failed to generate summary via Gemini: ${geminiError.message || 'Unknown Gemini error'}` });
    }
}

async function transcribeWithDeepgram(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB, summarizationProvider) {
    console.log(`[${clientId}] Processing with Deepgram: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkTargetMB: ${chunkSizeMB}, Summarization Provider: ${summarizationProvider})`);
    sendProgress(clientId, 'status', { message: `Processing with Deepgram ${model}...` });

    const DIRECT_PROCESSING_THRESHOLD_SEC = 30; // Files shorter than this won't be chunked by default
    let duration = Infinity;
    let chunkPaths = [];
    let accumulatedTranscript = '';
    let dgDirectResult = null; // To store result from non-chunked Deepgram call

    try {
        try {
            const ffprobePath = ffprobe.path;
            const durationCommand = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
            const { stdout } = await new Promise((resolve, reject) => {
                exec(durationCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                    if (error) reject(stderr || error); else resolve({ stdout });
                });
            });
            duration = parseFloat(stdout);
            console.log(`[${clientId}] File duration: ${duration} seconds`);
            sendProgress(clientId, 'status', { message: `File duration: ${Math.round(duration)}s` });
        } catch (err) {
            console.error(`[${clientId}] Error getting file duration:`, err);
            sendProgress(clientId, 'status', { message: 'Could not determine duration, assuming large file.' });
            duration = Infinity; 
        }

        const isChunking = duration > DIRECT_PROCESSING_THRESHOLD_SEC && model !== 'whisper-large'; // Whisper model does not benefit from chunking in the same way
        
        if (isChunking) {
            sendProgress(clientId, 'status', { message: `File is long (${Math.round(duration)}s), chunking...`, model: model });
            chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, chunkSizeMB);
            const totalChunks = chunkPaths.length;
            for (let i = 0; i < totalChunks; i++) {
                if (!sseConnections[clientId]) throw new Error('Client disconnected during chunk processing.');
                const chunkPath = chunkPaths[i];
                const progressMsg = `Transcribing chunk ${i + 1}/${totalChunks} with Deepgram...`; 
                sendProgress(clientId, 'status', { message: progressMsg, model: model });
                try {
                    // For chunked audio, Deepgram summarization for the whole audio is not done per chunk.
                    const chunkResult = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, model, false);
                    if (chunkResult && chunkResult.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
                        accumulatedTranscript += chunkResult.results.channels[0].alternatives[0].transcript + " ";
                    }
                } catch (err) {
                    sendProgress(clientId, 'warning', { message: `Error processing chunk ${i + 1}. Skipping.` });
                    console.error(`[${clientId}] Error transcribing chunk ${chunkPath}:`, err);
                } finally {
                    if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); }
                }
            }
            sendProgress(clientId, 'status', { message: 'All Deepgram chunks processed.' });
        } else {
            sendProgress(clientId, 'status', { message: 'Transcribing file directly with Deepgram...', model: model });
            const deepgramShouldSummarizeDirectly = summarizeEnabled && summarizationProvider === 'deepgram';
            dgDirectResult = await transcribeChunkPrerecorded(clientId, filePath, diarizeEnabled, model, deepgramShouldSummarizeDirectly);
            if (dgDirectResult && dgDirectResult.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
                accumulatedTranscript = dgDirectResult.results.channels[0].alternatives[0].transcript;
            }
            sendProgress(clientId, 'status', { message: 'Deepgram direct processing complete.' });
        }

        // Send final accumulated transcript if not empty
        if (accumulatedTranscript.trim().length > 0) {
             sendProgress(clientId, 'final_transcript', { transcript: accumulatedTranscript.trim() });
        }

        // Handle summarization based on the provider and available transcript
        if (summarizeEnabled) {
            if (summarizationProvider === 'deepgram') {
                if (!isChunking && dgDirectResult && dgDirectResult.results?.summary?.short) {
                    sendProgress(clientId, 'summary_result', { summary: dgDirectResult.results.summary.short, provider: 'deepgram' });
                } else if (isChunking) {
                    sendProgress(clientId, 'warning', { message: "Deepgram summarization for chunked audio is not performed per chunk. Full transcript generated." });
                } else if (!dgDirectResult?.results?.summary?.short) {
                     sendProgress(clientId, 'warning', { message: "Deepgram summary was requested but not found in the direct response." });
                }
            } else if (summarizationProvider === 'gemini') {
                if (accumulatedTranscript.trim().length > 0) {
                    await summarizeTranscriptWithGemini(clientId, accumulatedTranscript, model); // Ensure this helper is defined
                } else {
                    sendProgress(clientId, 'warning', { message: 'Gemini summarization skipped: No transcript generated by Deepgram.' });
                }
            }
        }

    } catch (error) {
        console.error(`[${clientId}] Error in transcribeWithDeepgram:`, error);
        sendProgress(clientId, 'error', { message: `Deepgram processing failed: ${error.message || 'Unknown error'}` });
        // Do not throw here, allow finally to execute for cleanup
    } finally {
        // Cleanup original uploaded file (filePath) is handled by processTranscription's finally block
        for (const chunkPath of chunkPaths) {
            if (fs.existsSync(chunkPath)) {
                fs.unlinkSync(chunkPath);
            }
        }
        console.log(`[${clientId}] Deepgram transcription path finished.`);
    }
}

// Gemini Transcription/Summarization Function (Using Inline Data)
const transcribeWithGemini = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, summarizationProvider) => { 
    console.log(`[${clientId}] Processing with Gemini: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, Summarization Provider: ${summarizationProvider})`);
    sendProgress(clientId, 'status', { message: `Processing with ${model}...`, model: model });

    try {
        // 1. Read file and convert to base64 inline data
        // Placeholder for Gemini transcription logic
        console.log(`[${clientId}] Gemini transcription logic not fully implemented yet.`);
        sendProgress(clientId, 'warning', { message: 'Gemini transcription path is not fully implemented.'});
    } catch (error) {
        console.error(`[${clientId}] Error in transcribeWithGemini:`, error);
        sendProgress(clientId, 'error', { message: `Gemini processing failed: ${error.message || 'Unknown error'}` });
    } finally {
        console.log(`[${clientId}] Gemini transcription path finished.`);
    }
}

// Main transcription processing function
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB, summarizationProvider, useGemini) => {
    // ...

    try {
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Provider: ${summarizationProvider || 'N/A'}, Model: ${model})` });

        if (useGemini) {
            // *** GEMINI PATH ***
            if (!genAI || !geminiModel) { 
                 throw new Error("Gemini API key not configured or model initialization failed.");
            }
            // For Gemini path, summarizeEnabled will be derived based on summarizationProvider inside transcribeWithGemini or handled by its existing logic.
            // We pass 'summarizationProvider' and let transcribeWithGemini decide if it implies summarization.
            // For now, let's assume transcribeWithGemini needs a boolean summarizeEnabled. 
            // If summarizationProvider is 'gemini', then summarize is true, otherwise false for Gemini's own summarization.
            const geminiShouldSummarize = (summarizationProvider === 'gemini');
            await transcribeWithGemini(clientId, filePath, originalName, diarizeEnabled, geminiShouldSummarize, model, summarizationProvider);

        } else {
            // *** DEEPGRAM PATH ***
            const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : 10; // Default to 10MB if not specified or invalid
            await transcribeWithDeepgram(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, effectiveChunkSizeMB, summarizationProvider);
        } // End of Deepgram path

        sendProgress(clientId, 'done', { message: 'Transcription process finished.' });

    } catch (error) {
        console.error(`[${clientId}] Top-level transcription processing error:`, error);
        // Ensure error is sent if not already handled within specific paths
        if (!error.message?.includes('Gemini processing failed') && !error.message?.includes('Deepgram failed')) {
             sendProgress(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
        }
    } finally {
        // ...
    }
};

// Modified Transcription endpoint
app.post('/transcribe', upload.single('audio'), (req, res) => {
   if (!req.file) { return res.status(400).json({ error: 'No file uploaded.' }); }
   const clientId = uuidv4();
   const filePath = req.file.path;
   const originalName = req.file.originalname; 
   const diarizeEnabled = req.body.diarize === 'true' || req.body.enableDiarization === 'true';
   // Check both parameter names for summarization to ensure compatibility
   const summarizeEnabled = req.body.summarize === 'true' || req.body.enableSummarization === 'true';
   const { model, enableDiarization, enableSummarization, chunkSizeMB, useGemini, summarizationProvider } = req.body;
   const chunkSizeMBValue = model.startsWith('gemini-') ? null : (parseInt(chunkSizeMB, 10) || 10); 
   console.log(`[${clientId}] Received file: ${originalName}, Path: ${filePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkTargetMB: ${chunkSizeMBValue ?? 'N/A'}. Starting async processing.`);
   processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMBValue, summarizationProvider || 'gemini', useGemini === 'true');
   res.json({ clientId }); 
});

// Summarization-only endpoint
app.post('/summarize', upload.single('audio'), (req, res) => {
   // ...
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
            sendProgress(clientId, 'warning', { message: "Deepgram summarization was requested, but no summary found in Deepgram's direct response." });
            } else if (summarizeEnabled && summarizationProvider === 'gemini' && accumulatedTranscript.trim().length > 0) {
                await summarizeTranscriptWithGemini(clientId, accumulatedTranscript, model);
            return;
         }
         
         // Create the prompt for summarization with structured format
         const prompt = `Analyze the following transcript and create a structured summary with these specific sections:
{{ ... }}
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
         
         // Call Gemini API for summarization
         sendProgress(clientId, 'status', { message: 'Sending request to Gemini...' });
         const result = await geminiModel.generateContent(prompt, {safetySettings});
         const response = result.response;
         const summaryText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
         
         console.log(`[${clientId}] Gemini summary received.`);
         
         if (summaryText.trim().length > 0) {
            // Send the summary result
            sendProgress(clientId, 'summary_result', { summary: summaryText, text: summaryText });
            sendProgress(clientId, 'status', { message: 'Summary generated successfully.', progress: 100 });
         } else {
            sendProgress(clientId, 'error', { message: 'Failed to generate summary: Empty response from Gemini.' });
         }
      } catch (error) {
         console.error(`[${clientId}] Error during summarization:`, error);
         sendProgress(clientId, 'error', { message: `Summarization failed: ${error.message || 'Unknown error'}` });
      }
      finally {
         // Mark the process as complete
         sendProgress(clientId, 'done', { message: 'Summarization process finished.' });
         
         // Close the SSE connection after a delay
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
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
