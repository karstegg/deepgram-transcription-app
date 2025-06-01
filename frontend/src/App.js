import React, { useState, useEffect } from 'react';
// import { Sun, Moon } from 'lucide-react'; // Only icons used directly in App.js
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

// Hooks
import useTranscriptionService from './hooks/useTranscriptionService';
import useSummarizationService from './hooks/useSummarizationService';

// Constants
import {
  DEFAULT_MODEL,
  DEFAULT_CHUNK_SIZE_MB,
  TAB_IDS,
  DEFAULT_ACTIVE_TAB,
  AVAILABLE_MODELS, // Needed for AdvancedOptionsPanel if not passed through hook
  CHUNK_SIZES_MB    // Needed for AdvancedOptionsPanel if not passed through hook
} from './constants/constants';

// CSS
import '@fontsource/inter';
import '@fontsource/jetbrains-mono';
// App.css can be kept for global styles not covered by Tailwind component classes
// import './App.css'; // Assuming App.css might still have some global styles or is cleaned up separately

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
  const transcriptionService = useTranscriptionService({
    defaultModel: DEFAULT_MODEL,
    defaultChunkSize: DEFAULT_CHUNK_SIZE_MB,
  });

  const summarizationService = useSummarizationService();

  // === Derived State ===
  const overallIsLoading = transcriptionService.isTranscribing || summarizationService.isSummarizing;

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
    if (transcriptionService.transcriptionError) {
      setAppLevelError(transcriptionService.transcriptionError);
    } else if (summarizationService.summarizationError) {
      setAppLevelError(summarizationService.summarizationError);
    } else {
      setAppLevelError(''); // Clear if no errors from hooks
    }
  }, [transcriptionService.transcriptionError, summarizationService.summarizationError]);

  // Consolidate progress messages and progress from hooks
  useEffect(() => {
    if (transcriptionService.isTranscribing) {
      setAppLevelProgressMessage(transcriptionService.progressMessage);
      setAppLevelProgress(transcriptionService.progress);
    } else if (summarizationService.isSummarizing) {
      setAppLevelProgressMessage(summarizationService.progressMessage);
      setAppLevelProgress(summarizationService.progress);
    } else {
      // If neither is loading, show the "last active" message or clear
      // This logic can be refined: e.g. show transcription completion message
      // even if summarization starts immediately after.
      // For now, prioritize the active process or the last message from transcription/summarization hook.
      if (transcriptionService.progressMessage && transcriptionService.progress === 100 && !summarizationService.summary) {
         setAppLevelProgressMessage(transcriptionService.progressMessage);
      } else if (summarizationService.summarizationProgressMessage && summarizationService.summarizationProgress === 100) {
         setAppLevelProgressMessage(summarizationService.summarizationProgressMessage);
      }
      // else if (!appLevelError) { // Avoid clearing error-related messages if an error just occurred
      //   setAppLevelProgressMessage(''); // Clear if no active process and no final message shown
      // }
    }
  }, [
    transcriptionService.isTranscribing, transcriptionService.progressMessage, transcriptionService.progress,
    summarizationService.isSummarizing, summarizationService.summarizationProgressMessage, summarizationService.summarizationProgress, summarizationService.progress, summarizationService.progressMessage,
    summarizationService.summary, appLevelError
  ]);
  
  // Auto-switch to summary tab if summary becomes available (from either service)
  useEffect(() => {
    if (summarizationService.summary || transcriptionService.transcriptionGeneratedSummary) {
      setActiveTab(TAB_IDS.SUMMARY);
    }
  }, [summarizationService.summary, transcriptionService.transcriptionGeneratedSummary]);

  // Auto-switch to transcript tab if a new transcription starts and summary tab is active but empty
  // (mimicking original App.js behavior)
  useEffect(() => {
    if (transcriptionService.isTranscribing && activeTab === TAB_IDS.SUMMARY && !summarizationService.summary && !transcriptionService.transcriptionGeneratedSummary) {
      setActiveTab(TAB_IDS.TRANSCRIPT);
    }
  }, [transcriptionService.isTranscribing, activeTab, summarizationService.summary, transcriptionService.transcriptionGeneratedSummary]);


  // === Event Handlers ===
  const handleFileSelectForApp = (file) => {
    transcriptionService.handleFileSelect(file);
    summarizationService.resetSummarizationState(); // Reset summary if new file selected
    setActiveTab(TAB_IDS.TRANSCRIPT); // Switch to transcript tab on new file
    setAppLevelError(''); // Clear any previous errors
    setAppLevelProgressMessage(''); // Clear previous messages
  };

  const handleStartTranscriptionProcess = () => {
    // Reset summarization if starting new transcription
    summarizationService.resetSummarizationState();
    setAppLevelError('');
    setAppLevelProgressMessage('');
    setActiveTab(TAB_IDS.TRANSCRIPT);
    transcriptionService.startTranscription(); // Uses options from its internal state
  };

  const handleStartSummarizationProcess = () => {
    if (!transcriptionService.transcription && !transcriptionService.transcriptionGeneratedSummary) {
      setAppLevelError('Please transcribe a file first to generate a summary.');
      return;
    }
    setAppLevelError('');
    setAppLevelProgressMessage('');
    // Use main transcription if available, otherwise use transcription-generated summary as source
    const textToSummarize = transcriptionService.transcription || transcriptionService.transcriptionGeneratedSummary;
    summarizationService.startSummarization(textToSummarize);
  };
  
  const handleCancelResetProcess = () => {
    if (transcriptionService.isTranscribing) {
      transcriptionService.cancelTranscription();
    } else if (summarizationService.isSummarizing) {
      summarizationService.cancelSummarization();
    } else {
      // Full Reset
      transcriptionService.resetTranscriptionState();
      summarizationService.resetSummarizationState();
      setActiveTab(DEFAULT_ACTIVE_TAB);
      setAppLevelError('');
      setAppLevelProgressMessage('');
      // fileInputRef might need to be handled if still used directly (it's in FileUploadArea now)
    }
  };

  const handleDarkModeToggle = () => {
    setDarkMode(!darkMode);
  };

  const handleAdvancedOptionChange = (option, value) => {
    transcriptionService.updateTranscriptionOptions({ [option]: value });
  };
  
  const clearAppError = () => {
    setAppLevelError('');
    transcriptionService.setTranscriptionError('');
    summarizationService.setSummarizationError('');
  };

  const handleCopyContent = () => {
    const textToCopy = activeTab === TAB_IDS.SUMMARY 
      ? (summarizationService.summary || transcriptionService.transcriptionGeneratedSummary)
      : transcriptionService.transcription;
    
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
      ? (summarizationService.summary || transcriptionService.transcriptionGeneratedSummary)
      : transcriptionService.transcription;

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
      const baseFileName = transcriptionService.selectedFile 
        ? transcriptionService.selectedFile.name.split('.').slice(0, -1).join('.') 
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
  const isGeminiModel = transcriptionService.transcriptionOptions.model.startsWith('gemini-');


  return (
    <div className={`min-h-screen ${darkMode ? 'bg-dark text-light' : 'bg-light text-dark'}`}>
      <header className="border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-primary">Audio/Video Transcription</h1>
          <div className="flex items-center"> {/* Auth UI Wrapper */}
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
              selectedFile={transcriptionService.selectedFile}
              onFileSelect={handleFileSelectForApp}
              isLoading={overallIsLoading}
            />
            <TranscriptionControls
              onStartTranscription={handleStartTranscriptionProcess}
              onSummarization={handleStartSummarizationProcess}
              onCancelReset={handleCancelResetProcess}
              isLoading={overallIsLoading}
              selectedFile={transcriptionService.selectedFile}
              transcription={transcriptionService.transcription || transcriptionService.transcriptionGeneratedSummary} // Enable summary if any transcription exists
              showAdvancedOptions={showAdvancedOptions}
              onToggleAdvancedOptions={() => setShowAdvancedOptions(!showAdvancedOptions)}
            />
            {showAdvancedOptions && (
              <AdvancedOptionsPanel
                darkMode={darkMode}
                onToggleDarkMode={handleDarkModeToggle}
                selectedModel={transcriptionService.transcriptionOptions.model}
                onModelChange={(e) => handleAdvancedOptionChange('model', e.target.value)}
                availableModels={AVAILABLE_MODELS} // Pass from constants
                isLoading={overallIsLoading}
                isGeminiModel={isGeminiModel}
                selectedChunkSize={transcriptionService.transcriptionOptions.chunkSizeMB}
                onChunkSizeChange={(e) => handleAdvancedOptionChange('chunkSizeMB', parseInt(e.target.value, 10))}
                chunkSizes={CHUNK_SIZES_MB} // Pass from constants
                enableDiarization={transcriptionService.transcriptionOptions.enableDiarization}
                onDiarizationChange={(e) => handleAdvancedOptionChange('enableDiarization', e.target.checked)}
                enableSummarization={transcriptionService.transcriptionOptions.enableSummarization} // This is for transcription's summary feature
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
              isSummaryAvailable={!!(summarizationService.summary || transcriptionService.transcriptionGeneratedSummary)}
              transcriptionPanelSlot={
                <TranscriptionPanel
                  transcriptionText={transcriptionService.transcription}
                  isLoading={transcriptionService.isTranscribing && !transcriptionService.transcription} // Show placeholder only if loading AND no text yet
                  onCopyTranscription={handleCopyContent}
                  onDownloadTranscription={handleSaveContent}
                />
              }
              summaryPanelSlot={
                <SummaryPanel
                  summaryText={summarizationService.summary || transcriptionService.transcriptionGeneratedSummary}
                  isLoading={(summarizationService.isSummarizing && !summarizationService.summary) || (transcriptionService.isTranscribing && transcriptionService.transcriptionOptions.enableSummarization && !transcriptionService.transcriptionGeneratedSummary) }
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
            Powered by <a href="https://deepgram.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Deepgram</a> & <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Gemini</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
