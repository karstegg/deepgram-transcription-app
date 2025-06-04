// Direct Deepgram WebSocket streaming service
import { useState, useCallback, useRef } from 'react';

const DEEPGRAM_API_KEY = process.env.REACT_APP_DEEPGRAM_API_KEY;
const CHUNK_SIZE = 8192; // 8KB chunks for WebSocket streaming

export const useDirectStreamingService = ({ defaultModel = 'nova-2' }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  
  const socketRef = useRef(null);
  const fileReaderRef = useRef(null);
  const currentPositionRef = useRef(0);
  const totalSizeRef = useRef(0);

  const [streamingOptions, setStreamingOptions] = useState({
    model: defaultModel,
    enableDiarization: false,
    enableSummarization: false,
  });

  const updateStreamingOptions = useCallback((updates) => {
    setStreamingOptions(prev => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    setTranscription('');
    setProgress(0);
    setProgressMessage('');
    setError('');
    setIsStreaming(false);
    currentPositionRef.current = 0;
    totalSizeRef.current = 0;
    
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    resetState();
  }, [resetState]);

  const createWebSocketConnection = useCallback((options) => {
    if (!DEEPGRAM_API_KEY) {
      throw new Error('Deepgram API key not found. Please set REACT_APP_DEEPGRAM_API_KEY in your environment.');
    }

    const queryParams = new URLSearchParams({
      model: options.model,
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300', // 300ms silence detection
    });

    if (options.enableDiarization) {
      queryParams.append('diarize', 'true');
    }

    const wsUrl = `wss://api.deepgram.com/v1/listen?${queryParams.toString()}`;
    
    const socket = new WebSocket(wsUrl, [], {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      }
    });

    return socket;
  }, []);

  const streamAudioFile = useCallback(async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    if (!DEEPGRAM_API_KEY) {
      setError('Deepgram API key not configured');
      return;
    }

    setIsStreaming(true);
    setError('');
    setTranscription('');
    setProgress(0);
    currentPositionRef.current = 0;
    totalSizeRef.current = selectedFile.size;

    try {
      setProgressMessage('Connecting to Deepgram...');
      
      const socket = createWebSocketConnection(streamingOptions);
      socketRef.current = socket;

      socket.onopen = () => {
        setProgressMessage('Connected. Starting transcription...');
        startFileStreaming();
      };

      socket.onmessage = (event) => {
        const response = JSON.parse(event.data);
        
        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          
          if (transcript && transcript.trim()) {
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
        if (event.code !== 1000) {
          console.error('WebSocket closed unexpectedly:', event.code, event.reason);
          if (isStreaming) {
            setError('Connection closed unexpectedly');
          }
        }
        setIsStreaming(false);
        setProgressMessage('Transcription complete');
      };

    } catch (err) {
      console.error('Streaming error:', err);
      setError(err.message || 'Failed to start streaming');
      setIsStreaming(false);
    }
  }, [selectedFile, streamingOptions, createWebSocketConnection, isStreaming]);

  const startFileStreaming = useCallback(() => {
    if (!selectedFile || !socketRef.current) return;

    const reader = new FileReader();
    fileReaderRef.current = reader;

    reader.onload = (event) => {
      const audioData = event.target.result;
      sendAudioChunks(audioData);
    };

    reader.onerror = () => {
      setError('Failed to read audio file');
      setIsStreaming(false);
    };

    // Read file as ArrayBuffer for binary streaming
    reader.readAsArrayBuffer(selectedFile);
  }, [selectedFile]);

  const sendAudioChunks = useCallback((audioBuffer) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

    const totalBytes = audioBuffer.byteLength;
    let offset = 0;

    const sendChunk = () => {
      if (offset >= totalBytes) {
        // Finished sending all data
        setProgress(100);
        setProgressMessage('Processing final results...');
        
        // Send close frame to indicate end of audio
        socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        return;
      }

      const chunkSize = Math.min(CHUNK_SIZE, totalBytes - offset);
      const chunk = audioBuffer.slice(offset, offset + chunkSize);
      
      socketRef.current.send(chunk);
      
      offset += chunkSize;
      const progressPercent = Math.round((offset / totalBytes) * 100);
      setProgress(progressPercent);
      setProgressMessage(`Streaming audio: ${progressPercent}%`);

      // Send next chunk after small delay to avoid overwhelming the connection
      setTimeout(sendChunk, 10);
    };

    sendChunk();
  }, []);

  const cancelStreaming = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    
    if (fileReaderRef.current) {
      fileReaderRef.current.abort();
      fileReaderRef.current = null;
    }

    setIsStreaming(false);
    setProgressMessage('Streaming cancelled');
  }, []);

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
    
    // Actions
    handleFileSelect,
    startStreaming: streamAudioFile,
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
