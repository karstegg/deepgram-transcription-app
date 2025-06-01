import axios from 'axios';

const REACT_APP_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://deepgram-backend-upcbdbi5la-uc.a.run.app';
export const API_BASE_URL = REACT_APP_BACKEND_URL; // Export API_BASE_URL

/**
 * Gets a signed URL for uploading a file to GCS.
 * @param {string} fileName - The name of the file to upload.
 * @param {string} contentType - The MIME type of the file.
 * @returns {Promise<{url: string, gcsObjectName: string}>} The signed URL and GCS object name.
 */
export const getSignedUrl = async (fileName, contentType) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/gcs/generate-upload-url`, {
      fileName,
      contentType,
    });
    return response.data;
  } catch (error) {
    console.error('Error getting signed URL:', error.response?.data || error.message);
    throw new Error('Failed to get signed URL');
  }
};

/**
 * Uploads a file to Google Cloud Storage using a signed URL.
 * @param {string} signedUrl - The signed URL for uploading the file.
 * @param {File} file - The file to upload.
 * @param {Object} [options] - Additional options for the upload.
 * @param {Function} [options.onUploadProgress] - Callback for tracking upload progress.
 * @returns {Promise<Object>} The response from the upload.
 */
export const uploadToGcs = async (signedUrl, file, { onUploadProgress } = {}) => {
  try {
    const response = await axios.put(signedUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
      onUploadProgress,
    });
    return response.data;
  } catch (error) {
    console.error('Error uploading file to GCS:', error.response?.data || error.message);
    throw new Error('Failed to upload file to GCS');
  }
};

/**
 * Starts a transcription process.
 * @param {FormData} formData - The form data containing the audio file and transcription options.
 * @returns {Promise<Object>} The response from the transcription service.
 */
export const startTranscriptionProcess = async (formData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/transcribe`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error starting transcription:', error.response?.data || error.message);
    throw new Error('Failed to start transcription');
  }
};

/**
 * Starts a summarization process.
 * @param {string} text - The text to summarize.
 * @param {Object} [options] - Additional options for summarization.
 * @returns {Promise<Object>} The response from the summarization service.
 */
export const startSummarizationProcess = async (text, options = {}) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/summarize`, { text, ...options });
    return response.data;
  } catch (error) {
    console.error('Error starting summarization:', error.response?.data || error.message);
    throw new Error('Failed to start summarization');
  }
};

/**
 * Establishes an SSE connection for receiving real-time updates.
 * @param {string} clientId - The client ID for the SSE connection.
 * @param {Object} eventHandlers - Event handlers for the SSE connection.
 * @returns {EventSource} The SSE connection.
 */
export const establishSseConnection = (clientId, eventHandlers) => {
  const eventSource = new EventSource(`${API_BASE_URL}/sse/${clientId}`);

  eventSource.onopen = () => {
    console.log('SSE connection opened');
    if (eventHandlers.onOpen) eventHandlers.onOpen();
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type && eventHandlers[`on${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`]) {
        eventHandlers[`on${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`](event);
      }
    } catch (error) {
      console.error('Error processing SSE message:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    if (eventHandlers.onError) eventHandlers.onError(error);
  };

  return eventSource;
};

/**
 * Cancels a running process.
 * @param {string} clientId - The client ID of the process to cancel.
 * @returns {Promise<Object>} The response from the cancellation request.
 */
export const cancelProcess = async (clientId) => {
  if (!clientId) {
    console.warn('No client ID provided for cancellation.');
    return Promise.resolve();
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/cancel/${clientId}`);
    console.log(`Cancellation request for Client ID ${clientId} successful:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`API Error cancelling process for Client ID ${clientId}:`, error.response || error.message);
    return Promise.resolve();
  }
};

const apiService = {
  startTranscriptionProcess,
  startSummarizationProcess,
  establishSseConnection,
  cancelProcess,
  getSignedUrl,
  uploadToGcs,
  API_BASE_URL,
};

export default apiService;
