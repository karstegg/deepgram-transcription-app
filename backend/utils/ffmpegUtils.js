import config from '../config.js';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';

// Moved from server.js
// FFMpeg Chunking Function
const splitMediaIntoAudioChunks = (clientId, filePath, targetChunkSizeMB = config.DEFAULT_CHUNK_SIZE_MB, sendProgress, activeProcesses, uploadsDir) => {
  return new Promise(async (resolve, reject) => {
    const targetChunkSizeBytes = targetChunkSizeMB * 1024 * 1024;
    let segmentDurationSec = 600; // Default value

    // Section: FFprobe Analysis for Optimal Chunking
    try {
        sendProgress(clientId, 'status', { message: 'Analyzing media file for optimal chunking...' });
        const ffprobePath = config.FFPROBE_PATH;
        const probeCommand = `"${ffprobePath}" -v error -show_format -show_streams -of json "${filePath}"`;
        
        console.log(`[${clientId}] Running FFprobe analysis: ${probeCommand.replace(filePath, '<filePath>')}`);
        const { stdout: probeJson } = await new Promise((resolveCmd, rejectCmd) => {
            const ffprobeProcess = exec(probeCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) { 
                    console.error(`[${clientId}] FFprobe analysis failed. CMD: ${probeCommand.replace(filePath, '<filePath>')}. Error: ${error.message}. Stderr: ${stderr}`);
                    return rejectCmd(new Error(`FFprobe analysis failed: ${stderr || error.message}`)); 
                }
                return resolveCmd({ stdout });
            });
        });
        
        const probeData = JSON.parse(probeJson);
        const format = probeData.format;

        if (format && typeof format.duration === 'string' && typeof format.size === 'string') {
            const totalDurationSec = parseFloat(format.duration);
            const totalSizeBytes = parseInt(format.size, 10);

            if (totalDurationSec > 0 && totalSizeBytes > 0) {
                const avgBitrateBps = totalSizeBytes / totalDurationSec;
                const expectedChunks = Math.ceil(totalSizeBytes / targetChunkSizeBytes);
                segmentDurationSec = Math.ceil(totalDurationSec / expectedChunks);
                segmentDurationSec = Math.max(10, Math.min(segmentDurationSec, 900)); // Clamp duration
                console.log(`[${clientId}] FFprobe analysis complete. File: ${(totalSizeBytes/(1024*1024)).toFixed(2)}MB, Duration: ${totalDurationSec.toFixed(2)}s. Target chunk: ${targetChunkSizeMB}MB. Calculated segment duration: ${segmentDurationSec}s.`);
            } else { 
                console.warn(`[${clientId}] FFprobe: Invalid duration ('${format.duration}') or size ('${format.size}'). Using default segment duration: ${segmentDurationSec}s.`);
            }
        } else { 
            console.warn(`[${clientId}] FFprobe: Could not reliably get duration/size. Format data: ${JSON.stringify(format)}. Using default segment duration: ${segmentDurationSec}s.`);
        }
        sendProgress(clientId, 'status', { message: `Splitting media into ~${segmentDurationSec}s audio chunks...` });
    } catch (probeError) {
        console.error(`[${clientId}] Error during FFprobe analysis or JSON parsing: ${probeError.message}. Proceeding with default chunk duration.`);
        sendProgress(clientId, 'warning', { message: `Media analysis failed: ${probeError.message}. Using default chunking.` });
        // segmentDurationSec remains at its default value (600s)
    }

    // Section: FFmpeg Execution for Chunking
    const outputPattern = path.join(uploadsDir, `${clientId}_chunk_%03d.mp3`);
    const ffmpegCommand = `"${config.FFMPEG_PATH}" -i "${filePath}" -f segment -segment_time ${segmentDurationSec} -vn -acodec libmp3lame -ar 16000 -ac 1 -reset_timestamps 1 "${outputPattern}"`;
    
    console.log(`[${clientId}] Executing FFmpeg: ${ffmpegCommand.replace(filePath, '<filePath>')}`);
    const ffmpegProcess = exec(ffmpegCommand);
    
    // Manage active FFmpeg process
    if (!activeProcesses[clientId]) {
        activeProcesses[clientId] = [];
    }
    activeProcesses[clientId].push(ffmpegProcess);
    console.log(`[${clientId}] FFmpeg process PID ${ffmpegProcess.pid} started and added to active list.`);

    let stderrData = ''; 
    ffmpegProcess.stderr.on('data', (data) => { stderrData += data.toString(); });
    
    ffmpegProcess.on('close', (code) => {
        const processPid = ffmpegProcess.pid; // Store PID for logging as process object might be unavailable later
        if (stderrData.trim().length > 0) {
            if (code !== 0) {
                console.error(`[${clientId}] FFmpeg process PID ${processPid} exited with code ${code}. Stderr:\n${stderrData}`);
            } else {
                // Log non-error stderr as info, could contain warnings.
                console.log(`[${clientId}] FFmpeg process PID ${processPid} completed with code ${code}. Stderr output (may include warnings/info):\n${stderrData}`);
            }
        } else if (code !== 0) {
             console.error(`[${clientId}] FFmpeg process PID ${processPid} exited with code ${code} and no stderr output.`);
        } else {
            console.log(`[${clientId}] FFmpeg process PID ${processPid} completed successfully with code ${code}.`);
        }
        
        // Remove from active list
        if (activeProcesses[clientId]) {
            const index = activeProcesses[clientId].indexOf(ffmpegProcess);
            if (index !== -1) activeProcesses[clientId].splice(index, 1);
            if (activeProcesses[clientId].length === 0) {
                delete activeProcesses[clientId];
                console.log(`[${clientId}] All FFmpeg processes for this client have completed.`);
            }
        }
        
        if (code !== 0 && code !== null) { 
            return reject(new Error(`FFmpeg process PID ${processPid} exited with error code ${code}. Consult stderr for details.`)); 
        }
        
        const chunks = fs.readdirSync(uploadsDir)
            .filter(f => f.startsWith(`${clientId}_chunk_`) && f.endsWith('.mp3'))
            .map(f => path.join(uploadsDir, f))
            .sort();
            
        console.log(`[${clientId}] FFmpeg chunking finished. Found ${chunks.length} MP3 audio chunk(s).`);
        sendProgress(clientId, 'status', { message: `Audio chunking complete, found ${chunks.length} chunk(s).` });
        
        if (chunks.length === 0 && code === 0) { 
             console.warn(`[${clientId}] FFmpeg (PID ${processPid}) created no audio chunks despite exiting cleanly. This might indicate a very short file or an input unsuitable for audio extraction.`);
        }
        resolve(chunks); 
    });
    
    ffmpegProcess.on('error', (err) => { 
        const processPid = ffmpegProcess.pid;
        if (activeProcesses[clientId]) { 
            const index = activeProcesses[clientId].indexOf(ffmpegProcess);
            if (index !== -1) activeProcesses[clientId].splice(index, 1);
            if (activeProcesses[clientId].length === 0) {
                delete activeProcesses[clientId];
                console.log(`[${clientId}] All FFmpeg processes for this client removed after error on PID ${processPid}.`);
            }
        }
        if (err.signal === 'SIGTERM') { 
            console.log(`[${clientId}] FFmpeg process PID ${processPid} was terminated (SIGTERM), likely due to cancellation.`);
            return reject(new Error('FFmpeg process terminated due to cancellation request.')); 
        }
        console.error(`[${clientId}] Failed to start or execute FFmpeg command (PID ${processPid}): ${err.message}`);
        reject(new Error(`FFmpeg execution failed: ${err.message}`));
    });
  });
};

// Function for getting media duration
const getMediaDuration = (filePath, clientId, sendProgress) => {
    return new Promise((resolve, reject) => {
        const logClientId = clientId || '[ffmpegUtils]'; // Generic prefix if no clientId
        if (sendProgress && clientId) {
            sendProgress(clientId, 'status', { message: 'Fetching media duration...' });
        }
        const ffprobePath = config.FFPROBE_PATH;
        const durationCommand = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        
        console.log(`[${logClientId}] Getting media duration: ${durationCommand.replace(filePath, '<filePath>')}`);
        exec(durationCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[${logClientId}] Failed to get media duration via FFprobe. CMD: ${durationCommand.replace(filePath, '<filePath>')}. Error: ${error.message}. Stderr: ${stderr}`);
                return reject(new Error(`FFprobe failed to get media duration: ${stderr || error.message}`));
            }
            try {
                const duration = parseFloat(stdout);
                if (isNaN(duration) || duration < 0) { // Added check for negative duration
                    console.warn(`[${logClientId}] FFprobe returned invalid duration: '${stdout}'.`);
                    return reject(new Error(`FFprobe returned invalid (NaN or negative) duration: ${stdout}`));
                }
                if (sendProgress && clientId) {
                    sendProgress(clientId, 'status', { message: `Media duration: ~${Math.round(duration)}s` });
                }
                console.log(`[${logClientId}] Media duration successfully retrieved: ${duration.toFixed(2)} seconds.`);
                resolve(duration);
            } catch (parseError) {
                console.error(`[${logClientId}] Error parsing FFprobe duration output ('${stdout}'): ${parseError.message}`);
                reject(new Error(`Error parsing FFprobe duration output: ${parseError.message}`));
            }
        });
    });
};

export { splitMediaIntoAudioChunks, getMediaDuration };
