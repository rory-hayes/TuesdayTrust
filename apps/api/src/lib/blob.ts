export function blobUrlToPathname(blobUrl: string): string {
  try {
    const url = new URL(blobUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return blobUrl;
  }
}
