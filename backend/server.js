import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
// Import LiveTranscriptionEvents if needed for detailed events, otherwise just createClient
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'; 
// Removed ffmpeg and ffprobe imports
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sseExpress from 'sse-express';
import { v4 as uuidv4 } from 'uuid';
// Removed Readable stream import as createReadStream is sufficient

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
    // Clean up any resources associated with this client if needed
    delete sseConnections[clientId]; 
  });
});

// Helper to send SSE updates
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
  } else {
     // console.warn(`Cannot send SSE to disconnected client ${clientId}`);
  }
};

// *** REMOVED splitMediaIntoAudioChunks function ***

// *** REVISED: Function to stream the entire audio file to Deepgram Live API ***
const streamFileToDeepgram = (clientId, filePath, diarizeEnabled, summarizeEnabled, model) => {
    return new Promise((resolve, reject) => {
        const fileName = path.basename(filePath);
        console.log(`[${clientId}] Attempting live transcription for file: ${fileName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})`);
        let deepgramLive = null;
        let fileStream = null;
        let connectionClosed = false;
        let resolved = false; 

        const cleanup = (error) => {
            if (resolved) return;
            resolved = true;
            connectionClosed = true; 
            if (fileStream && !fileStream.destroyed) {
                fileStream.destroy();
            }
            if (deepgramLive && deepgramLive.getReadyState() < 2) {
                 console.log(`[${clientId}] Cleaning up: Forcing close Deepgram connection for ${fileName}`);
                 try { deepgramLive.finish(); } catch (e) { console.error("Error finishing deepgram connection:", e)}
            }
             if (error) {
                 console.error(`[${clientId}] Rejecting promise for ${fileName} due to error.`);
                 reject(error);
             } else {
                 console.log(`[${clientId}] Resolving promise for ${fileName}.`);
                 resolve(); // Resolve without value, results sent via SSE
             }
        };

        try {
            // Construct minimal options for testing connection
            const liveOptions = {
                punctuate: true,
                model: model || 'nova-2',
                // Temporarily removed: smart_format, interim_results
            };
            // Temporarily removed conditional diarize/summarize for testing
            // if (diarizeEnabled) {
            //     liveOptions.diarize = true;
            // }
            // if (summarizeEnabled) {
            //     liveOptions.summarize = 'v2';
            // }
            console.log(`[${clientId}] Attempting Deepgram connection with minimal options:`, liveOptions);
            deepgramLive = deepgramClient.listen.live(liveOptions);

            deepgramLive.on(LiveTranscriptionEvents.Open, () => {
                if (connectionClosed) return; 
                console.log(`[${clientId}] Deepgram connection opened for ${fileName}.`);
                
                fileStream = fs.createReadStream(filePath);

                fileStream.on('data', (data) => {
                    if (connectionClosed) return;
                    if (deepgramLive && deepgramLive.getReadyState() === 1 /* OPEN */) {
                        deepgramLive.send(data);
                    } else {
                         console.warn(`[${clientId}] Deepgram connection not open while sending data for ${fileName}. State: ${deepgramLive?.getReadyState()}`);
                         cleanup(new Error("Deepgram connection closed prematurely during data send."));
                    }
                });

                fileStream.on('end', () => {
                    if (connectionClosed) return;
                    console.log(`[${clientId}] Finished reading ${fileName}. Sending finish signal.`);
                    if (deepgramLive && deepgramLive.getReadyState() === 1) {
                        deepgramLive.finish(); // Signal end of audio stream
                    } else {
                         console.warn(`[${clientId}] Cannot send finish signal, connection not open for ${fileName}.`);
                    }
                });

                fileStream.on('error', (err) => {
                    if (connectionClosed) return;
                    console.error(`[${clientId}] Error reading file ${fileName}:`, err);
                    cleanup(err);
                });
            });

            deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
                if (connectionClosed) return;
                const transcript = data.channel?.alternatives?.[0]?.transcript;
                if (transcript && transcript.trim().length > 0) {
                    sendProgress(clientId, 'partial_transcript', { transcript: transcript + ' ' });
                }
            });

             // Handle summary if provided in the results (might come with Transcript or Metadata)
             // NOTE: Live API might send summary differently than Pre-recorded. Check Deepgram docs if this doesn't work.
             // Let's check both Transcript and Metadata events for summary.
             const handleSummary = (summaryData) => {
                 if (summarizeEnabled && summaryData?.summary?.short) {
                     const summary = summaryData.summary.short;
                     console.log(`[${clientId}] Summary received.`);
                     sendProgress(clientId, 'summary_result', { summary: summary });
                     // Potentially disable requesting summary further if needed, though live might handle this.
                 }
             };
             deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => handleSummary(data));
             deepgramLive.on(LiveTranscriptionEvents.Metadata, (data) => handleSummary(data));


            deepgramLive.on(LiveTranscriptionEvents.Close, (event) => {
                console.log(`[${clientId}] Deepgram connection closed for ${fileName}. Code: ${event.code}, Reason: ${event.reason}`);
                cleanup(null); // Resolve normally on close
            });

            deepgramLive.on(LiveTranscriptionEvents.Error, (err) => {
                console.error(`[${clientId}] Deepgram connection error for ${fileName}:`, err);
                cleanup(err); 
            });

             deepgramLive.on(LiveTranscriptionEvents.Warning, (warn) => {
                 console.warn(`[${clientId}] Deepgram warning for ${fileName}:`, warn);
             });

        } catch (initError) {
             console.error(`[${clientId}] Failed to initialize Deepgram connection for ${fileName}:`, initError);
             cleanup(initError);
        }
    });
};


// *** REVISED: Main transcription processing function (No chunking) ***
const processTranscription = async (clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model) => {
    
    try {
        // Include all options in the initial status message
        sendProgress(clientId, 'status', { message: `Processing: ${originalName} (Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model})` });

        // Directly stream the entire file
        sendProgress(clientId, 'status', { message: 'Streaming file to Deepgram...', model: model });
        await streamFileToDeepgram(clientId, filePath, diarizeEnabled, summarizeEnabled, model);
        console.log(`[${clientId}] Finished streaming file.`);
        sendProgress(clientId, 'status', { message: 'Processing complete.' });

        sendProgress(clientId, 'done', { message: 'Transcription process finished.' });

    } catch (error) {
        // Error logging and sending handled within streamFileToDeepgram or here if init fails
        console.error(`[${clientId}] Top-level transcription processing error:`, error);
        // Ensure an error message is sent if not already handled by streamFileToDeepgram's cleanup
        sendProgress(clientId, 'error', { message: `Processing failed: ${error.message || 'Unknown error'}` });
    } finally {
        // Clean up the original uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[${clientId}] Cleaned up original file: ${filePath}`);
        }
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

// Modified Transcription endpoint (Removed chunkSizeMB)
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
  // Removed chunkSizeMB

  console.log(`[${clientId}] Received file: ${originalName}, Path: ${filePath}, Diarize: ${diarizeEnabled}, Summarize: ${summarizeEnabled}, Model: ${model}. Starting async processing.`);
  
  // Pass relevant options to main processing function
  processTranscription(clientId, filePath, originalName, diarizeEnabled, summarizeEnabled, model); 
  
  res.json({ clientId }); 
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
