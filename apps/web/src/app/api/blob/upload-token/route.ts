import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    return Response.json(
      {
        error: 'BLOB_READ_WRITE_TOKEN is not configured'
      },
      {
        status: 500
      }
    );
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async () => {
        return {
          addRandomSuffix: true,
          allowedContentTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/markdown',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          ],
          maximumSizeInBytes: 50 * 1024 * 1024
        };
      },
      onUploadCompleted: async () => {
        return;
      }
    });

    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create upload token'
      },
      {
        status: 400
      }
    );
  }
}
