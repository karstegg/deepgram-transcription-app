// frontend/src/constants/constants.js

// Transcription Models
export const AVAILABLE_MODELS = [
  // Nova Models (Most Advanced)
  { value: 'nova-3', label: 'Deepgram Nova-3', description: 'Highest accuracy' },
  { value: 'nova-3-general', label: 'Nova-3 General', description: 'Optimized for everyday audio' },
  
  // Nova-2 Models
  { value: 'nova-2', label: 'Nova-2 General', description: 'Fast, general purpose' },
  { value: 'nova-2-meeting', label: 'Nova-2 Meeting', description: 'For conference rooms' },
  { value: 'nova-2-phonecall', label: 'Nova-2 Phone Call', description: 'For low-bandwidth calls' },
  { value: 'nova-2-video', label: 'Nova-2 Video', description: 'For video content' },
  { value: 'nova-2-finance', label: 'Nova-2 Finance', description: 'Finance terminology' },
  { value: 'nova-2-medical', label: 'Nova-2 Medical', description: 'Medical terminology' },
  
  // Base Models
  { value: 'base', label: 'Base General', description: 'Cost-effective option' },
  { value: 'base-meeting', label: 'Base Meeting', description: 'For conference rooms' },
  { value: 'base-phonecall', label: 'Base Phone Call', description: 'For low-bandwidth calls' },
  
  // Whisper Models
  { value: 'whisper-medium', label: 'Whisper Medium', description: 'OpenAI Whisper (769M params)' },
  { value: 'whisper-small', label: 'Whisper Small', description: 'OpenAI Whisper (244M params)' },
  
  // Disabled Gemini Model - Example of how to handle disabled models
  { 
    value: 'gemini-2.5-pro-exp-03-25', 
    label: 'Gemini 2.5 Pro (Disabled)', 
    description: 'File size limitations', 
    disabled: true 
  },
];

export const DEFAULT_MODEL = 'nova-2-meeting'; // Default model for transcription

// Chunk Sizes for Transcription (Only relevant for Deepgram models)
export const CHUNK_SIZES_MB = [2, 5, 10]; // In MB
export const DEFAULT_CHUNK_SIZE_MB = CHUNK_SIZES_MB[1]; // Corresponds to 5MB

// SSE Event Names (used in hooks and apiService)
export const SSE_EVENT_TYPES = {
  STATUS: 'status',
  PARTIAL_TRANSCRIPT: 'partial_transcript',
  SUMMARY_RESULT: 'summary_result', // Used by both transcription (if enabled) and summarization services
  WARNING: 'warning',
  DONE: 'done',
  // Note: 'error' for SSE connection errors is handled by EventSource.onerror directly.
  // 'open' is also a direct property (onopen).
};

// Tab Identifiers for UI navigation
export const TAB_IDS = {
  TRANSCRIPT: 'transcript',
  SUMMARY: 'summary',
};

// Default active tab when the application loads
export const DEFAULT_ACTIVE_TAB = TAB_IDS.TRANSCRIPT;

// Backend URL - Centralized for reference, though apiService primarily uses it via process.env
export const FALLBACK_BACKEND_URL = 'https://deepgram-backend-upcbdbi5la-uc.a.run.app';
// REACT_APP_BACKEND_URL should be set in the environment for deployed versions.
// apiService.js handles the process.env part.
overwrite_file_with_block
frontend/src/hooks/useTranscriptionService.js
import { useState, useEffect, useRef, useCallback } from 'react';
import apiService from '../services/apiService';
import { DEFAULT_MODEL, DEFAULT_CHUNK_SIZE_MB, SSE_EVENT_TYPES } from '../constants/constants';

const useTranscriptionService = (initialHookOptions = {}) => {
  // Use defaults from constants if not provided in initialHookOptions
  const effectiveDefaultModel = initialHookOptions.defaultModel || DEFAULT_MODEL;
  const effectiveDefaultChunkSize = initialHookOptions.defaultChunkSize || DEFAULT_CHUNK_SIZE_MB;

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
    model: effectiveDefaultModel,
    enableDiarization: false,
    enableSummarization: false, // For transcription service's summary
    chunkSizeMB: effectiveDefaultChunkSize,
  });

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeEventSource();
      if (currentClientIdRef.current) {
        // apiService.cancelProcess(currentClientIdRef.current); // Optional: cancel on unmount
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
        onOpen: () => console.log('Transcription SSE connection opened.'),
        [SSE_EVENT_TYPES.STATUS]: (event) => {
          const data = JSON.parse(event.data);
          setProgressMessage(data.message || '');
          if (data.progress !== undefined) setProgress(data.progress);
        },
        [SSE_EVENT_TYPES.PARTIAL_TRANSCRIPT]: (event) => {
          const data = JSON.parse(event.data);
          setTranscription(prev => prev + (data.transcript || data.text || ''));
        },
        [SSE_EVENT_TYPES.SUMMARY_RESULT]: (event) => {
          const data = JSON.parse(event.data);
          setTranscriptionGeneratedSummary(data.summary || data.text || '');
          setProgressMessage("Summary (from transcription) received.");
        },
        [SSE_EVENT_TYPES.WARNING]: (event) => {
          const data = JSON.parse(event.data);
          console.warn('Transcription warning:', data.message);
          setProgressMessage(`Warning: ${data.message}`);
        },
        [SSE_EVENT_TYPES.DONE]: () => {
          setProgressMessage('Transcription complete!');
          setProgress(100);
          setIsTranscribing(false);
          closeEventSource();
          currentClientIdRef.current = null;
        },
        onErrorSse: (errorEvent) => { // This key matches what apiService expects
          console.error('Transcription SSE Error:', errorEvent);
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
      eventSourceRef.current = apiService.establishSseConnection(responseData.clientId, eventHandlers);

    } catch (error) {
      setTranscriptionError(error.message || 'Failed to start transcription');
      setProgressMessage('Error occurred.');
      setIsTranscribing(false);
      currentClientIdRef.current = null;
    }
  }, [selectedFile, closeEventSource, transcriptionOptions]);

  const cancelTranscription = useCallback(async () => {
    if (!isTranscribing && !currentClientIdRef.current) {
      if (progressMessage === 'Cancelling transcription...') setProgressMessage('');
      return;
    }
    setProgressMessage('Cancelling transcription...');
    closeEventSource(); 

    if (currentClientIdRef.current) {
      await apiService.cancelProcess(currentClientIdRef.current);
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
import apiService from '../services/apiService';
import { SSE_EVENT_TYPES } from '../constants/constants';

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
      summarizationEventSourceRef.current.close();
      summarizationEventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      closeSummarizationEventSource();
      if (summarizationClientIdRef.current) {
        // apiService.cancelProcess(summarizationClientIdRef.current); // Optional
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
      const responseData = await apiService.startSummarizationProcess(textToSummarize, options);
      summarizationClientIdRef.current = responseData.clientId;
      setSummarizationProgressMessage('Generating summary...');

      const eventHandlers = {
        onOpen: () => console.log('Summarization SSE connection opened.'),
        [SSE_EVENT_TYPES.STATUS]: (event) => {
          const data = JSON.parse(event.data);
          setSummarizationProgressMessage(data.message || '');
          if (data.progress !== undefined) setSummarizationProgress(data.progress);
        },
        [SSE_EVENT_TYPES.SUMMARY_RESULT]: (event) => {
          const data = JSON.parse(event.data);
          setSummary(data.summary || data.text || '');
        },
        [SSE_EVENT_TYPES.WARNING]: (event) => {
          const data = JSON.parse(event.data);
          console.warn('Summarization warning:', data.message);
          setSummarizationProgressMessage(`Warning: ${data.message}`);
        },
        [SSE_EVENT_TYPES.DONE]: () => {
          setSummarizationProgressMessage('Summary complete!');
          setSummarizationProgress(100);
          setIsSummarizing(false);
          closeSummarizationEventSource();
          summarizationClientIdRef.current = null;
        },
        onErrorSse: (errorEvent) => {
          console.error('Summarization SSE Error:', errorEvent);
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
      summarizationEventSourceRef.current = apiService.establishSseConnection(responseData.clientId, eventHandlers);

    } catch (error) {
      setSummarizationError(error.message || 'Failed to generate summary.');
      setSummarizationProgressMessage('Error occurred.');
      setIsSummarizing(false);
      summarizationClientIdRef.current = null;
    }
  }, [closeSummarizationEventSource]);

  const cancelSummarization = useCallback(async () => {
    if (!isSummarizing && !summarizationClientIdRef.current) {
       if(summarizationProgressMessage === 'Cancelling summarization...') setSummarizationProgressMessage('');
      return;
    }
    setSummarizationProgressMessage('Cancelling summarization...');
    closeSummarizationEventSource(); 

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
overwrite_file_with_block
frontend/src/components/AdvancedOptionsPanel.js
import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { AVAILABLE_MODELS, CHUNK_SIZES_MB } from '../constants/constants'; // Import constants

const AdvancedOptionsPanel = ({
  darkMode,
  onToggleDarkMode,
  selectedModel,
  onModelChange,
  // availableModels prop will now come from constants
  isLoading, 
  isGeminiModel,
  selectedChunkSize,
  onChunkSizeChange,
  // chunkSizes prop will now come from constants
  enableDiarization,
  onDiarizationChange,
  enableSummarization,
  onSummarizationChange,
}) => {
  return (
    <div className="space-y-4 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Advanced Options</h3>

      {/* Theme Toggle */}
      <div>
        <label className="block text-sm font-medium mb-1">Theme</label>
        <button
          onClick={onToggleDarkMode}
          disabled={isLoading}
          className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors w-full text-white disabled:opacity-50"
        >
          {darkMode ? <Sun size={16} className="mr-2" /> : <Moon size={16} className="mr-2" />}
          {darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        </button>
      </div>

      {/* Model Selector */}
      <div>
        <label htmlFor="model-select" className="block text-sm font-medium mb-1">
          Transcription Model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={onModelChange}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 disabled:opacity-50"
        >
          {AVAILABLE_MODELS.map(model => ( // Use imported constant
            <option
              key={model.value}
              value={model.value}
              disabled={model.disabled}
              className={model.disabled ? 'text-gray-400 dark:text-gray-600' : ''}
            >
              {model.label} ({model.description})
            </option>
          ))}
        </select>
      </div>

      {/* Chunk Size (only for non-Gemini models) */}
      {!isGeminiModel && (
        <div>
          <label htmlFor="chunk-size-select" className="block text-sm font-medium mb-1">
            Chunk Size (MB)
          </label>
          <select
            id="chunk-size-select"
            value={selectedChunkSize}
            onChange={onChunkSizeChange}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 disabled:opacity-50"
          >
            {CHUNK_SIZES_MB.map(size => ( // Use imported constant
              <option key={size} value={size}>{size} MB</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Larger chunks may be slower but more accurate
          </p>
        </div>
      )}

      {/* Feature Toggles */}
      <div className="space-y-3">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={enableDiarization}
            onChange={onDiarizationChange}
            disabled={isLoading}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded disabled:opacity-50"
          />
          <span className="ml-2 text-sm">
            Speaker Identification {isGeminiModel && '(via prompt)'}
          </span>
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={enableSummarization}
            onChange={onSummarizationChange}
            disabled={isLoading}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded disabled:opacity-50"
          />
          <span className="ml-2 text-sm">
            Generate Summary {isGeminiModel && '(via Gemini)'}
          </span>
        </label>
      </div>
    </div>
  );
};

export default AdvancedOptionsPanel;
