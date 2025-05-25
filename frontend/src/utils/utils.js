/**
 * Formats file size from bytes to a human-readable string (KB, MB, GB).
 * @param {number} bytes - The file size in bytes.
 * @returns {string} A human-readable file size string.
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB']; // Removed 'TB' as it's unlikely for typical web uploads
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  // Ensure 'i' is within the bounds of the 'sizes' array
  const unitIndex = Math.min(i, sizes.length - 1); 
  return parseFloat((bytes / Math.pow(k, unitIndex)).toFixed(2)) + ' ' + sizes[unitIndex];
};
overwrite_file_with_block
frontend/src/components/FileUploadArea.js
import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { formatFileSize } from '../utils/utils'; // Updated import path

const FileUploadArea = ({ onFileSelect, selectedFile, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dropAreaRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
      if (fileInputRef.current) {
        // This ensures that if a file is dropped, the input visually reflects it (though it's hidden)
        // and that subsequent clicks on the drop area to open the dialog don't pre-fill the dropped file.
        // For safety, creating a new DataTransfer object.
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
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
      role="button" // Indicates the div is clickable
      tabIndex={isLoading ? -1 : 0} // Make it focusable when not loading
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAreaClick();}} // Allow activation with Enter/Space
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*"
        onChange={handleFileChange}
        disabled={isLoading}
        className="hidden"
        id="fileInput" 
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
