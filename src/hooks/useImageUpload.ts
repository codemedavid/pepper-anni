import { useState } from 'react';
import { uploadToImageKit } from '../lib/imagekit';

// Max upload size. ImageKit's free-tier per-file limit is 25MB.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Accept all common image extensions. Gallery files on mobile often have an
// empty MIME type, so the extension is the primary signal.
const VALID_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif',
  'svg', 'heic', 'heif', 'ico', 'avif', 'jfif'
];

/**
 * Image upload hook backed by ImageKit storage.
 *
 * The `folder` argument is mapped to an ImageKit folder path (e.g.
 * "menu-images" -> "/menu-images"), preserving every existing call site.
 */
export const useImageUpload = (folder: string = 'menu-images') => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file type — accept any image extension OR image/* MIME type.
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      const hasValidExtension = !!fileExtension && VALID_EXTENSIONS.includes(fileExtension);
      const hasValidMimeType = !file.type || file.type.startsWith('image/');

      if (!hasValidExtension && !hasValidMimeType) {
        throw new Error(
          `Please upload a valid image file. Supported formats: JPG, PNG, WebP, GIF, BMP, TIFF, SVG, HEIC, and more. File type: ${file.type || 'unknown'}, Extension: ${fileExtension || 'none'}`
        );
      }

      // Reject obvious placeholders / empty files.
      if (file.size < 100) {
        throw new Error('The selected file appears to be invalid or empty. Please select a valid image.');
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Image size must be less than 25MB. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`
        );
      }

      // Generate a unique file name and normalize the folder to an ImageKit path.
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension || 'jpg'}`;
      const folderPath = folder.startsWith('/') ? folder : `/${folder}`;

      const { url } = await uploadToImageKit(file, fileName, folderPath, (percent) => {
        setUploadProgress(percent);
      });

      setUploadProgress(100);
      return url;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // Removal clears the image from the UI/record only. Files persist in ImageKit
  // storage (deleting them requires the private key + the stored fileId).
  const deleteImage = async (_imageUrl: string): Promise<void> => {
    return Promise.resolve();
  };

  return {
    uploadImage,
    deleteImage,
    uploading,
    uploadProgress
  };
};
