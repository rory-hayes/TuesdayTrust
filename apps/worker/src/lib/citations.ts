export type CitationInput = {
  kbChunkId: string;
  quote: string;
};

export type CitationRecord = {
  kbChunkId: string;
  docName: string;
  locator: string;
  quote: string;
  sourceFileId?: string;
};

export type RetrievedChunk = {
  id: string;
  text: string;
  chunkIndex: number;
  citationDoc: string | null;
  citationPage: number | null;
  citationParagraph: number | null;
  citationSection: string | null;
  citationSheet: string | null;
  citationCell: string | null;
  kbDocumentId: string;
};

export function buildChunkLocator(chunk: {
  chunkIndex: number;
  citationPage: number | null;
  citationParagraph: number | null;
  citationSection: string | null;
  citationSheet: string | null;
  citationCell: string | null;
}): string {
  if (chunk.citationPage) {
    return `p.${chunk.citationPage}`;
  }

  if (chunk.citationParagraph) {
    return `para ${chunk.citationParagraph}`;
  }

  if (chunk.citationSection) {
    return chunk.citationSection;
  }

  if (chunk.citationSheet && chunk.citationCell) {
    return `${chunk.citationSheet}!${chunk.citationCell}`;
  }

  return `chunk ${chunk.chunkIndex}`;
}

export function validateGeneratedCitations(
  citations: CitationInput[],
  retrievedChunks: RetrievedChunk[]
): { valid: CitationRecord[]; invalidCount: number } {
  const chunkMap = new Map(retrievedChunks.map((chunk) => [chunk.id, chunk]));
  const valid: CitationRecord[] = [];
  let invalidCount = 0;

  for (const citation of citations) {
    const chunk = chunkMap.get(citation.kbChunkId);

    if (!chunk) {
      invalidCount += 1;
      continue;
    }

    const quote = citation.quote.trim();

    if (!quote || !chunk.text.includes(quote)) {
      invalidCount += 1;
      continue;
    }

    valid.push({
      kbChunkId: chunk.id,
      docName: chunk.citationDoc ?? 'KB Document',
      locator: buildChunkLocator(chunk),
      quote,
      ...(chunk.kbDocumentId ? { sourceFileId: chunk.kbDocumentId } : {})
    });
  }

  return {
    valid,
    invalidCount
  };
}
