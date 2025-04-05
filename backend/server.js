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
// Import Google AI library
import { GoogleGenerativeAI } from "@google/generative-ai"; 

// Helper
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } 
});

// Uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Initialize SDKs
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);
// Initialize Google AI only if key exists
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
if (!genAI) {
    console.warn("GEMINI_API_KEY not found in .env. Summarization feature will be disabled.");
}
// Using the specific model identifier requested by the user
const geminiModel = genAI ? genAI.getGenerativeModel({ model: "gemini-2.5-pro-exp-03-25" }) : null; 

// SSE Store & Helper
const sseConnections = {};
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

// Function to split media using ffmpeg
const splitMediaIntoAudioChunks = (clientId, filePath, targetChunkSizeMB = 10) => {
  // ... (Keep this function as is) ...
  return new Promise(async (resolve, reject) => { 
    const targetChunkSizeBytes = targetChunkSizeMB * 1024 * 1024;
    let segmentDurationSec = 600; 

    try {
        sendProgress(clientId, 'status', { message: 'Analyzing file for chunking...' });
        const ffprobePath = ffprobe.path;
        const probeCommand = `"${ffprobePath}" -v error -show_format -show_streams -of json "${filePath}"`;
        console.log(`[${clientId}] Executing FFprobe command: ${probeCommand}`);
        
        const { stdout: probeJson } = await new Promise((resolveCmd, rejectCmd) => {
            exec(probeCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => { 
                if (error) {
                    console.error(`[${clientId}] FFprobe error: ${stderr || error.message}`);
                    rejectCmd(new Error(`FFprobe failed: ${stderr || error.message}`));
                } else {
                    resolveCmd({ stdout });
                }
            });
        });

        const probeData = JSON.parse(probeJson);
        const format = probeData.format;
        
        if (format?.duration && format?.size) {
            const totalDurationSec = parseFloat(format.duration);
            const totalSizeBytes = parseInt(format.size, 10);
            const avgBitrateBps = totalSizeBytes / totalDurationSec; 
            
            if (avgBitrateBps > 0) {
                 segmentDurationSec = Math.round(targetChunkSizeBytes / avgBitrateBps);
                 segmentDurationSec = Math.max(10, Math.min(segmentDurationSec, 900)); 
                 console.log(`[${clientId}] Calculated segment duration: ${segmentDurationSec}s (Total Duration: ${totalDurationSec.toFixed(1)}s, Avg Bitrate: ${(avgBitrateBps * 8 / 1000).toFixed(1)}kbps)`);
            } else {
                 console.warn(`[${clientId}] Could not calculate average bitrate, using default segment duration: ${segmentDurationSec}s`);
            }
        } else {
             console.warn(`[${clientId}] Could not get duration/size from ffprobe, using default segment duration: ${segmentDurationSec}s`);
        }
        sendProgress(clientId, 'status', { message: `Splitting into ~${segmentDurationSec}s chunks...` });

    } catch (probeError) {
        console.error(`[${clientId}] Error during ffprobe analysis:`, probeError);
        sendProgress(clientId, 'warning', { message: `Could not analyze file, using default chunk duration (${segmentDurationSec}s).` });
    }

    const outputPattern = path.join(uploadsDir, `${clientId}_chunk_%03d.mp3`);
    const command = `"${ffmpeg}" -i "${filePath}" -f segment -segment_time ${segmentDurationSec} -vn -acodec libmp3lame -ar 16000 -ac 1 -reset_timestamps 1 "${outputPattern}"`; 
    console.log(`[${clientId}] Executing FFmpeg command: ${command}`);
    
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
// Removed summarizeEnabled flag from options sent to Deepgram
const transcribeChunkPrerecorded = async (clientId, chunkPath, diarizeEnabled, model) => {
    const chunkName = path.basename(chunkPath);
    console.log(`[${clientId}] Transcribing chunk: ${chunkName} (Diarize: ${diarizeEnabled}, Model: ${model})`);
    
    const transcriptionOptions = {
        punctuate: true,
        smart_format: true,
        model: model || 'nova-2',
    };
    if (diarizeEnabled) {
        transcriptionOptions.diarize = true;
    }
    // Removed summarize option - will call Gemini separately

    try {
        const audioBuffer = fs.readFileSync(chunkPath);
        const { result, error: dgError } = await deepgramClient.listen.prerecorded.transcribeFile(
            audioBuffer,
            transcriptionOptions
        );

        if (dgError) {
            console.error(`[${clientId}] Deepgram API error for chunk ${chunkName} (Model: ${model}):`, dgError);
             if (dgError.status === 400 && dgError.message?.includes('model')) {
                 sendProgress(clientId, 'error', { message: `Model '${model}' may not be available or compatible.` });
             } else if (dgError.status === 400 && dgError.message?.includes('diarize')) {
                  sendProgress(clientId, 'error', { message: `Diarization may not be supported by model '${model}'.` });
             }
            throw dgError;
        }

        let formattedTranscript = '';
        // Use plain transcript for accumulation, formatting happens before sending
        let plainTranscript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

        if (diarizeEnabled && result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs) {
            console.log(`[${clientId}] Diarization successful for chunk ${chunkName}. Formatting output.`);
            const paragraphs = result.results.channels[0].alternatives[0].paragraphs.paragraphs;
            let currentChunkFormatted = '';
            paragraphs.forEach(paragraph => {
                const speakerLabel = paragraph.speaker !== null && paragraph.speaker !== undefined 
                                     ? `Speaker ${paragraph.speaker}: ` : ''; 
                const paragraphText = paragraph.sentences?.map(sentence => sentence.text).join(' ') ?? ''; 
                currentChunkFormatted += speakerLabel + paragraphText + '\n\n'; 
            });
            formattedTranscript = currentChunkFormatted; // Use the formatted version for sending
        } else {
            if (diarizeEnabled) {
                 console.warn(`[${clientId}] Diarization enabled but no paragraphs found for chunk ${chunkName}.`);
            }
            formattedTranscript = plainTranscript + ' '; // Use plain + space for sending non-diarized
        }
        
        console.log(`[${clientId}] Transcription processed for chunk ${chunkName}.`);

        // Send formatted transcript part via SSE
        if (formattedTranscript.trim().length > 0) {
             sendProgress(clientId, 'partial_transcript', { transcript: formattedTranscript });
        }
        
        // Return the plain transcript for accumulation
        return plainTranscript; 

    } catch (err) {
        console.error(`[${clientId}] Failed to transcribe chunk ${chunkName}:`, err);
        return null; // Indicate failure
    }
};


// Main transcription processing function
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB) => {
    const effectiveChunkSizeMB = chunkSizeMB && chunkSizeMB > 0 ? chunkSizeMB : 10; 
    const DIRECT_PROCESSING_THRESHOLD_SEC = 30; 
    let duration = Infinity;
    let chunkPaths = [];
    let accumulatedTranscript = ''; // Accumulate plain transcript

    try {
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, Chunk Target: ${effectiveChunkSizeMB}MB)` });

        // 1. Check duration
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

        // 2. Decide processing strategy & Transcribe
        if (duration > DIRECT_PROCESSING_THRESHOLD_SEC) {
            chunkPaths = await splitMediaIntoAudioChunks(clientId, filePath, effectiveChunkSizeMB); 
            const totalChunks = chunkPaths.length;
            
            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = chunkPaths[i];
                const progressMsg = `Transcribing chunk ${i + 1}/${totalChunks}...`; 
                console.log(`[${clientId}] ${progressMsg}`);
                sendProgress(clientId, 'status', { message: progressMsg, model: model });
                
                try {
                    // Pass false for summarize flag to Deepgram, accumulate plain text
                    const chunkTranscript = await transcribeChunkPrerecorded(clientId, chunkPath, diarizeEnabled, false, model); 
                    if (chunkTranscript !== null) {
                        accumulatedTranscript += chunkTranscript + ' '; // Accumulate plain text
                    }
                    console.log(`[${clientId}] Finished processing chunk ${i + 1}.`);
                } catch (err) { 
                    sendProgress(clientId, 'warning', { message: `Error processing chunk ${i + 1}. Skipping.` });
                } finally {
                   if (fs.existsSync(chunkPath)) { fs.unlinkSync(chunkPath); }
                }
            }
            console.log(`[${clientId}] Finished transcribing all chunks.`);
            sendProgress(clientId, 'status', { message: 'All chunks processed.' });

        } else {
             sendProgress(clientId, 'status', { message: 'Transcribing file directly (Pre-recorded)...', model: model });
             try {
                 // Pass false for summarize flag to Deepgram
                 const transcript = await transcribeChunkPrerecorded(clientId, filePath, diarizeEnabled, false, model); 
                 if (transcript !== null) {
                     accumulatedTranscript = transcript; // Assign directly
                 }
                 console.log(`[${clientId}] Finished transcribing file directly.`);
                 sendProgress(clientId, 'status', { message: 'Processing complete.' });
             } catch (err) {
                  // Error handled within transcribeChunkPrerecorded
             }
        }

        // 3. Summarize using Gemini if enabled and transcript exists
        if (summarizeEnabled && accumulatedTranscript.trim().length > 0 && geminiModel) {
            sendProgress(clientId, 'status', { message: 'Generating summary with Gemini...' });
            console.log(`[${clientId}] Sending transcript (length: ${accumulatedTranscript.length}) to Gemini for summarization...`);
            try {
                const prompt = `Summarize the following transcript concisely:\n\n---\n${accumulatedTranscript.trim()}\n---`;
                // Add safety settings if needed
                // const safetySettings = [ ... ]; 
                const result = await geminiModel.generateContent(prompt /*, safetySettings */);
                const response = result.response;
                const summaryText = response.text();
                console.log(`[${clientId}] Gemini summary received.`);
                sendProgress(clientId, 'summary_result', { summary: summaryText });
            } catch (geminiError) {
                 console.error(`[${clientId}] Gemini API error:`, geminiError);
                 sendProgress(clientId, 'error', { message: `Failed to generate summary: ${geminiError.message || 'Unknown Gemini error'}` });
            }
        } else if (summarizeEnabled && !geminiModel) {
             sendProgress(clientId, 'warning', { message: 'Summarization skipped: Gemini API key not configured.' });
        } else if (summarizeEnabled) {
             sendProgress(clientId, 'warning', { message: 'Summarization skipped: No transcript generated.' });
        }


        sendProgress(clientId, 'done', { message: 'Transcription process finished.' });

    } catch (error) {
        console.error(`[${clientId}] Top-level transcription processing error:`, error);
        sendProgress(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
    } finally {
        // Clean up original file only if it was chunked
        if (duration > DIRECT_PROCESSING_THRESHOLD_SEC && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[${clientId}] Cleaned up original file (chunked): ${filePath}`);
        } else if (duration <= DIRECT_PROCESSING_THRESHOLD_SEC && fs.existsSync(filePath)) {
             fs.unlinkSync(filePath); 
             console.log(`[${clientId}] Cleaned up original file (direct): ${filePath}`);
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

// Modified Transcription endpoint
app.post('/transcribe', upload.single('audio'), (req, res) => {
   if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const clientId = uuidv4();
  const filePath = req.file.path;
  const originalName = req.file.originalname;
  
  const diarizeEnabled = req.body.enableDiarization === 'true'; 
  const summarizeEnabled = req.body.enableSummarization === 'true'; 
  const model = req.body.model || 'nova-2'; 
  const chunkSizeMB = parseInt(req.body.chunkSizeMB, 10) || 10; 

  console.log(`[${clientId}] Received file: ${originalName}, Path: ${filePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}, ChunkTargetMB: ${chunkSizeMB}. Starting async processing.`);
  
  processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model, chunkSizeMB); 
  
  res.json({ clientId }); 
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
