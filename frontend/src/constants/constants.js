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