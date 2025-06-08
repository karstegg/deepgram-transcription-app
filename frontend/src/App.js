import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';

// Components
import FileUploadArea from './components/FileUploadArea';
import TranscriptionControls from './components/TranscriptionControls';
import AdvancedOptionsPanel from './components/AdvancedOptionsPanel';
import ProgressDisplay from './components/ProgressDisplay';
import ResultsTabs from './components/ResultsTabs';
import TranscriptionPanel from './components/TranscriptionPanel';
import SummaryPanel from './components/SummaryPanel';
import ErrorDisplay from './components/ErrorDisplay';

// Hooks - Using direct streaming instead of GCS-based transcription
import useDirectStreamingService from './hooks/useDirectStreamingService';
import useSummarizationService from './hooks/useSummarizationService';

// Constants
import {
  DEFAULT_MODEL,
  TAB_IDS,
  DEFAULT_ACTIVE_TAB,
  AVAILABLE_MODELS,
  CHUNK_SIZES_MB
} from './constants/constants';

// CSS
import '@fontsource/inter';
import '@fontsource/jetbrains-mono';

export default function App() {
  const { currentUser, isLoadingAuth, signInWithGoogle, signOutUser } = useAuth();
  
  // === Local App State ===
  const [darkMode, setDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState(DEFAULT_ACTIVE_TAB);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Consolidated states from hooks for UI
  const [appLevelError, setAppLevelError] = useState('');
  const [appLevelProgressMessage, setAppLevelProgressMessage] = useState('');
  const [appLevelProgress, setAppLevelProgress] = useState(0);

  // === Initialize Hooks ===
  const streamingService = useDirectStreamingService({
    defaultModel: DEFAULT_MODEL,
  });

  const summarizationService = useSummarizationService();

  // === Derived State ===
  const overallIsLoading = streamingService.isStreaming || summarizationService.isSummarizing;

  // === Effects ===
  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Consolidate errors from hooks
  useEffect(() => {
    if (streamingService.error) {
      setAppLevelError(streamingService.error);
    } else if (summarizationService.summarizationError) {
      setAppLevelError(summarizationService.summarizationError);
    } else {
      setAppLevelError('');
    }
  }, [streamingService.error, summarizationService.summarizationError]);

  // Consolidate progress messages and progress from hooks
  useEffect(() => {
    if (streamingService.isStreaming) {
      setAppLevelProgressMessage(streamingService.progressMessage);
      setAppLevelProgress(streamingService.progress);
    } else if (summarizationService.isSummarizing) {
      setAppLevelProgressMessage(summarizationService.progressMessage);
      setAppLevelProgress(summarizationService.progress);
    } else {
      if (streamingService.progressMessage && streamingService.progress === 100 && !summarizationService.summary) {
         setAppLevelProgressMessage(streamingService.progressMessage);
      } else if (summarizationService.summarizationProgressMessage && summarizationService.summarizationProgress === 100) {
         setAppLevelProgressMessage(summarizationService.summarizationProgressMessage);
      }
    }
  }, [
    streamingService.isStreaming, streamingService.progressMessage, streamingService.progress,
    summarizationService.isSummarizing, summarizationService.progressMessage, summarizationService.progress, summarizationService.summarizationProgressMessage, summarizationService.summarizationProgress,
    summarizationService.summary, appLevelError
  ]);
  
  // Auto-switch to summary tab if summary becomes available
  useEffect(() => {
    if (summarizationService.summary) {
      setActiveTab(TAB_IDS.SUMMARY);
    }
  }, [summarizationService.summary]);

  // Auto-switch to transcript tab if streaming starts and summary tab is active but empty
  useEffect(() => {
    if (streamingService.isStreaming && activeTab === TAB_IDS.SUMMARY && !summarizationService.summary) {
      setActiveTab(TAB_IDS.TRANSCRIPT);
    }
  }, [streamingService.isStreaming, activeTab, summarizationService.summary]);

  // === Event Handlers ===
  const handleFileSelectForApp = (file) => {
    streamingService.handleFileSelect(file);
    summarizationService.resetSummarizationState();
    setActiveTab(TAB_IDS.TRANSCRIPT);
    setAppLevelError('');
    setAppLevelProgressMessage('');
  };

  const handleStartTranscriptionProcess = () => {
    summarizationService.resetSummarizationState();
    setAppLevelError('');
    setAppLevelProgressMessage('');
    setActiveTab(TAB_IDS.TRANSCRIPT);
    streamingService.startStreaming();
  };

  const handleStartSummarizationProcess = () => {
    if (!streamingService.transcription) {
      setAppLevelError('Please transcribe a file first to generate a summary.');
      return;
    }
    setAppLevelError('');
    setAppLevelProgressMessage('');
    summarizationService.startSummarization(streamingService.transcription);
  };
  
  const handleCancelResetProcess = () => {
    if (streamingService.isStreaming) {
      streamingService.cancelStreaming();
    } else if (summarizationService.isSummarizing) {
      summarizationService.cancelSummarization();
    } else {
      // Full Reset
      streamingService.resetState();
      summarizationService.resetSummarizationState();
      setActiveTab(DEFAULT_ACTIVE_TAB);
      setAppLevelError('');
      setAppLevelProgressMessage('');
    }
  };

  const handleDarkModeToggle = () => {
    setDarkMode(!darkMode);
  };

  const handleAdvancedOptionChange = (option, value) => {
    streamingService.updateStreamingOptions({ [option]: value });
  };
  
  const clearAppError = () => {
    setAppLevelError('');
    streamingService.setTranscriptionError('');
    summarizationService.setSummarizationError('');
  };

  const handleCopyContent = () => {
    const textToCopy = activeTab === TAB_IDS.SUMMARY 
      ? summarizationService.summary
      : streamingService.transcription;
    
    if (!textToCopy) {
      setAppLevelError(`No ${activeTab} content available to copy.`);
      setTimeout(() => clearAppError(), 3000);
      return;
    }

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setAppLevelProgressMessage('Content copied!');
        setTimeout(() => setAppLevelProgressMessage(''), 2000);
      })
      .catch(err => {
        console.error('Failed to copy content: ', err);
        setAppLevelError('Failed to copy content. Please try manually.');
        setTimeout(() => clearAppError(), 3000);
      });
  };

  const handleSaveContent = () => {
    const textToSave = activeTab === TAB_IDS.SUMMARY
      ? summarizationService.summary
      : streamingService.transcription;

    if (!textToSave) {
      setAppLevelError(`No ${activeTab} content available to save.`);
      setTimeout(() => clearAppError(), 3000);
      return;
    }
    
    try {
      const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileNameSuffix = activeTab === TAB_IDS.SUMMARY ? 'summary' : 'transcript';
      const baseFileName = streamingService.selectedFile 
        ? streamingService.selectedFile.name.split('.').slice(0, -1).join('.') 
        : 'download';
      link.download = `${baseFileName}_${fileNameSuffix}.txt`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setAppLevelProgressMessage('File saved!');
      setTimeout(() => setAppLevelProgressMessage(''), 2000);
    } catch (saveError) {
      console.error('Error saving file:', saveError);
      setAppLevelError('Failed to save file.');
      setTimeout(() => clearAppError(), 3000);
    }
  };
  
  // Determine if the selected model is Gemini for AdvancedOptionsPanel
  const isGeminiModel = streamingService.streamingOptions.model.startsWith('gemini-');

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
      <header className="border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-primary">Audio/Video Transcription</h1>
          <div className="flex items-center">
              {isLoadingAuth ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">Loading user...</p>
              ) : currentUser ? (
                <div className="flex items-center space-x-2">
                  <p className="text-sm">Hi, {currentUser.displayName || currentUser.email}</p>
                  <button
                    onClick={signOutUser}
                    className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={signInWithGoogle}
                  className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Sign in with Google
                </button>
              )}
            </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Panel */}
          <div className="w-full lg:w-1/3 space-y-6">
            <FileUploadArea
              selectedFile={streamingService.selectedFile}
              onFileSelect={handleFileSelectForApp}
              isLoading={overallIsLoading}
            />
            <TranscriptionControls
              onStartTranscription={handleStartTranscriptionProcess}
              onSummarization={handleStartSummarizationProcess}
              onCancelReset={handleCancelResetProcess}
              isLoading={overallIsLoading}
              selectedFile={streamingService.selectedFile}
              transcription={streamingService.transcription}
              showAdvancedOptions={showAdvancedOptions}
              onToggleAdvancedOptions={() => setShowAdvancedOptions(!showAdvancedOptions)}
            />
            {showAdvancedOptions && (
              <AdvancedOptionsPanel
                darkMode={darkMode}
                onToggleDarkMode={handleDarkModeToggle}
                selectedModel={streamingService.streamingOptions.model}
                onModelChange={(e) => handleAdvancedOptionChange('model', e.target.value)}
                availableModels={AVAILABLE_MODELS}
                isLoading={overallIsLoading}
                isGeminiModel={isGeminiModel}
                selectedChunkSize={8} // Fixed for streaming
                onChunkSizeChange={() => {}} // No-op for streaming
                chunkSizes={CHUNK_SIZES_MB}
                enableDiarization={streamingService.streamingOptions.enableDiarization}
                onDiarizationChange={(e) => handleAdvancedOptionChange('enableDiarization', e.target.checked)}
                enableSummarization={streamingService.streamingOptions.enableSummarization}
                onSummarizationChange={(e) => handleAdvancedOptionChange('enableSummarization', e.target.checked)}
              />
            )}
          </div>

          {/* Right Panel */}
          <div className="w-full lg:w-2/3 space-y-4">
            <ErrorDisplay errorMessage={appLevelError} onClearError={clearAppError} />
            <ProgressDisplay
              isLoading={overallIsLoading}
              progress={appLevelProgress}
              progressMessage={appLevelProgressMessage}
            />
            <ResultsTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              isLoading={overallIsLoading}
              isSummaryAvailable={!!summarizationService.summary}
              transcriptionPanelSlot={
                <TranscriptionPanel
                  transcriptionText={streamingService.transcription}
                  isLoading={streamingService.isStreaming && !streamingService.transcription}
                  onCopyTranscription={handleCopyContent}
                  onDownloadTranscription={handleSaveContent}
                />
              }
              summaryPanelSlot={
                <SummaryPanel
                  summaryText={summarizationService.summary}
                  isLoading={summarizationService.isSummarizing && !summarizationService.summary}
                  onCopySummary={handleCopyContent}
                  onDownloadSummary={handleSaveContent}
                />
              }
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-700 py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Powered by <a href="https://deepgram.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Deepgram</a> Direct Streaming
          </p>
        </div>
      </footer>
    </div>
  );
}
