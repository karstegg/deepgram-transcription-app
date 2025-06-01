import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios'; // Placeholder for actual API service
import * as apiService from '../services/apiService';

// This should ideally come from a constants file or environment variables
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://deepgram-backend-upcbdbi5la-uc.a.run.app';

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
        // Optional: Consider if a cancel request should be sent on unmount
        // axios.post(`${BACKEND_URL}/cancel/${currentClientIdRef.current}`).catch(err => console.error("Error cancelling on unmount:", err));
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
      formData.append('enableSummarization', currentOpts.enableSummarization); // Duplicate for backend compatibility
      formData.append('chunkSizeMB', currentOpts.chunkSizeMB);

      // Step 1: Get a signed URL for GCS upload
      setProgressMessage('Preparing file upload...');
      const { signedUrl: url, gcsObjectName } = await apiService.getSignedUrl(
        selectedFile.name,
        selectedFile.type
      );

      // Step 2: Upload the file to GCS with progress tracking
      setProgressMessage('Uploading file to storage...');
      await apiService.uploadToGcs(
        url,
        selectedFile,
        (progress) => {
          setProgress(Math.floor(progress * 0.9)); // Reserve 10% for transcription
          setProgressMessage(`Uploading: ${progress}%`);
        }
      );

      // Step 3: Start the transcription with the GCS object name
      setProgress(90);
      setProgressMessage('Starting transcription...');
      const response = await axios.post(
        `${BACKEND_URL}/transcribe`,
        {
          gcsObjectName,
          originalName: selectedFile.name,
          model: currentOpts.model,
          diarize: currentOpts.enableDiarization,
          summarize: currentOpts.enableSummarization,
          chunkSizeMB: currentOpts.chunkSizeMB,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const clientId = response.data.clientId;
      currentClientIdRef.current = clientId;
      setProgressMessage('Starting transcription...');

      // TODO: Replace with apiService.getTranscriptionProgress(clientId, eventHandlers)
      eventSourceRef.current = new EventSource(`${BACKEND_URL}/progress/${clientId}`);

      eventSourceRef.current.onopen = () => console.log('Transcription SSE connection opened');

      eventSourceRef.current.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        setProgressMessage(data.message || '');
        if (data.progress !== undefined) setProgress(data.progress);
      });

      eventSourceRef.current.addEventListener('partial_transcript', (event) => {
        const data = JSON.parse(event.data);
        setTranscription(prev => prev + (data.transcript || data.text || ''));
      });
      
      eventSourceRef.current.addEventListener('summary_result', (event) => {
        const data = JSON.parse(event.data);
        setTranscriptionGeneratedSummary(data.summary || data.text || '');
        setProgressMessage("Summary (from transcription) received."); 
        // App.js will decide if/how to use this transcriptionGeneratedSummary state
      });

      eventSourceRef.current.addEventListener('warning', (event) => {
        const data = JSON.parse(event.data);
        console.warn('Transcription warning:', data.message);
        setProgressMessage(`Warning: ${data.message}`);
      });

      eventSourceRef.current.addEventListener('done', () => {
        setProgressMessage('Transcription complete!');
        setProgress(100);
        setIsTranscribing(false);
        closeEventSource();
        currentClientIdRef.current = null;
      });

      eventSourceRef.current.addEventListener('error', (event) => {
        console.error('Transcription SSE Error:', event);
        let msg = 'An error occurred during transcription.';
        if (event.data) try { msg = JSON.parse(event.data).message || msg; } catch (e) { /* use default */ }
        else if (event.target?.readyState === EventSource.CLOSED) msg = 'Connection to server lost.';
        
        setTranscriptionError(msg);
        setProgressMessage('Error occurred.');
        setIsTranscribing(false);
        closeEventSource();
        currentClientIdRef.current = null;
      });

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
      try {
        // TODO: Replace with apiService.cancelTranscription(currentClientIdRef.current)
        await axios.post(`${BACKEND_URL}/cancel/${currentClientIdRef.current}`);
        console.log('Cancellation request sent for client ID:', currentClientIdRef.current);
      } catch (err) {
        console.error('Error sending cancellation request:', err);
        // Avoid setting transcriptionError here, as it might hide the original error.
      }
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
        // If there was a client ID, try to cancel just in case, though SSE is closed
        axios.post(`${BACKEND_URL}/cancel/${currentClientIdRef.current}`).catch(err => console.error("Error cancelling on reset:", err));
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
