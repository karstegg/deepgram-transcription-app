import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

// Helper function (can be moved to a utils.js file later)
const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FileUploadArea = ({ onFileSelect, selectedFile, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dropAreaRef = useRef(null); // Keep ref for direct DOM manipulation if needed, though not strictly necessary with React state

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
    // Optional: Add class directly if preferred over state for minimal re-renders
    // if (dropAreaRef.current) {
    //   dropAreaRef.current.classList.add('border-primary');
    // }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
    // Optional: Remove class directly
    // if (dropAreaRef.current) {
    //   dropAreaRef.current.classList.remove('border-primary');
    // }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    // if (dropAreaRef.current) {
    //   dropAreaRef.current.classList.remove('border-primary');
    // }
    const file = event.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
      // Update the file input for consistency if the parent needs it,
      // though onFileSelect should be the primary way to communicate the file.
      if (fileInputRef.current) {
        fileInputRef.current.files = event.dataTransfer.files;
      }
    }
  };

  const handleAreaClick = () => {
    if (!isLoading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div
      ref={dropAreaRef}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
                  ${isLoading ? 'cursor-not-allowed opacity-70' : 'hover:border-primary dark:hover:border-primary'}
                  ${isDragging ? 'border-primary dark:border-primary bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleAreaClick}
      aria-disabled={isLoading}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*" // Consider making this a prop if it needs to be dynamic
        onChange={handleFileChange}
        disabled={isLoading}
        className="hidden"
        id="fileInput" // Ensure ID is unique if multiple instances, or remove if not needed for labels
      />
      <Upload className={`mx-auto h-12 w-12 ${isDragging ? 'text-primary' : 'text-gray-400'}`} />
      <p className={`mt-2 text-sm font-medium ${isDragging ? 'text-primary' : ''}`}>
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
  );
};

export default FileUploadArea;
