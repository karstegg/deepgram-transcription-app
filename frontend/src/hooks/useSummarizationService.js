import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios'; // Placeholder for actual API service

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://deepgram-backend-upcbdbi5la-uc.a.run.app';

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
        // Optional: Consider cancelling on unmount
        // axios.post(`${BACKEND_URL}/cancel/${summarizationClientIdRef.current}`).catch(err => console.error("Error cancelling summarization on unmount:", err));
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

      // TODO: Replace with apiService.summarize(payload)
      const response = await axios.post(`${BACKEND_URL}/summarize`, payload);
      const clientId = response.data.clientId;
      summarizationClientIdRef.current = clientId;
      setSummarizationProgressMessage('Generating summary...');

      // TODO: Replace with apiService.getSummarizationProgress(clientId, eventHandlers)
      summarizationEventSourceRef.current = new EventSource(`${BACKEND_URL}/progress/${clientId}`);

      summarizationEventSourceRef.current.onopen = () => console.log('Summarization SSE connection opened');

      summarizationEventSourceRef.current.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        setSummarizationProgressMessage(data.message || '');
        if (data.progress !== undefined) setSummarizationProgress(data.progress);
      });

      summarizationEventSourceRef.current.addEventListener('summary_result', (event) => {
        const data = JSON.parse(event.data);
        setSummary(data.summary || data.text || '');
      });

      summarizationEventSourceRef.current.addEventListener('warning', (event) => {
        const data = JSON.parse(event.data);
        console.warn('Summarization warning:', data.message);
        setSummarizationProgressMessage(`Warning: ${data.message}`);
      });

      summarizationEventSourceRef.current.addEventListener('done', () => {
        setSummarizationProgressMessage('Summary complete!');
        setSummarizationProgress(100);
        setIsSummarizing(false);
        closeSummarizationEventSource();
        summarizationClientIdRef.current = null;
      });

      summarizationEventSourceRef.current.addEventListener('error', (event) => {
        console.error('Summarization SSE Error:', event);
        let msg = 'An error occurred during summarization.';
        if (event.data) try { msg = JSON.parse(event.data).message || msg; } catch (e) { /* use default */ }
        else if (event.target?.readyState === EventSource.CLOSED) msg = 'Connection to server lost.';
        
        setSummarizationError(msg);
        setSummarizationProgressMessage('Error occurred.');
        setIsSummarizing(false);
        closeSummarizationEventSource();
        summarizationClientIdRef.current = null;
      });

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
      try {
        // TODO: Replace with apiService.cancelSummarization(summarizationClientIdRef.current)
        await axios.post(`${BACKEND_URL}/cancel/${summarizationClientIdRef.current}`);
        console.log('Summarization cancellation request sent for client ID:', summarizationClientIdRef.current);
      } catch (err) {
        console.error('Error sending summarization cancellation request:', err);
      }
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
      axios.post(`${BACKEND_URL}/cancel/${summarizationClientIdRef.current}`).catch(err => console.error("Error cancelling summarization on reset:", err));
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
