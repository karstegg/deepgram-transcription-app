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

// Helper to get __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Multer
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB limit
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Initialize Deepgram SDK
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);

// Store SSE connections
const sseConnections = {};

// SSE endpoint
app.get('/progress/:clientId', sseExpress, (req, res) => {
  const clientId = req.params.clientId;
  console.log(`Client ${clientId} connected for progress updates.`);
  sseConnections[clientId] = res;
  res.sse('connected', { message: 'Connected for progress updates' });
  req.on('close', () => {
    console.log(`Client ${clientId} disconnected.`);
    delete sseConnections[clientId];
  });
});

// Helper to send SSE updates
const sendProgress = (clientId, type, data) => {
  if (sseConnections[clientId]) {
    try {
        sseConnections[clientId].sse(type, data);
        // Avoid logging potentially large transcript/summary data
        if (type !== 'partial_transcript' && type !== 'summary_result') { 
            const logData = { ...data };
            console.log(`Sent SSE [${type}] to ${clientId}:`, logData);
        }
    } catch (sseError) {
         console.error(`[${clientId}] Failed to send SSE message type ${type}:`, sseError);
         delete sseConnections[clientId];
    }
  } else {
    // console.warn(`Cannot send SSE to disconnected client ${clientId}`);
  }
};

// Function to split media using ffmpeg
const splitMediaIntoAudioChunks = (clientId, filePath, chunkSizeMB) => {
  const approxChunkDurationSec = Math.max(10, Math.round((chunkSizeMB * 1024 * 1024) / 16000)); 
  console.log(`[${clientId}] Target chunk size ${chunkSizeMB}MB -> Approx duration ${approxChunkDurationSec}s`);
  return new Promise((resolve, reject) => {
    const outputPattern = path.join(uploadsDir, `${clientId}_chunk_%03d.mp3`);
    const command = `"${ffmpeg}" -i "${filePath}" -f segment -segment_time ${approxChunkDurationSec} -vn -acodec libmp3lame -ar 16000 -ac 1 "${outputPattern}"`;
    console.log(`[${clientId}] Executing FFmpeg command: ${command}`);
    sendProgress(clientId, 'status', { message: `Splitting file into ~${chunkSizeMB}MB audio chunks...` });
    const ffmpegProcess = exec(command);
    let stderrData = '';
    ffmpegProcess.stderr.on('data', (data) => { stderrData += data.toString(); });
    ffmpegProcess.on('close', (code) => {
        console.warn(`[${clientId}] FFmpeg stderr output:\n${stderrData}`);
        if (code !== 0) {
            console.error(`[${clientId}] FFmpeg exited with code ${code}`);
            sendProgress(clientId, 'error', { message: `Error splitting file (FFmpeg code ${code})` });
            return reject(new Error(`Error splitting file (FFmpeg code ${code})`));
        }
        const chunks = fs.readdirSync(uploadsDir)
                         .filter(file => file.startsWith(`${clientId}_chunk_`) && file.endsWith('.mp3'))
                         .map(file => path.join(uploadsDir, file))
                         .sort();
        console.log(`[${clientId}] Found ${chunks.length} MP3 chunks.`);
        sendProgress(clientId, 'status', { message: `Found ${chunks.length} audio chunks.` });
        if (chunks.length === 0) {
            const reason = stderrData.includes('Output file does not contain any stream') ? 'No audio stream found or processing error.' : 'Unknown FFmpeg issue.';
            sendProgress(clientId, 'error', { message: `No audio chunks were created. ${reason}` });
            return reject(new Error(`No audio chunks were created. ${reason}`));
        }
        resolve(chunks);
    });
    ffmpegProcess.on('error', (err) => {
        console.error(`[${clientId}] FFmpeg execution error: ${err.message}`);
        sendProgress(clientId, 'error', { message: `Error executing FFmpeg: ${err.message}` });
        reject(new Error(`Error executing FFmpeg: ${err.message}`));
    });
  });
};

// Function to transcribe a single chunk using Pre-recorded API
// Now accepts 'diarizeEnabled', 'summarizeEnabled', and 'model' flags
const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, summarizeEnabled, model) => {
    const chunkName = path.basename(chunkPath);
    console.log(`[${clientId}] Transcribing chunk: ${chunkName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})`);
    
    const transcriptionOptions = {
        punctuate: true,
        smart_format: true,
        model: model || 'nova-2',
    };
    if (diarizeEnabled) {
        transcriptionOptions.diarize = true;
    }
    // Add summarize option if enabled
    if (summarizeEnabled) {
        transcriptionOptions.summarize = 'v2'; 
    }

    try {
        const audioBuffer = fs.readFileSync(chunkPath);
        // Make the API call
        const { result, error: dgError } = await deepgramClient.listen.prerecorded.transcribeFile(
            audioBuffer,
            transcriptionOptions
        );

        if (dgError) {
            console.error(`[${clientId}] Deepgram API error for chunk ${chunkName} (Model: ${model}):`, dgError);
             if (dgError.status === 400 && dgError.message.includes('model')) {
                 sendProgress(clientId, 'error', { message: `Model '${model}' may not be available or compatible.` });
             } else if (dgError.status === 400 && dgError.message.includes('diarize')) {
                  sendProgress(clientId, 'error', { message: `Diarization may not be supported by model '${model}'.` });
             } else if (dgError.status === 400 && dgError.message.includes('summarize')) {
                  sendProgress(clientId, 'error', { message: `Summarization may not be supported by model '${model}' or your plan.` });
             }
            throw dgError;
        }

        // --- Process Results ---
        let formattedTranscript = '';
        let summary = null; // Variable to hold summary if found

        // Check for summary first (as it applies to the whole request)
        if (summarizeEnabled && result?.results?.summary?.short) {
             summary = result.results.summary.short;
             console.log(`[${clientId}] Summary received for chunk ${chunkName}.`);
             // Send summary via SSE immediately
             sendProgress(clientId, 'summary_result', { summary: summary });
        }

        // Process transcript/diarization
        if (diarizeEnabled && result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs) {
            console.log(`[${clientId}] Diarization successful for chunk ${chunkName}.`);
            const paragraphs = result.results.channels[0].alternatives[0].paragraphs.paragraphs;
            paragraphs.forEach(paragraph => {
                const speakerLabel = paragraph.speaker !== null && paragraph.speaker !== undefined 
                                     ? `Speaker ${paragraph.speaker}: ` : ''; 
                formattedTranscript += speakerLabel + paragraph.text + '\n\n';
            });
        } else {
            if (diarizeEnabled) {
                 console.warn(`[${clientId}] Diarization enabled but no paragraphs found for chunk ${chunkName}.`);
            }
            formattedTranscript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
            formattedTranscript += ' '; 
        }
        
        console.log(`[${clientId}] Transcription processed for chunk ${chunkName}.`);

        // Send transcript part via SSE
        if (formattedTranscript.trim().length > 0) {
             sendProgress(clientId, 'partial_transcript', { transcript: formattedTranscript });
        }
        
        // Return value not strictly needed, but return summary status for potential future logic
        return { transcriptProcessed: true, summaryReceived: !!summary }; 

    } catch (err) {
        console.error(`[${clientId}] Failed to transcribe chunk ${chunkName}:`, err);
        return { transcriptProcessed: false, summaryReceived: false }; // Indicate failure
    }
};


// Main transcription processing function (accepts all flags)
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB) => {
    let duration = Infinity;
    let chunkPaths = [];
    const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : 10; 
    const DIRECT_PROCESSING_THRESHOLD_SEC = 30; 

    try {
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, Chunk: ${effectiveChunkSizeMB}MB)` });

        // 1. Check duration
         try {
            const ffprobePath = ffprobe.path;
            const durationCommand = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
            const { stdout } = await new Promise((resolve, reject) => {
                exec(durationCommand, (error, stdout, stderr) => {
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

        // 2. Decide processing strategy
        if (duration > DIRECT_PROCESSING_THRESHOLD_SEC) {
            chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, effectiveChunkSizeMB); 
            const totalChunks = chunkPaths.length;
            let firstSummaryReceived = false; // Flag to track if summary was received

            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = chunkPaths[i];
                const progressMsg = `Transcribing chunk ${i + 1}/${totalChunks}...`; 
                console.log(`[${clientId}] ${progressMsg}`);
                sendProgress(clientId, 'status', { message: progressMsg, model: model });
                
                try {
                    // Pass all flags; check if summary was received (only expected once)
                    const result = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, summarizeEnabled && !firstSummaryReceived, model); 
                    if (result?.summaryReceived) {
                        firstSummaryReceived = true; // Stop requesting summary for subsequent chunks
                    }
                    console.log(`[${clientId}] Finished processing chunk ${i + 1}.`);
                } catch (err) { // Catch errors propagated from transcribeChunkPrerecorded
                    sendProgress(clientId, 'warning', { message: `Error processing chunk ${i + 1}. Skipping.` });
                } finally {
                   if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); }
                }
            }
            console.log(`[${clientId}] Finished processing all chunks.`);
            sendProgress(clientId, 'status', { message: 'All chunks processed.' });

        } else {
             sendProgress(clientId, 'status', { message: 'Transcribing file directly (Pre-recorded)...', model: model });
             try {
                 // Pass all flags
                 await transcribeChunkPrerecorded(clientId, filePath, diarizeEnabled, summarizeEnabled, model); 
                 console.log(`[${clientId}] Finished transcribing file directly.`);
                 sendProgress(clientId, 'status', { message: 'Processing complete.' });
             } catch (err) {
                  // Error already logged and potentially sent via SSE in transcribeChunkPrerecorded
                  // sendProgress(clientId, 'error', { message: `Transcription failed: ${err.message || 'Unknown error'}` });
             }
        }

        sendProgress(clientId, 'done', { message: 'Transcription process finished.' });

    } catch (error) {
        console.error(`[${clientId}] Top-level transcription processing error:`, error);
        sendProgress(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
    } finally {
        // Clean up original file only if it was chunked
        if (duration > DIRECT_PROCESSING_THRESHOLD_SEC && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[${clientId}] Cleaned up original file: ${filePath}`);
        } else if (duration <= DIRECT_PROCESSING_THRESHOLD_SEC && fs.existsSync(filePath)) {
             fs.unlinkSync(filePath);
             console.log(`[${clientId}] Cleaned up original file (processed directly): ${filePath}`);
        }
        chunkPaths.forEach(chunkPath => {
            if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); }
        });
        console.log(`[${clientId}] Final cleanup complete.`);
        
        // Close SSE connection
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
};

// Modified Transcription endpoint to receive all options
app.post('/transcribe', upload.single('audio'), (req, res) => {
   if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const clientId = uuidv4();
  const filePath = req.file.path;
  const originalName = req.file.originalname;
  
  const diarizeEnabled = req.body.enableDiarization === 'true'; 
  const summarizeEnabled = req.body.enableSummarization === 'true'; // Get summarize flag
  const model = req.body.model || 'nova-2'; 
  const chunkSizeMB = parseInt(req.body.chunkSizeMB, 10) || 10; 

  console.log(`[${clientId}] Received file: ${originalName}, Path: ${filePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkMB: ${chunkSizeMB}. Starting async processing.`);
  
  // Pass all options to main processing function
  processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB); 
  
  res.json({ clientId }); 
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
