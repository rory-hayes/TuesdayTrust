import { upload } from '@vercel/blob/client';

export async function uploadFileToBlob(pathname: string, file: File) {
  return upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/blob/upload-token',
    multipart: file.size > 8 * 1024 * 1024
  });
}
