import React from 'react';

const ResultsTabs = ({
  activeTab,
  onTabChange,
  transcriptionPanelSlot, // Renamed for clarity, expecting JSX/Component
  summaryPanelSlot,       // Renamed for clarity, expecting JSX/Component
  isLoading,              // To disable tab switching during processing
  isSummaryAvailable      // Boolean to indicate if summary content exists (for disabling tab)
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="flex gap-2 p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            activeTab === 'transcript'
              ? 'bg-primary text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
          onClick={() => onTabChange('transcript')}
          disabled={isLoading}
        >
          Transcript
        </button>

        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            activeTab === 'summary'
              ? 'bg-secondary text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
          onClick={() => onTabChange('summary')}
          // Disable summary tab if loading, or if no summary is available yet.
          // App.js has logic to auto-switch to transcript tab if summary is not available during transcription.
          // This disabled state here is a direct UI feedback.
          disabled={isLoading || !isSummaryAvailable && activeTab !== 'summary'}
        >
          Summary
        </button>
      </div>

      {/* Content Area */}
      {/* min-h-[400px] was on the pre/div tags inside the panels in App.js. 
          The panels themselves should manage their own min-height if needed.
          This component just provides the container for the active panel. */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900">
        {activeTab === 'transcript' && transcriptionPanelSlot}
        {activeTab === 'summary' && summaryPanelSlot}
      </div>
    </div>
  );
};

export default ResultsTabs;
