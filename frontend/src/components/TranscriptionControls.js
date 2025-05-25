import React from 'react';
import { Loader2, Settings } from 'lucide-react';

const TranscriptionControls = ({
  onStartTranscription,
  onSummarization,
  onCancelReset,
  onToggleAdvancedOptions,
  isLoading,
  selectedFile,
  transcription, // To enable/disable summarize button
  showAdvancedOptions, // To set text on the toggle button
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
      <h2 className="text-lg font-medium border-b pb-2 border-gray-200 dark:border-gray-700">Transcription Options</h2>
      
      {/* Basic Options - Always visible */}
      <div className="space-y-4">
        {/* Action Buttons */}
        <div className="pt-2 space-y-3">
          <button
            onClick={onStartTranscription}
            disabled={isLoading || !selectedFile}
            className="w-full py-2 px-4 bg-primary hover:bg-blue-600 text-white font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                Processing... 
              </span>
            ) : (
              'Transcribe File'
            )}
          </button>
          
          <button
            onClick={onSummarization}
            disabled={isLoading || !transcription}
            className="w-full py-2 px-4 bg-secondary hover:bg-purple-600 text-white font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Generate Summary
          </button>
          
          <button
            onClick={onCancelReset}
            className="w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-medium rounded-md shadow-sm transition-colors"
          >
            {isLoading ? 'Cancel' : 'Reset'}
          </button>
          
          {/* Advanced Options Toggle */}
          <button 
            onClick={onToggleAdvancedOptions}
            className="w-full py-2 px-4 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium rounded-md shadow-sm transition-colors"
            disabled={isLoading} // Typically, you can still toggle options when not actively processing a file.
                                  // If it should be disabled during any loading, then `isLoading` is correct.
                                  // App.js has it as `disabled={isLoading}`
          >
            <Settings size={16} className="mr-2" />
            {showAdvancedOptions ? 'Hide Advanced Options' : 'Show Advanced Options'}
          </button>
        </div>
      </div>
      {/* Advanced Options Panel will be a separate component and imported by App.js conditionally */}
    </div>
  );
};

export default TranscriptionControls;
