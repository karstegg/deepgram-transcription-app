import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startTranscriptionProcess,
  establishSseConnection,
  cancelProcess
} from '../services/apiService';

const useTranscriptionService = (initialHookOptions = {}) => {
  const { defaultModel, defaultChunkSize } = initialHookOptions;

  // Core state for transcription
  const [selectedFile, setSelectedFile] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [transcriptionGeneratedSummary, setTranscriptionGeneratedSummary] = useState(''); // For summary from /transcribe endpoint

  // State related to the transcription process
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');

  // Refs for managing SSE and client ID
  const eventSourceRef = useRef(null);
  const currentClientIdRef = useRef(null);

  // Transcription options state
  const [transcriptionOptions, setTranscriptionOptions] = useState({
    model: defaultModel || 'nova-2-meeting',
    enableDiarization: false,
    enableSummarization: false, // This is for the transcription service's own summary generation
    chunkSizeMB: defaultChunkSize || 5,
    summarizationProvider: 'gemini', // Default summarization provider
  });

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      console.log("Closing transcription EventSource connection.");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // currentClientIdRef is not reset here, might be needed for a cancel call shortly after
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeEventSource();
      if (currentClientIdRef.current) {
        cancelProcess(currentClientIdRef.current)
          .catch(err => console.error("Error cancelling transcription on unmount:", err));
        currentClientIdRef.current = null;
      }
    };
  }, [closeEventSource]);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setTranscription('');
    setTranscriptionGeneratedSummary(''); // Reset this specific summary
    setTranscriptionError('');
    setProgressMessage('');
    setProgress(0);
    setIsTranscribing(false);
    closeEventSource();
    currentClientIdRef.current = null;
  }, [closeEventSource]);
  
  const updateTranscriptionOptions = useCallback((newOptions) => {
    setTranscriptionOptions(prev => ({ ...prev, ...newOptions }));
  }, []);

  const startTranscription = useCallback(async (optionsOverride) => {
    if (!selectedFile) {
      setTranscriptionError('Please select a file first.');
      return;
    }

    const currentOpts = optionsOverride || transcriptionOptions;

    setIsTranscribing(true);
    setTranscription('');
    setTranscriptionGeneratedSummary('');
    setTranscriptionError('');
    setProgressMessage('Preparing transcription...');
    setProgress(0);
    closeEventSource(); // Close any existing connection

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('model', currentOpts.model);
      formData.append('diarize', currentOpts.enableDiarization);
      formData.append('summarize', currentOpts.enableSummarization); // For transcription service's summary
      formData.append('chunkSizeMB', currentOpts.chunkSizeMB);
      formData.append('summarizationProvider', currentOpts.summarizationProvider);

      const responseData = await startTranscriptionProcess(formData);
      currentClientIdRef.current = responseData.clientId;
      setProgressMessage('Transcription initialized. Waiting for progress...');

      const eventHandlers = {
        onOpen: () => console.log('Transcription SSE connection opened via apiService'),
        onStatus: (event) => {
          const data = JSON.parse(event.data);
          setProgressMessage(data.message || '');
          if (data.progress !== undefined) setProgress(data.progress);
        },
        onPartialTranscript: (event) => {
          const data = JSON.parse(event.data);
          setTranscription(prev => prev + (data.transcript || data.text || ''));
        },
        onSummaryResult: (event) => { // Handles summary from transcription service
          const data = JSON.parse(event.data);
          setTranscriptionGeneratedSummary(data.summary || data.text || '');
          setProgressMessage("Summary (from transcription) received.");
        },
        onWarning: (event) => {
          const data = JSON.parse(event.data);
          console.warn('Transcription warning:', data.message);
          setProgressMessage(`Warning: ${data.message}`);
        },
        onDone: () => {
          setProgressMessage('Transcription complete!');
          setProgress(100);
          setIsTranscribing(false);
          closeEventSource(); 
          currentClientIdRef.current = null;
        },
        onErrorSse: (errorEvent) => {
          console.error('Transcription SSE Error via apiService:', errorEvent);
          let msg = 'An error occurred during transcription (SSE).';
          if (errorEvent.target?.readyState === EventSource.CLOSED) {
            msg = 'Connection to server lost during transcription.';
          }
          setTranscriptionError(msg);
          setProgressMessage('Error occurred.');
          setIsTranscribing(false);
          closeEventSource();
          currentClientIdRef.current = null;
        }
      };
      eventSourceRef.current = establishSseConnection(responseData.clientId, eventHandlers);


    } catch (error) {
      console.error('Error starting transcription:', error);
      setTranscriptionError(error.response?.data?.error || error.message || 'Failed to start transcription');
      setProgressMessage('Error occurred.');
      setIsTranscribing(false);
      closeEventSource();
      currentClientIdRef.current = null;
    }
  }, [selectedFile, closeEventSource, transcriptionOptions]);

  const cancelTranscription = useCallback(async () => {
    if (!isTranscribing && !currentClientIdRef.current) {
      console.log("No active transcription process to cancel.");
      // If called when not transcribing, ensure progress message is cleared if it's a pending cancel message
      if (progressMessage === 'Cancelling transcription...') setProgressMessage('');
      return;
    }

    setProgressMessage('Cancelling transcription...');
    
    if (currentClientIdRef.current) {
      await cancelProcess(currentClientIdRef.current);
      // apiService.cancelProcess handles its own logging
    }
    
    closeEventSource();
    setIsTranscribing(false);
    // Don't reset transcription text itself, user might want to copy partial results.
    setProgressMessage('Transcription cancelled.');
    // Clear client ID after attempt, regardless of success
    currentClientIdRef.current = null; 
    // Optionally clear the "Transcription cancelled" message after a delay
    setTimeout(() => {
        if (progressMessage === 'Transcription cancelled.') setProgressMessage('');
    }, 3000);

  }, [isTranscribing, closeEventSource, progressMessage]); // Added progressMessage to dependencies

  // Function to allow explicit reset of transcription state from parent
  const resetTranscriptionState = useCallback(() => {
    setSelectedFile(null);
    setTranscription('');
    setTranscriptionGeneratedSummary('');
    setTranscriptionError('');
    setProgressMessage('');
    setProgress(0);
    setIsTranscribing(false);
    closeEventSource();
    if (currentClientIdRef.current) {
        cancelProcess(currentClientIdRef.current)
            .catch(err => console.error("Error cancelling transcription on reset:", err));
        currentClientIdRef.current = null;
    }
  }, [closeEventSource]);


  return {
    // State
    selectedFile,
    transcription,
    transcriptionGeneratedSummary,
    isTranscribing,
    progress,
    progressMessage,
    transcriptionError,
    transcriptionOptions,

    // Actions
    handleFileSelect,
    startTranscription,
    cancelTranscription,
    updateTranscriptionOptions,
    resetTranscriptionState, // Provide a full reset for this service's state

    // Individual setters for more granular control if needed by App.js (e.g. for clearing errors/messages)
    setSelectedFile, 
    setTranscription,
    setTranscriptionError,
    setProgressMessage,
    setProgress,
    setIsTranscribing
  };
};

export default useTranscriptionService;
