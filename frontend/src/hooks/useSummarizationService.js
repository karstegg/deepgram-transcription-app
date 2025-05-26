import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startSummarizationProcess as apiStartSummarization,
  establishSseConnection,
  cancelProcess
} from '../services/apiService';

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
      console.log("Closing summarization EventSource connection.");
      summarizationEventSourceRef.current.close();
      summarizationEventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeSummarizationEventSource();
      if (summarizationClientIdRef.current) {
        cancelProcess(summarizationClientIdRef.current)
          .catch(err => console.error("Error cancelling summarization on unmount:", err));
        summarizationClientIdRef.current = null;
      }
    };
  }, [closeSummarizationEventSource]);

  const startSummarization = useCallback(async (textToSummarize, options = {}) => {
    if (!textToSummarize || textToSummarize.trim() === "") {
      setSummarizationError('No text available to summarize.');
      setIsSummarizing(false); // Ensure loading state is off
      return;
    }

    setIsSummarizing(true);
    setSummary('');
    setSummarizationError('');
    setSummarizationProgressMessage('Initializing summarization...');
    setSummarizationProgress(0);
    closeSummarizationEventSource();

    try {
      const payload = {
        existingTranscription: textToSummarize,
        // model: options.model || 'default-summary-model', // Example if backend supports options
      };

      const responseData = await apiStartSummarization(textToSummarize, options); // Pass original textToSummarize and options
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
          closeSummarizationEventSource(); 
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
          closeSummarizationEventSource(); 
          summarizationClientIdRef.current = null;
        }
      };
      summarizationEventSourceRef.current = establishSseConnection(responseData.clientId, eventHandlers);


    } catch (error) {
      console.error('Error starting summarization:', error);
      setSummarizationError(error.response?.data?.error || error.message || 'Failed to generate summary.');
      setSummarizationProgressMessage('Error occurred.');
      setIsSummarizing(false);
      closeSummarizationEventSource();
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

    if (summarizationClientIdRef.current) {
      await cancelProcess(summarizationClientIdRef.current);
      // apiService.cancelProcess handles its own logging
    }
    
    closeSummarizationEventSource();
    setIsSummarizing(false);
    setSummarizationProgressMessage('Summarization cancelled.');
    summarizationClientIdRef.current = null;
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
      cancelProcess(summarizationClientIdRef.current)
        .catch(err => console.error("Error cancelling summarization on reset:", err));
      summarizationClientIdRef.current = null;
    }
  }, [closeSummarizationEventSource]);

  return {
    // State
    summary,
    isSummarizing,
    summarizationProgress,
    summarizationProgressMessage,
    summarizationError,

    // Actions
    startSummarization,
    cancelSummarization,
    resetSummarizationState,

    // Individual setters for parent component control
    setSummary,
    setSummarizationError,
    setSummarizationProgressMessage,
    setSummarizationProgress,
    setIsSummarizing,
  };
};

export default useSummarizationService;
