import axios from 'axios';

const REACT_APP_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://deepgram-backend-upcbdbi5la-uc.a.run.app';
const API_BASE_URL = REACT_APP_BACKEND_URL;

/**
 * Starts the transcription process.
 * @param {FormData} formData The form data containing the audio file and options.
 * @returns {Promise<object>} The response data, expected to contain clientId.
 * @throws {Error} If the request fails.
 */
export const startTranscriptionProcess = async (formData) => {
  // Options like model, diarize, summarize, chunkSizeMB are already expected
  // to be in formData by the backend, as per original App.js and hook logic.
  try {
    const response = await axios.post(`${API_BASE_URL}/transcribe`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data; 
  } catch (error) {
    console.error('API Error in startTranscriptionProcess:', error.response?.data || error.message);
    throw error.response?.data || new Error('Failed to start transcription process via API');
  }
};

/**
 * Starts the summarization process.
 * @param {string} textToSummarize The text to be summarized.
 * @param {object} options Additional options for summarization (if any).
 * @returns {Promise<object>} The response data, expected to contain clientId.
 * @throws {Error} If the request fails.
 */
export const startSummarizationProcess = async (textToSummarize, options = {}) => {
  try {
    const payload = {
      existingTranscription: textToSummarize,
      ...options, 
    };
    const response = await axios.post(`${API_BASE_URL}/summarize`, payload);
    return response.data;
  } catch (error) {
    console.error('API Error in startSummarizationProcess:', error.response?.data || error.message);
    throw error.response?.data || new Error('Failed to start summarization process via API');
  }
};

/**
 * Establishes an SSE connection for progress updates.
 * @param {string} clientId The client ID for the SSE connection.
 * @param {object} eventHandlers An object containing specific event handlers.
 *   Expected handlers: onOpen, onStatus, onPartialTranscript, onSummaryResult, onWarning, onDone, onErrorSse.
 * @returns {EventSource} The EventSource instance.
 * @throws {Error} If clientId is not provided.
 */
export const establishSseConnection = (clientId, eventHandlers) => {
  if (!clientId) {
    throw new Error('Client ID is required to establish SSE connection.');
  }
  
  const eventSource = new EventSource(`${API_BASE_URL}/progress/${clientId}`);

  if (eventHandlers.onOpen) {
    eventSource.onopen = eventHandlers.onOpen;
  } else {
    eventSource.onopen = () => console.log(`SSE connection opened for client ID: ${clientId}`);
  }

  if (eventHandlers.onStatus) {
    eventSource.addEventListener('status', eventHandlers.onStatus);
  }
  if (eventHandlers.onPartialTranscript) {
    eventSource.addEventListener('partial_transcript', eventHandlers.onPartialTranscript);
  }
  // 'summary_result' can be emitted by both /transcribe (if summarize=true) and /summarize
  if (eventHandlers.onSummaryResult) { 
    eventSource.addEventListener('summary_result', eventHandlers.onSummaryResult);
  }
  if (eventHandlers.onWarning) {
    eventSource.addEventListener('warning', eventHandlers.onWarning);
  }
  if (eventHandlers.onDone) {
    eventSource.addEventListener('done', eventHandlers.onDone);
  }
  
  eventSource.onerror = (errorEvent) => {
    console.error(`SSE Error for client ID ${clientId}:`, errorEvent);
    if (eventHandlers.onErrorSse) {
      eventHandlers.onErrorSse(errorEvent);
    }
    // EventSource attempts to reconnect automatically on some errors.
    // If the connection is permanently closed by the server, 'done' or a specific error
    // should have been sent. If not, this generic error might indicate a network issue.
  };

  return eventSource;
};

/**
 * Sends a cancellation request to the backend.
 * @param {string} clientId The client ID of the process to cancel.
 * @returns {Promise<object|void>} Response data or void if no specific response.
 */
export const cancelProcess = async (clientId) => {
  if (!clientId) {
    console.warn('No client ID provided for cancellation.');
    return Promise.resolve(); // Return a resolved promise
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/cancel/${clientId}`);
    console.log(`Cancellation request for Client ID ${clientId} successful:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`API Error cancelling process for Client ID ${clientId}:`, error.response || error.message);
    // Do not throw, cancellation is best-effort. The process might have already finished.
    return Promise.resolve(); // Still return a resolved promise
  }
};

const apiService = {
  startTranscriptionProcess,
  startSummarizationProcess,
  establishSseConnection,
  cancelProcess,
  API_BASE_URL,
};

export default apiService;
overwrite_file_with_block
frontend/src/hooks/useTranscriptionService.js
import { useState, useEffect, useRef, useCallback } from 'react';
import apiService from '../services/apiService'; // Corrected path

const useTranscriptionService = (initialHookOptions = {}) => {
  const { defaultModel, defaultChunkSize } = initialHookOptions;

  const [selectedFile, setSelectedFile] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [transcriptionGeneratedSummary, setTranscriptionGeneratedSummary] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');

  const eventSourceRef = useRef(null);
  const currentClientIdRef = useRef(null);

  const [transcriptionOptions, setTranscriptionOptions] = useState({
    model: defaultModel || 'nova-2-meeting',
    enableDiarization: false,
    enableSummarization: false,
    chunkSizeMB: defaultChunkSize || 5,
  });

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      console.log("Closing transcription EventSource connection via service.");
      eventSourceRef.current.close(); // Direct close method on EventSource instance
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeEventSource();
      if (currentClientIdRef.current) {
        // apiService.cancelProcess(currentClientIdRef.current, 'transcription'); // Optional: cancel on unmount
        currentClientIdRef.current = null;
      }
    };
  }, [closeEventSource]);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setTranscription('');
    setTranscriptionGeneratedSummary('');
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
    closeEventSource();

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('model', currentOpts.model);
      formData.append('diarize', currentOpts.enableDiarization);
      formData.append('summarize', currentOpts.enableSummarization);
      formData.append('enableSummarization', currentOpts.enableSummarization);
      formData.append('chunkSizeMB', currentOpts.chunkSizeMB);

      const responseData = await apiService.startTranscriptionProcess(formData);
      currentClientIdRef.current = responseData.clientId;
      setProgressMessage('Starting transcription...');

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
          closeEventSource(); // Should be handled by establishSseConnection or here
          currentClientIdRef.current = null;
        },
        onErrorSse: (errorEvent) => {
          console.error('Transcription SSE Error via apiService:', errorEvent);
          let msg = 'An error occurred during transcription (SSE).';
          // EventSource errors don't typically have detailed data like axios errors
          if (errorEvent.target?.readyState === EventSource.CLOSED) {
            msg = 'Connection to server lost during transcription.';
          }
          setTranscriptionError(msg);
          setProgressMessage('Error occurred.');
          setIsTranscribing(false);
          closeEventSource(); // Ensure it's closed on error
          currentClientIdRef.current = null;
        }
      };
      eventSourceRef.current = apiService.establishSseConnection(responseData.clientId, eventHandlers);

    } catch (error) {
      console.error('Hook: Error starting transcription:', error);
      setTranscriptionError(error.message || 'Failed to start transcription');
      setProgressMessage('Error occurred.');
      setIsTranscribing(false);
      // No need to call closeEventSource() here as it wouldn't have been opened on API error
      currentClientIdRef.current = null;
    }
  }, [selectedFile, closeEventSource, transcriptionOptions]);

  const cancelTranscription = useCallback(async () => {
    if (!isTranscribing && !currentClientIdRef.current) {
      console.log("No active transcription process to cancel.");
      if (progressMessage === 'Cancelling transcription...') setProgressMessage('');
      return;
    }
    setProgressMessage('Cancelling transcription...');
    closeEventSource(); // Close SSE connection immediately

    if (currentClientIdRef.current) {
      await apiService.cancelProcess(currentClientIdRef.current); // Let API service handle logging
      currentClientIdRef.current = null;
    }
    
    setIsTranscribing(false);
    setProgressMessage('Transcription cancelled.');
    setTimeout(() => {
      if (progressMessage === 'Transcription cancelled.') setProgressMessage('');
    }, 3000);
  }, [isTranscribing, closeEventSource, progressMessage]);

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
      apiService.cancelProcess(currentClientIdRef.current);
      currentClientIdRef.current = null;
    }
  }, [closeEventSource]);

  return {
    selectedFile, transcription, transcriptionGeneratedSummary, isTranscribing,
    progress, progressMessage, transcriptionError, transcriptionOptions,
    handleFileSelect, startTranscription, cancelTranscription,
    updateTranscriptionOptions, resetTranscriptionState,
    setSelectedFile, setTranscription, setTranscriptionError,
    setProgressMessage, setProgress, setIsTranscribing,
  };
};

export default useTranscriptionService;
overwrite_file_with_block
frontend/src/hooks/useSummarizationService.js
import { useState, useEffect, useRef, useCallback } from 'react';
import apiService from '../services/apiService'; // Corrected path

const useSummarizationService = () => {
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizationProgress, setSummarizationProgress] = useState(0);
  const [summarizationProgressMessage, setSummarizationProgressMessage] = useState('');
  const [summarizationError, setSummarizationError] = useState('');

  const summarizationEventSourceRef = useRef(null);
  const summarizationClientIdRef = useRef(null);

  const closeSummarizationEventSource = useCallback(() => {
    if (summarizationEventSourceRef.current) {
      console.log("Closing summarization EventSource connection via service.");
      summarizationEventSourceRef.current.close(); // Direct close on EventSource instance
      summarizationEventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeSummarizationEventSource();
      if (summarizationClientIdRef.current) {
        // apiService.cancelProcess(summarizationClientIdRef.current, 'summarization'); // Optional
        summarizationClientIdRef.current = null;
      }
    };
  }, [closeSummarizationEventSource]);

  const startSummarization = useCallback(async (textToSummarize, options = {}) => {
    if (!textToSummarize || textToSummarize.trim() === "") {
      setSummarizationError('No text available to summarize.');
      setIsSummarizing(false);
      return;
    }

    setIsSummarizing(true);
    setSummary('');
    setSummarizationError('');
    setSummarizationProgressMessage('Initializing summarization...');
    setSummarizationProgress(0);
    closeSummarizationEventSource();

    try {
      // Options for summarization can be passed in the 'options' object
      const responseData = await apiService.startSummarizationProcess(textToSummarize, options);
      summarizationClientIdRef.current = responseData.clientId;
      setSummarizationProgressMessage('Generating summary...');

      const eventHandlers = {
        onOpen: () => console.log('Summarization SSE connection opened via apiService'),
        onStatus: (event) => {
          const data = JSON.parse(event.data);
          setSummarizationProgressMessage(data.message || '');
          if (data.progress !== undefined) setSummarizationProgress(data.progress);
        },
        onSummaryResult: (event) => {
          const data = JSON.parse(event.data);
          setSummary(data.summary || data.text || '');
        },
        onWarning: (event) => {
          const data = JSON.parse(event.data);
          console.warn('Summarization warning:', data.message);
          setSummarizationProgressMessage(`Warning: ${data.message}`);
        },
        onDone: () => {
          setSummarizationProgressMessage('Summary complete!');
          setSummarizationProgress(100);
          setIsSummarizing(false);
          closeSummarizationEventSource(); // Should be handled by establishSseConnection or here
          summarizationClientIdRef.current = null;
        },
        onErrorSse: (errorEvent) => {
          console.error('Summarization SSE Error via apiService:', errorEvent);
          let msg = 'An error occurred during summarization (SSE).';
          if (errorEvent.target?.readyState === EventSource.CLOSED) {
            msg = 'Connection to server lost during summarization.';
          }
          setSummarizationError(msg);
          setSummarizationProgressMessage('Error occurred.');
          setIsSummarizing(false);
          closeSummarizationEventSource(); // Ensure it's closed on error
          summarizationClientIdRef.current = null;
        }
      };
      summarizationEventSourceRef.current = apiService.establishSseConnection(responseData.clientId, eventHandlers);

    } catch (error) {
      console.error('Hook: Error starting summarization:', error);
      setSummarizationError(error.message || 'Failed to generate summary.');
      setSummarizationProgressMessage('Error occurred.');
      setIsSummarizing(false);
      summarizationClientIdRef.current = null;
    }
  }, [closeSummarizationEventSource]);

  const cancelSummarization = useCallback(async () => {
    if (!isSummarizing && !summarizationClientIdRef.current) {
      console.log("No active summarization to cancel.");
       if(summarizationProgressMessage === 'Cancelling summarization...') setSummarizationProgressMessage('');
      return;
    }
    setSummarizationProgressMessage('Cancelling summarization...');
    closeSummarizationEventSource(); // Close SSE connection immediately

    if (summarizationClientIdRef.current) {
      await apiService.cancelProcess(summarizationClientIdRef.current);
      summarizationClientIdRef.current = null;
    }

    setIsSummarizing(false);
    setSummarizationProgressMessage('Summarization cancelled.');
    setTimeout(() => {
      if(summarizationProgressMessage === 'Summarization cancelled.') setSummarizationProgressMessage('');
    }, 3000);
  }, [isSummarizing, closeSummarizationEventSource, summarizationProgressMessage]);

  const resetSummarizationState = useCallback(() => {
    setSummary('');
    setSummarizationError('');
    setSummarizationProgressMessage('');
    setSummarizationProgress(0);
    setIsSummarizing(false);
    closeSummarizationEventSource();
    if (summarizationClientIdRef.current) {
      apiService.cancelProcess(summarizationClientIdRef.current);
      summarizationClientIdRef.current = null;
    }
  }, [closeSummarizationEventSource]);

  return {
    summary, isSummarizing, summarizationProgress, summarizationProgressMessage, summarizationError,
    startSummarization, cancelSummarization, resetSummarizationState,
    setSummary, setSummarizationError, setSummarizationProgressMessage,
    setSummarizationProgress, setIsSummarizing,
  };
};

export default useSummarizationService;
