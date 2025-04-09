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
const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, model) => {
    const chunkName = path.basename(chunkPath);
    console.log(`[${clientId}] Transcribing chunk: ${chunkName} (Diarize: ${diarizeEnabled}, Model: ${model})`);
    const transcriptionOptions = { punctuate: true, smart_format: true, model: model || 'nova-2' };
    if (diarizeEnabled) { transcriptionOptions.diarize = true; }
    try {
        const audioBuffer = fs.readFileSync(chunkPath);
        const { result, error: dgError } = await deepgramClient.listen.prerecorded.transcribeFile(audioBuffer, transcriptionOptions);
        if (dgError) { throw dgError; }
        let formattedTranscript = '';
        let plainTranscript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
        if (diarizeEnabled && result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs) {
            console.log(`[${clientId}] Diarization successful for chunk ${chunkName}.`);
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
        console.log(`[${clientId}] Transcription processed for chunk ${chunkName}.`);
        if (formattedTranscript.trim().length > 0) {
             sendProgress(clientId, 'partial_transcript', { transcript: formattedTranscript });
        }
        return plainTranscript; 
    } catch (err) {
        console.error(`[${clientId}] Failed Deepgram transcription for chunk ${chunkName}:`, err);
        sendProgress(clientId, 'error', { message: `Deepgram failed on chunk ${chunkName}: ${err.message}` });
        return null; 
    }
};

// Gemini Transcription/Summarization Function (Using Inline Data)
const transcribeWithGemini = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, modelIdentifier) => { 
    console.log(`[${clientId}] Processing with Gemini: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${modelIdentifier})`);
    sendProgress(clientId, 'status', { message: `Processing with ${modelIdentifier}...`, model: modelIdentifier });

    try {
        // 1. Read file and convert to base64 inline data
        sendProgress(clientId, 'status', { message: 'Preparing audio data...', model: modelIdentifier });
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString("base64");
        
        const fileExt = path.extname(originalName).toLowerCase(); 
        let mimeType = ''; 
        if (fileExt === '.mp3') mimeType = 'audio/mp3'; 
        else if (fileExt === '.wav') mimeType = 'audio/wav';
        else if (fileExt === '.m4a') mimeType = 'audio/m4a';
        else if (fileExt === '.aac') mimeType = 'audio/aac';
        else if (fileExt === '.ogg') mimeType = 'audio/ogg';
        else if (fileExt === '.flac') mimeType = 'audio/flac';
        else if (fileExt === '.mp4') mimeType = 'video/mp4'; 
        else {
            const detectedMimeType = mime.lookup(originalName); 
            console.log(`[${clientId}] Detected MIME type via mime.lookup for ${fileExt}: ${detectedMimeType}`);
            mimeType = detectedMimeType || 'application/octet-stream'; 
        }
        console.log(`[${clientId}] Using MIME type: ${mimeType}`);

        if (mimeType === 'application/octet-stream') {
             throw new Error(`Could not determine a supported MIME type for file: ${originalName}`);
        }
        if (!mimeType.startsWith('audio/') && !mimeType.startsWith('video/')) {
             console.warn(`[${clientId}] Warning: Determined MIME type "${mimeType}" might not be optimal for Gemini audio tasks.`);
        }
        
        const MAX_INLINE_BYTES = 15 * 1024 * 1024; 
        if (fileBuffer.length > MAX_INLINE_BYTES) {
            throw new Error(`File size (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB) exceeds limit for direct Gemini processing. Use a Deepgram model for larger files.`);
        }

        const audioDataPart = { inlineData: { mimeType: mimeType, data: base64Data } };

        // 2. Construct prompt text
        let promptText = "Transcribe the following audio accurately.";
        if (diarizeEnabled) promptText += " Identify different speakers and label their utterances clearly (e.g., 'Speaker 0:', 'Speaker 1:').";
        if (summarizeEnabled) promptText += " After the transcription, provide a concise summary starting with the exact text 'Summary:'.";
        
        // 3. Prepare contents array
        const contents = [{ role: "user", parts: [{ text: promptText }, audioDataPart] }];
        
        // 4. Safety settings
        const safetySettings = [ { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE } ];

        // 5. Call Gemini API
        sendProgress(clientId, 'status', { message: 'Sending request to Gemini...', model: modelIdentifier });
        console.log(`[${clientId}] Sending request to Gemini model ${modelIdentifier}...`);
        
        const result = await geminiModel.generateContent({ contents, safetySettings });
        console.log(`[${clientId}] Raw Gemini Result:`, JSON.stringify(result, null, 2)); 
        
        const response = result?.response;
        const responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''; 
        console.log(`[${clientId}] Gemini response received. Extracted text length: ${responseText.length}`);

        // 6. Parse response and send via SSE
        let transcript = responseText;
        let summary = null;
        if (summarizeEnabled) {
            const summaryMarker = "\nSummary:"; 
            const summaryIndex = responseText.lastIndexOf(summaryMarker);
            if (summaryIndex !== -1) {
                summary = responseText.substring(summaryIndex + summaryMarker.length).trim();
                transcript = responseText.substring(0, summaryIndex).trim(); 
                console.log(`[${clientId}] Extracted summary from Gemini response.`);
                sendProgress(clientId, 'summary_result', { summary: summary });
            } else { console.warn(`[${clientId}] Could not extract summary marker from Gemini response.`); }
        }
        
        if (transcript && transcript.trim().length > 0) { 
             sendProgress(clientId, 'partial_transcript', { transcript: transcript }); 
             console.log(`[${clientId}] Sent transcript part via SSE.`);
        } else {
             console.warn(`[${clientId}] No transcript text found in Gemini response to send.`);
             if (!summarizeEnabled || !summary) { 
                 throw new Error("Gemini response did not contain valid transcript text.");
             }
        }

    } catch (err) {
        console.error(`[${clientId}] Failed to process with Gemini:`, err);
        if (err.message?.includes('404') && err.message?.includes('models/')) {
             sendProgress(clientId, 'error', { message: `Model '${modelIdentifier}' not found or unavailable via API.` });
        } else if (err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('quota')) {
             sendProgress(clientId, 'error', { message: `Gemini API quota exceeded. Please check your usage limits.` });
        } else if (err.message?.includes('Unsupported MIME type') || err.message?.includes('Could not determine a supported MIME type')) { 
             const fileExt = path.extname(originalName).toLowerCase();
             let mimeType = ''; 
             if (fileExt === '.mp3') mimeType = 'audio/mp3'; else if (fileExt === '.wav') mimeType = 'audio/wav'; else if (fileExt === '.m4a') mimeType = 'audio/m4a'; else if (fileExt === '.aac') mimeType = 'audio/aac'; else if (fileExt === '.ogg') mimeType = 'audio/ogg'; else if (fileExt === '.flac') mimeType = 'audio/flac'; else if (fileExt === '.mp4') mimeType = 'video/mp4'; else { const detectedMimeType = mime.lookup(originalName); mimeType = detectedMimeType || 'application/octet-stream'; }
             sendProgress(clientId, 'error', { message: `Gemini processing failed: Unsupported file type (${mimeType}).` });
        } else {
             sendProgress(clientId, 'error', { message: `Gemini processing failed: ${err.message || 'Unknown error'}` });
        }
        throw err; 
    }
};


// Main transcription processing function
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB) => {
    const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : 10; 
    const DIRECT_PROCESSING_THRESHOLD_SEC = 30; 
    let duration = Infinity;
    let chunkPaths = [];
    let accumulatedTranscript = ''; 
    const useGeminiForTranscription = model.startsWith('gemini-');

    try {
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})` });

        if (useGeminiForTranscription) {
            // *** GEMINI PATH ***
            if (!genAI || !geminiModel) { 
                 throw new Error("Gemini API key not configured or model initialization failed.");
            }
            await transcribeWithGemini(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model);

        } else {
            // *** DEEPGRAM PATH ***
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

            if (duration > DIRECT_PROCESSING_THRESHOLD_SEC) {
                chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, effectiveChunkSizeMB); 
                const totalChunks = chunkPaths.length;
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = chunkPaths[i];
                    const progressMsg = `Transcribing chunk ${i + 1}/${totalChunks}...`; 
                    sendProgress(clientId, 'status', { message: progressMsg, model: model });
                    try {
                        const chunkTranscript = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, model); 
                        if (chunkTranscript !== null) { accumulatedTranscript += chunkTranscript; } 
                    } catch (err) { sendProgress(clientId, 'warning', { message: `Error processing chunk ${i + 1}. Skipping.` }); } 
                    finally { if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); } }
                }
                sendProgress(clientId, 'status', { message: 'All chunks processed.' });
            } else {
                 sendProgress(clientId, 'status', { message: 'Transcribing file directly (Pre-recorded)...', model: model });
                 try {
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
        console.error(`[${clientId}] Top-level transcription processing error:`, error);
        // Ensure error is sent if not already handled within specific paths
        if (!error.message?.includes('Gemini processing failed') && !error.message?.includes('Deepgram failed')) {
             sendProgress(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
        }
    } finally {
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

// Modified Transcription endpoint
app.post('/transcribe', upload.single('audio'), (req, res) => {
   if (!req.file) { return res.status(400).json({ error: 'No file uploaded.' }); }
   const clientId = uuidv4();
   const filePath = req.file.path;
   const originalName = req.file.originalname; 
   const diarizeEnabled = req.body.diarize === 'true' || req.body.enableDiarization === 'true';
   // Check both parameter names for summarization to ensure compatibility
   const summarizeEnabled = req.body.summarize === 'true' || req.body.enableSummarization === 'true';
   const model = req.body.model || 'nova-2'; 
   const chunkSizeMB = model.startsWith('gemini-') ? null : (parseInt(req.body.chunkSizeMB, 10) || 10); 
   console.log(`[${clientId}] Received file: ${originalName}, Path: ${filePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkTargetMB: ${chunkSizeMB ?? 'N/A'}. Starting async processing.`);
   processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB); 
   res.json({ clientId }); 
});

// Summarization-only endpoint
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
         
         // Create the prompt for summarization with structured format
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
      } finally {
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
   
   res.json({ clientId });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
