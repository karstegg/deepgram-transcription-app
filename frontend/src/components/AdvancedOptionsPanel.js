import React from 'react';
import { Sun, Moon } from 'lucide-react'; // For theme toggle

const AdvancedOptionsPanel = ({
  // Theme options
  darkMode,
  onToggleDarkMode,

  // Model selection
  selectedModel,
  onModelChange,
  availableModels,
  isLoading, 
  isGeminiModel, // To conditionally show/hide chunk size & modify text

  // Chunk size
  selectedChunkSize,
  onChunkSizeChange,
  chunkSizes,

  // Feature toggles
  enableDiarization,
  onDiarizationChange,
  enableSummarization, // This is the "Generate Summary" checkbox in advanced options
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
          disabled={isLoading} // Disable theme toggle during processing
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
          {availableModels.map(model => (
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
            {chunkSizes.map(size => (
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
