// Direct Deepgram WebSocket streaming service
import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const DEEPGRAM_API_KEY = process.env.REACT_APP_DEEPGRAM_API_KEY;
const FILE_SLICE_CHUNK_SIZE = 8 * 1024; // 8KB chunks
const KEEP_ALIVE_INTERVAL_MS = 5000; // 5 seconds

// Initialize FFmpeg instance (module scope to be persistent)
const ffmpeg = new FFmpeg();

// Helper function for audio conversion
async function convertAudioToMonoMp3(file, setConversionProgressCallback, ffmpegInstance) {
  if (!ffmpegInstance.loaded) {
    console.log('[FFmpeg] Loading core...');
    // Note: Ensure ffmpeg core files are accessible from your public directory
    // or configure paths using ffmpeg.load({ coreURL, wasmURL, workerURL })
    try {
      await ffmpegInstance.load();
      console.log('[FFmpeg] Core loaded.');
    } catch (loadError) {
      console.error('[FFmpeg] Failed to load core:', loadError);
      throw new Error('Failed to initialize audio processing engine. Please ensure FFmpeg core files are accessible and try again.');
    }
  }

  const inputFileName = `input-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const outputFileName = `output-${Date.now()}.mp3`;

  console.log(`[FFmpeg] Writing input file: ${inputFileName} (type: ${file.type}, size: ${file.size})`);
  await ffmpegInstance.writeFile(inputFileName, await fetchFile(file));
  console.log(`[FFmpeg] Input file written. Starting conversion to ${outputFileName}.`);

  ffmpegInstance.off('progress'); 
  ffmpegInstance.on('progress', ({ progress }) => {
    const percentage = Math.round(progress * 100);
    if (setConversionProgressCallback) {
      setConversionProgressCallback(percentage);
    }
  });

  try {
    await ffmpegInstance.exec([
      '-i', inputFileName,
      '-vn',            // No video output
      '-ac', '1',       // 1 audio channel (mono)
      '-ar', '16000',   // Audio sample rate 16kHz (adjust as needed for Deepgram model, e.g., 48000 for Nova-2 general)
      '-b:a', '64k',    // Audio bitrate 64kbps (adjust as needed)
      '-f', 'mp3',      // Output format MP3
      outputFileName
    ]);
    console.log('[FFmpeg] Conversion successful.');
  } catch (conversionError) {
    console.error('[FFmpeg] Conversion error:', conversionError);
    throw new Error('Audio conversion failed. Please check browser console for details.');
  } finally {
    ffmpegInstance.off('progress'); // Clean up progress listener
  }

  console.log('[FFmpeg] Reading converted file data.');
  const data = await ffmpegInstance.readFile(outputFileName);

  console.log('[FFmpeg] Deleting temporary files from FFmpeg FS.');
  try {
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile(outputFileName);
  } catch (deleteError) {
    console.warn('[FFmpeg] Could not delete temporary files:', deleteError);
  }
  
  return new Blob([data.buffer], { type: 'audio/mpeg' });
}


export const useDirectStreamingService = ({ defaultModel = 'nova-2' }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  
  const socketRef = useRef(null);
  // currentPositionRef and totalSizeRef will be local to startStreaming
  const keepAliveIntervalRef = useRef(null);

  const [streamingOptions, setStreamingOptions] = useState({
    model: defaultModel,
    enableDiarization: false,
    enableSummarization: false,
  });

  const updateStreamingOptions = useCallback((updates) => {
    setStreamingOptions(prev => ({ ...prev, ...updates }));
  }, []);

  const startKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
    }
    keepAliveIntervalRef.current = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'KeepAlive' }));
        // console.log('Sent KeepAlive'); // Optional: for debugging
      }
    }, KEEP_ALIVE_INTERVAL_MS); // Send KeepAlive every 5 seconds
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
      // console.log('Stopped KeepAlive'); // Optional: for debugging
    }
  }, []);

  const resetState = useCallback(() => {
    setTranscription('');
    setProgress(0);
    setProgressMessage('');
    setError('');
    setIsStreaming(false);
    // currentPositionRef and totalSizeRef are managed within startStreaming
    stopKeepAlive(); // Stop KeepAlive pings

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, [stopKeepAlive]);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    resetState();
  }, [resetState]);

  const createWebSocketConnection = useCallback((options) => {
    if (!DEEPGRAM_API_KEY) {
      throw new Error('Deepgram API key not found. Please set REACT_APP_DEEPGRAM_API_KEY in your environment.');
    }

    const queryParams = new URLSearchParams({
      model: 'nova-2',
      interim_results: 'true',
    });

    if (options.enableDiarization) {
      queryParams.append('diarize', 'true');
    }

    const wsUrl = `wss://api.deepgram.com/v1/listen?${queryParams.toString()}`;
    
    const socket = new WebSocket(wsUrl, ['token', DEEPGRAM_API_KEY]);

    return socket;
  }, []);

  const startStreaming = useCallback(async () => {
    if (!selectedFile || isStreaming) return;

    setIsStreaming(true);
    setError('');
    setTranscription('');
    setProgress(0);
    // currentPositionRef.current = 0; // This ref was removed, currentPosition is local to onopen
    // totalSizeRef is managed locally within startStreaming's scope after file selection

    try {
      let audioToStreamBlob;
      try {
        setProgressMessage('Preparing audio...');
        console.log('[Streaming] Starting audio preparation...');
        const fileType = selectedFile.type;
        const fileName = selectedFile.name.toLowerCase();

        if (fileType === 'audio/mpeg' || fileType === 'audio/mp3' || (fileName.endsWith('.mp3') && (fileType === '' || fileType === 'application/octet-stream'))) {
          console.log(`[Streaming] Input file is MP3 (${fileType}, ${fileName}). Skipping conversion.`);
          audioToStreamBlob = selectedFile;
          setConversionProgress(100); // Indicate no conversion needed / instant completion
        } else if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
          setProgressMessage('Converting audio (this may take a moment)...');
          console.log(`[Streaming] Input file type: ${fileType}. Needs conversion to mono MP3...`);
          audioToStreamBlob = await convertAudioToMonoMp3(selectedFile, setConversionProgress, ffmpeg);
          console.log(`[Streaming] Conversion complete. Converted MP3 size: ${audioToStreamBlob.size}`);
          setConversionProgress(100); // Mark conversion as complete
        } else {
          console.error(`[Streaming] Unsupported file type: ${fileType}`);
          throw new Error(`Unsupported file type: ${fileType}. Please select an audio or video file.`);
        }

        if (audioToStreamBlob.size === 0) {
          throw new Error('Audio data is empty after preparation. Cannot stream.');
        }

      } catch (prepError) {
        console.error('[Streaming] Audio preparation failed:', prepError);
        setError(prepError.message || 'Failed to prepare audio.');
        setIsStreaming(false);
        setProgressMessage('');
        setConversionProgress(0); // Reset on error
        return;
      }

      setProgressMessage('Connecting to Deepgram...');
      
      const socket = createWebSocketConnection(streamingOptions);
      socketRef.current = socket;

      socket.onopen = async () => {
        setProgressMessage('Connected. Starting transcription...');
        startKeepAlive(); // Start sending KeepAlive pings

        const totalSize = audioToStreamBlob.size; // Use size of the (potentially) converted blob
        let currentPosition = 0;

        try {
          console.log(`[Streaming] Starting file send loop. Total size: ${totalSize}`);
          // Removed HIGH_WATER_MARK logic for aggressive backpressure during send loop

          while (currentPosition < totalSize) {
            // Removed explicit backpressure wait loop here to allow more interleaved processing

            if (socket.readyState !== WebSocket.OPEN) {
              console.warn('[Streaming] WebSocket connection closed or not open. Stopping file stream.');
              return; // Exit if socket is not open
            }

            const endPosition = Math.min(currentPosition + FILE_SLICE_CHUNK_SIZE, totalSize);
            const fileChunkBlob = audioToStreamBlob.slice(currentPosition, endPosition); // Slice from (potentially) converted blob
            
            const chunkArrayBuffer = await fileChunkBlob.arrayBuffer();
            // console.log(`[Streaming] Prepared chunk: size=${chunkArrayBuffer.byteLength}, from offset ${currentPosition} to ${endPosition}`); // Reduced verbosity

            if (socket.readyState === WebSocket.OPEN) {
              // console.log(`[Streaming] Attempting to send chunk for offset ${currentPosition}...`); // Reduced verbosity
              socket.send(chunkArrayBuffer);
              currentPosition = endPosition;
              const newProgress = Math.round((currentPosition / totalSize) * 100);
              setProgress(newProgress);

              // Yield to allow other operations, like processing incoming messages
              // A small delay (e.g., 0-10ms) helps ensure onmessage events can be processed.
              await new Promise(resolve => setTimeout(resolve, 10)); 
            } else {
              console.warn('[Streaming] WebSocket connection closed before chunk could be sent. Stopping file stream.');
              return; // Exit if socket closed during chunk preparation
            }
          }

          // Wait for the buffer to drain before sending CloseStream
          while (socket.bufferedAmount > 0) {
            if (socket.readyState !== WebSocket.OPEN) {
              console.warn('[Streaming] WebSocket closed while waiting for final buffer drain. Stopping.');
              return;
            }
            console.log(`[Streaming] Waiting for final buffer drain (${socket.bufferedAmount} bytes). Pausing for 100ms...`);
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (socket.readyState === WebSocket.OPEN) {
            console.log(`[WebSocket] Preparing to send CloseStream. Final buffered amount: ${socket.bufferedAmount} bytes`);
            socket.send(JSON.stringify({ type: 'CloseStream' }));
            console.log('[WebSocket] All file chunks sent. CloseStream message dispatched.');
            // KeepAlive continues, do not call stopKeepAlive() here.
            setProgressMessage('All audio sent. Waiting for final transcription...'); // Update progress message
          }
        } catch (error) {
          console.error('[Streaming] Error during file chunk processing or sending:', error);
          setError(`Error streaming file: ${error.message}`);
          // isStreaming and KeepAlive will be handled by onerror or onclose for the socket
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(); // Attempt to close the socket if an error occurred in the loop
          }
        }
      };

      socket.onmessage = (event) => {
        const response = JSON.parse(event.data);
        console.log('[WebSocket] Deepgram message received:', JSON.stringify(response)); // Log entire response

        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          
          if (transcript && transcript.trim()) {
            // Log details of the result
            console.log(`[WebSocket] Result: is_final=${response.is_final}, speech_final=${response.speech_final}, transcript_length=${transcript?.length}`);
            if (response.is_final) {
              // Final result - append to transcription
              setTranscription(prev => prev + transcript + ' ');
            }
            // Note: We could also show interim results in real-time if desired
          }
        } else if (response.type === 'Metadata') {
          setProgressMessage('Processing audio...');
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error occurred');
        setIsStreaming(false);
      };

      socket.onclose = (event) => {
        console.log(`[WebSocket] Connection closed. Code: ${event.code}, Reason: "${event.reason}", WasClean: ${event.wasClean}`); // Detailed close log
        stopKeepAlive(); // Crucial: Stop KeepAlive pings now that the socket is closed.
        setIsStreaming(false);
        if (event.code === 1000 && transcription.trim() !== '') {
          setProgressMessage('Transcription complete');
        } else if (event.code === 1000 && transcription.trim() === '') {
          setProgressMessage('Transcription complete (no speech detected or empty result)');
        } else {
          setProgressMessage(`Transcription failed. Error: ${event.code} - ${event.reason || 'Connection closed unexpectedly.'}`);
          // Optionally, set an error state if not already set by onerror
          if (!error && event.code !== 1000) {
            setError(`Connection closed: ${event.code} ${event.reason}`);
          }
        }
      };

    } catch (err) {
      console.error('Streaming error:', err);
      setError(err.message || 'Failed to start streaming');
      setIsStreaming(false);
    }
  }, [selectedFile, streamingOptions, createWebSocketConnection, isStreaming, startKeepAlive, stopKeepAlive, error, transcription, setError, setIsStreaming, setProgress, setProgressMessage, setTranscription]);

  const cancelStreaming = useCallback(() => {
    stopKeepAlive(); // Stop KeepAlive pings
    // sendChunkTimeoutRef and fileReaderRef are removed

    if (socketRef.current) {
      socketRef.current.close(); // This will trigger socket.onclose which handles setIsStreaming(false) and stopKeepAlive()
      socketRef.current = null;
    }
    // If not streaming, but need to reset UI elements:
    if (!isStreaming) { 
        setProgressMessage('Streaming cancelled');
    }
    setIsStreaming(false); // Explicitly set, though onclose should also do it.
  }, [stopKeepAlive, isStreaming]); // Added isStreaming to dependency array

  const setTranscriptionError = useCallback((errorMessage) => {
    setError(errorMessage);
  }, []);

  return {
    // State
    selectedFile,
    isStreaming,
    transcription,
    progress,
    progressMessage,
    error: error,
    streamingOptions,
    conversionProgress,
    
    // Actions
    handleFileSelect,
    startStreaming,
    cancelStreaming,
    resetState,
    updateStreamingOptions,
    setTranscriptionError,
    
    // For compatibility with existing components
    transcriptionGeneratedSummary: '', // Not implemented in direct streaming
    transcriptionError: error,
    isTranscribing: isStreaming,
  };
};

export default useDirectStreamingService;