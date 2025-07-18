import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Sun, Moon, Upload, Copy, Download, Share2, Github, Loader2, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import '@fontsource/inter';
import '@fontsource/jetbrains-mono';

// Models
const AVAILABLE_MODELS = [
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
  
  // Disabled Gemini Model
  { value: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro (Disabled)', description: 'File size limitations', disabled: true },
];
// Set Nova-2 Meeting as the default model
const defaultModel = 'nova-2-meeting'; // For conference rooms

// Chunk Sizes (Only relevant for Deepgram models)
const CHUNK_SIZES = [2, 5, 10]; // In MB
// Set 5MB as the default chunk size (index 1)
const defaultChunkSize = CHUNK_SIZES[1];

export default function App() {
  // Using dark mode by default
  const [darkMode, setDarkMode] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [enableDiarization, setEnableDiarization] = useState(false);
  const [enableSummarization, setEnableSummarization] = useState(false);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [selectedChunkSize, setSelectedChunkSize] = useState(defaultChunkSize);
  const [activeTab, setActiveTab] = useState('transcript');
  const [progress, setProgress] = useState(0);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  const eventSourceRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentClientIdRef = useRef(null);
  const transcriptionAreaRef = useRef(null);
  const dropAreaRef = useRef(null);

    const backendUrl = 'http://localhost:5000'; // Or use process.env.REACT_APP_BACKEND_URL

  // Determine if the selected model is Gemini
  const isGeminiModel = selectedModel.startsWith('gemini-');

  // Set dark mode on initial load
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Auto-scroll Effect
  useEffect(() => {
    if (transcriptionAreaRef.current) {
      transcriptionAreaRef.current.scrollTop = transcriptionAreaRef.current.scrollHeight;
    }
  }, [transcription]);

  // Close EventSource
  const closeEventSource = () => {
    if (eventSourceRef.current) {
      console.log("Closing existing EventSource connection.");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    currentClientIdRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => closeEventSource();
  }, []);

  // Reset state function
  const resetState = () => {
    setSelectedFile(null);
    setTranscription('');
    setSummary('');
    setError('');
    setProgressMessage('');
    setProgress(0);
    setIsLoading(false);
    // Always reset options to defaults
    setSelectedModel(defaultModel);
    setSelectedChunkSize(defaultChunkSize);
    setEnableDiarization(false);
    setEnableSummarization(false);
    setShowAdvancedOptions(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    closeEventSource();
  };

  // File change handler
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setTranscription('');
      setSummary('');
      setError('');
      setProgressMessage('');
      closeEventSource();
      setSelectedFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    if (dropAreaRef.current) {
      dropAreaRef.current.classList.add('border-primary');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (dropAreaRef.current) {
      dropAreaRef.current.classList.remove('border-primary');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dropAreaRef.current) {
      dropAreaRef.current.classList.remove('border-primary');
    }
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setTranscription('');
      setSummary('');
      setError('');
      setProgressMessage('');
      closeEventSource();
      setSelectedFile(e.dataTransfer.files[0]);
      
      // Update the file input for consistency
      if (fileInputRef.current) {
        fileInputRef.current.files = e.dataTransfer.files;
      }
    }
  };

  // Option change handlers
  const handleDiarizationChange = (event) => setEnableDiarization(event.target.checked);
  const handleSummarizationChange = (event) => setEnableSummarization(event.target.checked);
  const handleModelChange = (event) => setSelectedModel(event.target.value);
  const handleChunkSizeChange = (event) => {
    setSelectedChunkSize(parseInt(event.target.value, 10));
  };

  // Copy handler
  const handleCopy = () => {
    let textToCopy;
    
    if (summary && activeTab === 'summary') {
      // For summary, extract the formatted text from the rendered content
      const summaryElement = document.querySelector('.prose');
      if (summaryElement) {
        // Get the formatted text as displayed (without markdown symbols)
        textToCopy = summaryElement.innerText || summaryElement.textContent;
      } else {
        // Fallback to raw markdown if element not found
        textToCopy = summary;
      }
    } else {
      // For transcript, use the raw text
      textToCopy = transcription;
    }
    
    // Try to use the clipboard API with fallback method
    try {
      // Create a temporary textarea element
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      
      // Make the textarea out of viewport
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      // Select and copy the text
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setProgressMessage('Content copied!');
        setTimeout(() => setProgressMessage(''), 2000);
      } else {
        // Try the clipboard API as a fallback
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            setProgressMessage('Content copied!');
            setTimeout(() => setProgressMessage(''), 2000);
          })
          .catch(err => {
            console.error('Failed to copy: ', err);
            setError('Failed to copy content.');
            setTimeout(() => setError(''), 3000);
          });
      }
    } catch (err) {
      console.error('Copy failed:', err);
      setError('Failed to copy content. Please try selecting and copying manually.');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Save handler
  const handleSave = () => {
    try {
      const textToSave = summary && activeTab === 'summary'
        ? summary
        : transcription;
      
      const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = selectedFile 
        ? `${selectedFile.name.split('.').slice(0, -1).join('.')}_${activeTab === 'summary' ? 'summary' : 'transcript'}.txt` 
        : `${activeTab === 'summary' ? 'summary' : 'transcript'}.txt`;
      
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProgressMessage('File saved!');
      setTimeout(() => setProgressMessage(''), 2000);
    } catch (error) {
      console.error('Error saving file:', error);
      setError('Failed to save file.');
    }
  };

  // Cancel/Reset handler
  const handleCancelReset = async () => {
    if (isLoading) {
      setProgressMessage('Cancelling transcription...');
      
      // Call the cancel endpoint if we have a clientId
      if (currentClientIdRef.current) {
        try {
          await axios.post(`http://localhost:5000/cancel/${currentClientIdRef.current}`);
          console.log('Cancellation request sent to server');
        } catch (error) {
          console.error('Error sending cancellation request:', error);
        }
      }
      
      closeEventSource();
      setIsLoading(false);
      setProgressMessage('Transcription cancelled.');
      setTimeout(() => setProgressMessage(''), 2000);
    } else {
      resetState();
    }
  };

  // Separate summarization handler
  const handleSummarization = async () => {
    if (!transcription) {
      setError('No transcription available to summarize.');
      return;
    }

    try {
      // Reset previous summary
      setSummary('');
      setError('');
      setProgressMessage('Generating summary...');
      setProgress(0);
      setIsLoading(true);
      closeEventSource();
      
      // Create simple JSON paylod
      const payload = {
        existingTranscription: transcription,
      };

      // Send request with JSON payload
      const response = await axios.post(`${backendUrl}/summarize`, payload);
    
      const clientId = response.data.clientId;
      currentClientIdRef.current = clientId;
      setProgressMessage('Generating summary...');

      // Set up SSE connection
      const eventSource = new EventSource(`${backendUrl}/progress/${clientId}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
      };

      eventSource.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        setProgressMessage(data.message);
        
        // Update progress if available
        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
      });

      eventSource.addEventListener('summary_result', (event) => {
        const data = JSON.parse(event.data);
        setSummary(data.summary || data.text);
        
        // Switch to summary tab when summary is available
        if (data.summary || data.text) {
          setActiveTab('summary');
        }
      });

      eventSource.addEventListener('warning', (event) => {
        const data = JSON.parse(event.data);
        console.warn('Summary warning:', data.message);
        setProgressMessage(`Warning: ${data.message}`);
      });

      eventSource.addEventListener('done', () => {
        setProgressMessage('Summary complete!');
        setProgress(100);
        setIsLoading(false);
        closeEventSource();
      });

      eventSource.addEventListener('error', (event) => {
        console.error('SSE Error:', event);
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            setError(data.message || 'An error occurred during summarization.');
          } catch (e) {
            setError('An error occurred during summarization.');
          }
        } else {
          setError('Connection to server lost.');
        }
        setProgressMessage('Error occurred.');
        setIsLoading(false);
        closeEventSource();
      });
    } catch (error) {
      console.error('Error generating summary:', error);
      setError(error.response?.data?.error || error.message || 'Failed to generate summary');
      setProgressMessage('Error occurred.');
      setIsLoading(false);
      closeEventSource();
    }
  };

  // Main transcription handler
  const handleTranscription = async () => {
    if (!selectedFile) {
      setError('Please select a file first.');
      return;
    }

    try {
      // Reset previous results
      setTranscription('');
      setSummary('');
      setError('');
      setProgressMessage('Preparing transcription...');
      setProgress(0);
      setIsLoading(true);
      closeEventSource();

      // Create form data
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('model', selectedModel);
      formData.append('diarize', enableDiarization);
      formData.append('summarize', enableSummarization);
      formData.append('enableSummarization', enableSummarization); // Add the parameter with the name the backend expects
      formData.append('chunkSizeMB', selectedChunkSize);

      // Send request to backend
      const response = await axios.post(`${backendUrl}/transcribe`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const clientId = response.data.clientId;
      currentClientIdRef.current = clientId;
      setProgressMessage('Starting transcription...');

      // Set up SSE connection
      const eventSource = new EventSource(`${backendUrl}/progress/${clientId}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
      };

      eventSource.addEventListener('status', (event) => {
        const data = JSON.parse(event.data);
        setProgressMessage(data.message);
        
        // Update progress if available
        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
      });

      eventSource.addEventListener('partial_transcript', (event) => {
        const data = JSON.parse(event.data);
        const newText = data.transcript || data.text;
        // Append new text to existing transcription instead of replacing it
        setTranscription(prevTranscription => prevTranscription + newText);
        
        // If on summary tab but no summary yet, switch to transcript
        if (activeTab === 'summary' && !summary) {
          setActiveTab('transcript');
        }
      });

      eventSource.addEventListener('summary_result', (event) => {
        const data = JSON.parse(event.data);
        setSummary(data.summary || data.text);
        
        // Switch to summary tab when summary is available
        if (data.summary || data.text) {
          setActiveTab('summary');
        }
      });

      eventSource.addEventListener('warning', (event) => {
        const data = JSON.parse(event.data);
        console.warn('Transcription warning:', data.message);
        setProgressMessage(`Warning: ${data.message}`);
      });

      eventSource.addEventListener('done', () => {
        setProgressMessage('Transcription complete!');
        setProgress(100);
        setIsLoading(false);
        closeEventSource();
      });

      eventSource.addEventListener('error', (event) => {
        console.error('SSE Error:', event);
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            setError(data.message || 'An error occurred during transcription.');
          } catch (e) {
            setError('An error occurred during transcription.');
          }
        } else {
          setError('Connection to server lost.');
        }
        setProgressMessage('Error occurred.');
        setIsLoading(false);
        closeEventSource();
      });
    } catch (error) {
      console.error('Error starting transcription:', error);
      setError(error.response?.data?.error || error.message || 'Failed to start transcription');
      setProgressMessage('Error occurred.');
      setIsLoading(false);
      closeEventSource();
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-dark text-light' : 'bg-light text-dark'}`}>
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-primary">Audio/Video Transcription</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Panel - Controls */}
          <div className="w-full lg:w-1/3 space-y-6">
            {/* File Upload Zone */}
            <div 
              ref={dropAreaRef}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center transition-colors hover:border-primary dark:hover:border-primary cursor-pointer"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                onChange={handleFileChange}
                disabled={isLoading}
                className="hidden"
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm font-medium">
                Drop files here or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Supports MP3, WAV, MP4, etc.
              </p>
              
              {selectedFile && (
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-left">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              )}
            </div>

            {/* Transcription Options */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-medium border-b pb-2 border-gray-200 dark:border-gray-700">Transcription Options</h2>
              
              {/* Basic Options - Always visible */}
              <div className="space-y-4">
                {/* Action Buttons */}
                <div className="pt-2 space-y-3">
                  <button
                    onClick={handleTranscription}
                    disabled={isLoading || !selectedFile}
                    className="w-full py-2 px-4 bg-primary hover:bg-blue-600 text-white font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="animate-spin mr-2 h-4 w-4" />
                        Processing...
                      </span>
                    ) : 'Transcribe File'}
                  </button>
                  
                  <button
                    onClick={handleSummarization}
                    disabled={isLoading || !transcription}
                    className="w-full py-2 px-4 bg-secondary hover:bg-purple-600 text-white font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Generate Summary
                  </button>
                  
                  <button
                    onClick={handleCancelReset}
                    className="w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium rounded-md shadow-sm transition-colors"
                  >
                    {isLoading ? 'Cancel' : 'Reset'}
                  </button>
                  
                  {/* Advanced Options Toggle */}
                  <button 
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className="w-full py-2 px-4 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium rounded-md shadow-sm transition-colors"
                    disabled={isLoading}
                  >
                    <Settings size={16} className="mr-2" />
                    {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
                  </button>
                </div>
              </div>
              
              {/* Advanced Options - Toggleable */}
              {showAdvancedOptions && (
                <div className="space-y-4 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Advanced Options</h3>
                  
                  {/* Theme Toggle */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Theme</label>
                    <button
                      onClick={() => {
                        setDarkMode(!darkMode);
                        if (!darkMode) {
                          document.documentElement.classList.add('dark');
                        } else {
                          document.documentElement.classList.remove('dark');
                        }
                      }}
                      className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors w-full text-white"
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
                      onChange={handleModelChange}
                      disabled={isLoading}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700"
                    >
                      {AVAILABLE_MODELS.map(model => (
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
                  
                  {/* Chunk Size (only for Deepgram) */}
                  {!isGeminiModel && (
                    <div>
                      <label htmlFor="chunk-size-select" className="block text-sm font-medium mb-1">
                        Chunk Size (MB)
                      </label>
                      <select
                        id="chunk-size-select"
                        value={selectedChunkSize}
                        onChange={handleChunkSizeChange}
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700"
                      >
                        {CHUNK_SIZES.map(size => (
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
                        onChange={handleDiarizationChange}
                        disabled={isLoading}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm">
                        Speaker Identification {isGeminiModel && '(via prompt)'}
                      </span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={enableSummarization}
                        onChange={handleSummarizationChange}
                        disabled={isLoading}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm">
                        Generate Summary {isGeminiModel && '(via Gemini)'}
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Panel - Results */}
          <div className="w-full lg:w-2/3 space-y-4">
            {/* Status Indicators */}
            {(isLoading || error || progressMessage) && (
              <div className={`p-4 rounded-lg ${error ? 'bg-red-100 dark:bg-red-900/20 text-error' : 'bg-gray-100 dark:bg-gray-800'}`}>
                {isLoading && (
                  <div className="mb-2">
                    <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-in-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                <p className="text-sm font-medium">
                  {error ? `Error: ${error}` : progressMessage}
                </p>
              </div>
            )}
            
            {/* Results Tabs */}
            {/* Always show the results container */}
            {(
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <div className="flex gap-2 p-2 bg-white dark:bg-gray-800">
                  <button
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === 'transcript' 
                        ? 'bg-primary text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    onClick={() => setActiveTab('transcript')}
                  >
                    Transcript
                  </button>
                  
                  <button
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === 'summary' 
                        ? 'bg-secondary text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    onClick={() => setActiveTab('summary')}
                  >
                    Summary
                  </button>
                </div>
                
                {/* Transcript Content */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900">
                  {activeTab === 'transcript' && (
                    <div className="relative">
                      <pre 
                        ref={transcriptionAreaRef}
                        className="transcript-text text-sm h-[400px] overflow-y-auto p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700"
                      >
                        {transcription || (isLoading ? 'Transcription will appear here...' : 'No transcription available')}
                      </pre>
                    </div>
                  )}
                  
                  {/* Summary Content */}
                  {activeTab === 'summary' && (
                    <div className="relative">
                      <div className="font-sans text-sm h-[400px] overflow-y-auto p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
                        {summary ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>
                              {summary}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p>{isLoading ? 'Summary will appear here...' : 'No summary available'}</p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  {!isLoading && (transcription || summary) && (
                    <div className="flex space-x-2 mt-4">
                      <button
                        onClick={handleCopy}
                        className="flex items-center px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        <Copy size={16} className="mr-1" />
                        Copy
                      </button>
                      
                      <button
                        onClick={handleSave}
                        className="flex items-center px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        <Download size={16} className="mr-1" />
                        Save as .txt
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Powered by <a href="https://deepgram.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Deepgram</a> & <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Gemini</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
