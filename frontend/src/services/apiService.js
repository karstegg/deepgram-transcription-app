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
  // Options like model, diarize, summarize, chunkSizeMB, summarizationProvider are expected
  // to be in formData by the backend.
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
 * Starts the summarization process (for existing text, typically via /summarize endpoint).
 * @param {string} textToSummarize The text to be summarized.
 * @param {object} options Additional options for summarization (e.g., model if backend supports it).
 * @returns {Promise<object>} The response data, expected to contain clientId.
 * @throws {Error} If the request fails.
 */
export const startSummarizationProcess = async (textToSummarize, options = {}) => {
  try {
    const payload = {
      existingTranscription: textToSummarize,
      ...options, // e.g., model: options.model if /summarize supports model selection
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
    console.warn('Attempted to cancel process without a client ID.');
    return Promise.resolve(); // Or reject, depending on desired behavior
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/cancel/${clientId}`);
    console.log(`Cancellation request successful for client ID: ${clientId}`);
    return response.data; 
  } catch (error) {
    console.error(`API Error in cancelProcess for client ID ${clientId}:`, error.response?.data || error.message);
    // Don't throw here to allow UI to proceed with cancellation flow, but log it.
    // The caller should handle UI updates regardless of backend confirmation if needed.
    return Promise.resolve(); // Indicate completion of attempt, even if backend failed
  }
};

const apiService = {
  startTranscriptionProcess,
  startSummarizationProcess,
  establishSseConnection,
  cancelProcess,
  API_BASE_URL, // Exporting for potential direct use if needed elsewhere
};

export default apiService;
