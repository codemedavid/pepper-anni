// ImageKit client-side upload helper.
//
// Flow:
//   1. GET /api/imagekit-auth -> { token, expire, signature } (signed server-side)
//   2. POST the file directly to ImageKit's upload API with the public key + auth
//   3. ImageKit returns the absolute CDN url (and a fileId) for the stored image
//
// The private key is never used here — only the public key, which is safe to ship.

const IMAGEKIT_PUBLIC_KEY = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY as string | undefined;
const IMAGEKIT_AUTH_ENDPOINT = '/api/imagekit-auth';
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
}

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
}

const fetchAuthParams = async (): Promise<ImageKitAuthParams> => {
  const response = await fetch(IMAGEKIT_AUTH_ENDPOINT);

  if (!response.ok) {
    let message = 'Could not authenticate the upload. Please try again.';
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // response had no JSON body; keep the default message
    }
    throw new Error(message);
  }

  const params = (await response.json()) as Partial<ImageKitAuthParams>;
  if (!params.token || !params.expire || !params.signature) {
    throw new Error('Received an invalid upload signature from the server.');
  }

  return params as ImageKitAuthParams;
};

/**
 * Uploads a file to ImageKit and resolves with its CDN url and fileId.
 *
 * @param file       the image to upload
 * @param fileName   unique file name to store the image under
 * @param folder     ImageKit folder path (e.g. "/payment-proofs")
 * @param onProgress optional 0-100 progress callback (real upload progress)
 */
export const uploadToImageKit = (
  file: File,
  fileName: string,
  folder: string,
  onProgress?: (percent: number) => void
): Promise<ImageKitUploadResult> => {
  if (!IMAGEKIT_PUBLIC_KEY) {
    return Promise.reject(
      new Error('Image upload is not configured. Missing VITE_IMAGEKIT_PUBLIC_KEY.')
    );
  }

  return fetchAuthParams().then(
    ({ token, expire, signature }) =>
      new Promise<ImageKitUploadResult>((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', fileName);
        formData.append('folder', folder);
        formData.append('publicKey', IMAGEKIT_PUBLIC_KEY);
        formData.append('token', token);
        formData.append('expire', String(expire));
        formData.append('signature', signature);
        formData.append('useUniqueFileName', 'false');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', IMAGEKIT_UPLOAD_URL);

        xhr.upload.onprogress = (event) => {
          if (onProgress && event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          let body: any = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            reject(new Error('ImageKit returned an unexpected response.'));
            return;
          }

          if (xhr.status >= 200 && xhr.status < 300 && body?.url) {
            resolve({ url: body.url, fileId: body.fileId });
          } else {
            reject(new Error(body?.message || 'Upload to ImageKit failed.'));
          }
        };

        xhr.onerror = () => reject(new Error('Network error while uploading the image.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Please check your connection and try again.'));
        xhr.timeout = 120000; // 2 minutes — generous for larger images

        xhr.send(formData);
      })
  );
};
