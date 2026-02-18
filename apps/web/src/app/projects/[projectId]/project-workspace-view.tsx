'use client';

import { Button, EmptyState, ModalShell, PageShell, StatusPill, Table } from '@evidenceq/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  approveAllReady,
  approveQuestion,
  downloadFile,
  editQuestion,
  generateProjectAnswers,
  getProject,
  getQuestion,
  listProjectExports,
  listProjectGaps,
  listProjectQuestions,
  mapProjectColumns,
  queueProjectExport,
  rejectQuestion,
  type AnswerDraftStatus,
  type CitationRecord,
  type ExportFile,
  type GapItem,
  type ProjectDetailResponse,
  type ProjectQuestion,
  type ProjectQuestionCounts,
  type QuestionDetailResponse
} from '../../../lib/api';
import { appNavigation } from '../../../lib/navigation';

type ProjectWorkspaceViewProps = {
  projectId: string;
};

function indexToColumn(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function statusTone(status: AnswerDraftStatus | 'UNANSWERED') {
  if (status === 'APPROVED' || status === 'READY') {
    return 'success' as const;
  }

  if (status === 'INSUFFICIENT_EVIDENCE') {
    return 'warning' as const;
  }

  if (status === 'REJECTED' || status === 'NEEDS_REVIEW') {
    return 'danger' as const;
  }

  return 'neutral' as const;
}

function questionAnswerStatus(question: ProjectQuestion): AnswerDraftStatus | 'UNANSWERED' {
  return question.answerDraft?.status ?? 'UNANSWERED';
}

function parseCitationEditor(input: string): CitationRecord[] {
  const value = input.trim();

  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Citations JSON must be an array');
  }

  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const row = entry as {
        kbChunkId?: unknown;
        docName?: unknown;
        locator?: unknown;
        quote?: unknown;
        sourceFileId?: unknown;
      };

      const kbChunkId = String(row.kbChunkId ?? '').trim();
      const docName = String(row.docName ?? '').trim();
      const locator = String(row.locator ?? '').trim();
      const quote = String(row.quote ?? '').trim();
      const sourceFileId = String(row.sourceFileId ?? '').trim();

      if (!kbChunkId || !quote) {
        return null;
      }

      return {
        kbChunkId,
        docName: docName || 'KB Document',
        locator: locator || 'chunk',
        quote,
        ...(sourceFileId ? { sourceFileId } : {})
      };
    })
    .filter((entry): entry is CitationRecord => Boolean(entry));
}

export function ProjectWorkspaceView({ projectId }: ProjectWorkspaceViewProps) {
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [questions, setQuestions] = useState<ProjectQuestion[]>([]);
  const [counts, setCounts] = useState<ProjectQuestionCounts | null>(null);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [exports, setExports] = useState<ExportFile[]>([]);

  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionDetailResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isMapping, setIsMapping] = useState(false);
  const [isGenerating, setIsGenerating] = useState<'ALL' | 'UNANSWERED' | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isApproveAll, setIsApproveAll] = useState(false);
  const [showGaps, setShowGaps] = useState(false);

  const [sheetName, setSheetName] = useState('');
  const [headerRowIndex, setHeaderRowIndex] = useState(1);
  const [questionCol, setQuestionCol] = useState('A');
  const [answerCol, setAnswerCol] = useState('B');
  const [evidenceCol, setEvidenceCol] = useState('C');

  const [answerEditor, setAnswerEditor] = useState('');
  const [citationsEditor, setCitationsEditor] = useState('[]');

  const loadWorkspace = useCallback(
    async (selectedSheet?: string) => {
      try {
        const [projectResult, questionResult, gapResult, exportResult] = await Promise.all([
          getProject(projectId, selectedSheet),
          listProjectQuestions(projectId),
          listProjectGaps(projectId),
          listProjectExports(projectId)
        ]);

        setDetail(projectResult);
        setQuestions(questionResult.questions);
        setCounts(questionResult.counts);
        setGaps(gapResult.gaps);
        setExports(exportResult.exports);
        setError(null);

        const mappings = projectResult.project.mappings as {
          sheetName?: string;
          headerRowIndex?: number;
          questionCol?: string;
          answerCol?: string;
          evidenceCol?: string;
        } | null;

        setSheetName((current) =>
          String(
            mappings?.sheetName ??
              selectedSheet ??
              projectResult.preview?.selectedSheetName ??
              current ??
              ''
          )
        );
        setHeaderRowIndex((current) => Number(mappings?.headerRowIndex ?? current ?? 1));
        setQuestionCol((current) => String(mappings?.questionCol ?? current ?? 'A'));
        setAnswerCol((current) => String(mappings?.answerCol ?? current ?? 'B'));
        setEvidenceCol((current) => String(mappings?.evidenceCol ?? current ?? 'C'));

        setSelectedQuestionId((current) => {
          if (current && questionResult.questions.some((question) => question.id === current)) {
            return current;
          }

          return questionResult.questions[0]?.id ?? null;
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load project workspace');
      }
    },
    [projectId]
  );

  const loadSelectedQuestion = useCallback(async (questionId: string) => {
    try {
      const result = await getQuestion(questionId);
      setSelectedQuestion(result);
      setAnswerEditor(result.answerDraft?.answerText ?? '');
      setCitationsEditor(JSON.stringify(result.answerDraft?.citationsJson ?? [], null, 2));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load question detail');
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void loadWorkspace()
      .catch(() => {
        return;
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedQuestionId) {
      setSelectedQuestion(null);
      setAnswerEditor('');
      setCitationsEditor('[]');
      return;
    }

    void loadSelectedQuestion(selectedQuestionId);
  }, [loadSelectedQuestion, selectedQuestionId]);

  useEffect(() => {
    const hasActiveJobs =
      detail?.project.parseJobStatus === 'QUEUED' ||
      detail?.project.parseJobStatus === 'RUNNING' ||
      detail?.project.generationJobStatus === 'QUEUED' ||
      detail?.project.generationJobStatus === 'RUNNING' ||
      detail?.project.exportJobStatus === 'QUEUED' ||
      detail?.project.exportJobStatus === 'RUNNING';

    if (!hasActiveJobs) {
      return;
    }

    const timer = setInterval(() => {
      void loadWorkspace(sheetName || undefined);
      if (selectedQuestionId) {
        void loadSelectedQuestion(selectedQuestionId);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [
    detail?.project.exportJobStatus,
    detail?.project.generationJobStatus,
    detail?.project.parseJobStatus,
    loadSelectedQuestion,
    loadWorkspace,
    selectedQuestionId,
    sheetName
  ]);

  const previewColumnOptions = useMemo(() => {
    const firstRow = detail?.preview?.previewRows[0] ?? [];
    const totalColumns = Math.max(3, firstRow.length);

    return Array.from({ length: totalColumns }).map((_, index) => indexToColumn(index));
  }, [detail?.preview?.previewRows]);

  const selectedStatus = selectedQuestion?.answerDraft?.status ?? 'UNANSWERED';

  const handleMapColumns = async () => {
    if (!sheetName || !questionCol || !answerCol || !evidenceCol) {
      setError('Sheet and column mapping fields are required');
      return;
    }

    setIsMapping(true);
    setNotice(null);

    try {
      const result = await mapProjectColumns(projectId, {
        sheetName,
        headerRowIndex,
        questionCol,
        answerCol,
        evidenceCol
      });

      await loadWorkspace(sheetName);
      setNotice(
        result.queued
          ? `Mapped ${result.questionCount} rows and queued parse.`
          : `Mapped ${result.questionCount} rows and parsed successfully.`
      );
    } catch (mapError) {
      setError(mapError instanceof Error ? mapError.message : 'Failed to map columns');
    } finally {
      setIsMapping(false);
    }
  };

  const handleGenerate = async (mode: 'ALL' | 'UNANSWERED') => {
    setIsGenerating(mode);
    setNotice(null);

    try {
      const response = await generateProjectAnswers(projectId, { mode });
      await loadWorkspace(sheetName || undefined);
      setNotice(`Queued answer generation (${response.mode}).`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Failed to queue answer generation');
    } finally {
      setIsGenerating(null);
    }
  };

  const handleSaveEdits = async () => {
    if (!selectedQuestionId) {
      return;
    }

    setIsSavingEdit(true);
    setNotice(null);

    try {
      const citations = parseCitationEditor(citationsEditor);
      await editQuestion(selectedQuestionId, {
        answerText: answerEditor,
        citationsJson: citations
      });
      await loadWorkspace(sheetName || undefined);
      await loadSelectedQuestion(selectedQuestionId);
      setNotice('Draft saved. Approval still requires valid citations.');
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Failed to save edits');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedQuestionId) {
      return;
    }

    setIsApproving(true);
    setNotice(null);

    try {
      await approveQuestion(selectedQuestionId);
      await loadWorkspace(sheetName || undefined);
      await loadSelectedQuestion(selectedQuestionId);
      setNotice('Answer approved.');
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Failed to approve answer');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedQuestionId) {
      return;
    }

    setIsRejecting(true);
    setNotice(null);

    try {
      await rejectQuestion(selectedQuestionId);
      await loadWorkspace(sheetName || undefined);
      await loadSelectedQuestion(selectedQuestionId);
      setNotice('Answer rejected.');
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'Failed to reject answer');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setNotice(null);

    try {
      await queueProjectExport(projectId);
      await loadWorkspace(sheetName || undefined);
      setNotice('Export job queued. Refresh to see completed file.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to queue export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleApproveAllReady = async () => {
    setIsApproveAll(true);
    setNotice(null);

    try {
      const result = await approveAllReady(projectId);
      await loadWorkspace(sheetName || undefined);
      setNotice(`Approved ${result.approved} ready answers (${result.skipped} skipped).`);
    } catch (approveAllError) {
      setError(approveAllError instanceof Error ? approveAllError.message : 'Failed to approve ready answers');
    } finally {
      setIsApproveAll(false);
    }
  };

  const subtitle = detail
    ? `Status: ${detail.project.status} • Questions: ${counts?.total ?? 0} • Gaps: ${gaps.length}`
    : 'Loading project workspace...';

  const citations = selectedQuestion?.answerDraft?.citationsJson ?? [];
  const activeProgressSummary = detail
    ? [
        detail.project.parseJobStatus === 'RUNNING' || detail.project.parseJobStatus === 'QUEUED'
          ? `Parsing ${detail.project.parseProgress}%`
          : null,
        detail.project.generationJobStatus === 'RUNNING' ||
        detail.project.generationJobStatus === 'QUEUED'
          ? `Generating ${detail.project.generationProgress}%`
          : null,
        detail.project.exportJobStatus === 'RUNNING' || detail.project.exportJobStatus === 'QUEUED'
          ? `Exporting ${detail.project.exportProgress}%`
          : null
      ]
        .filter(Boolean)
        .join(' • ')
    : '';

  const projectErrorMessage =
    detail?.project.errorJson && typeof detail.project.errorJson === 'object'
      ? String((detail.project.errorJson as { message?: unknown }).message ?? '')
      : '';

  return (
    <PageShell
      activeHref={`/projects/${projectId}`}
      navItems={appNavigation}
      subtitle={subtitle}
      title={detail ? `Project: ${detail.project.name}` : `Project: ${projectId}`}
    >
      {error ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {activeProgressSummary ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {activeProgressSummary}
        </div>
      ) : null}

      {projectErrorMessage ? (
        <div className="mb-4 rounded-[var(--eq-radius-md)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Latest job error: {projectErrorMessage}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill label={`Unanswered ${counts?.unanswered ?? 0}`} tone="neutral" />
        <StatusPill label={`Ready ${counts?.byAnswerStatus.READY ?? 0}`} tone="success" />
        <StatusPill label={`Needs Review ${counts?.byAnswerStatus.NEEDS_REVIEW ?? 0}`} tone="danger" />
        <StatusPill
          label={`Insufficient ${counts?.byAnswerStatus.INSUFFICIENT_EVIDENCE ?? 0}`}
          tone="warning"
        />
        <StatusPill label={`Approved ${counts?.byAnswerStatus.APPROVED ?? 0}`} tone="success" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button disabled={Boolean(isGenerating)} onClick={() => void handleGenerate('UNANSWERED')}>
          {isGenerating === 'UNANSWERED' ? 'Generating...' : 'Generate Unanswered'}
        </Button>
        <Button disabled={Boolean(isGenerating)} onClick={() => void handleGenerate('ALL')} variant="secondary">
          {isGenerating === 'ALL' ? 'Generating...' : 'Generate All'}
        </Button>
        <Button disabled={isApproveAll} onClick={() => void handleApproveAllReady()} variant="ghost">
          {isApproveAll ? 'Approving...' : 'Approve All Ready'}
        </Button>
        <Button disabled={isExporting} onClick={() => void handleExport()} variant="secondary">
          {isExporting ? 'Queueing export...' : 'Export XLSX'}
        </Button>
        <Button onClick={() => setShowGaps(true)} variant="ghost">
          View Gaps ({gaps.length})
        </Button>
      </div>

      {exports.length > 0 ? (
        <div className="mb-4">
          <Table
            columns={[
              { header: 'Export', key: 'filename' },
              {
                header: 'Created',
                key: 'createdAt',
                render: (row) => new Date(row.createdAt).toLocaleString()
              },
              {
                header: 'Download',
                key: 'download',
                render: (row) => (
                  <button
                    className="text-[var(--eq-color-accent-strong)] underline"
                    onClick={() => void downloadFile(row.id, row.filename)}
                    type="button"
                  >
                    Download
                  </button>
                )
              }
            ]}
            getRowKey={(row) => row.id}
            rows={exports}
          />
        </div>
      ) : null}

      {detail ? (
        <div className="mb-4 rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-4">
          <h2 className="text-sm font-semibold">Column Mapping (XLSX)</h2>
          <p className="mt-1 text-sm text-[var(--eq-color-fg-muted)]">
            Required once per project. Map question, answer, and evidence columns.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--eq-color-fg-muted)]">Sheet</span>
              <select
                className="h-10 w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] px-3 text-sm"
                onChange={(event) => {
                  setSheetName(event.target.value);
                  void loadWorkspace(event.target.value);
                }}
                value={sheetName || detail.preview?.selectedSheetName || ''}
              >
                {(detail.preview?.sheetNames ?? []).map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--eq-color-fg-muted)]">Header Row</span>
              <input
                className="h-10 w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] px-3 text-sm"
                min={1}
                onChange={(event) => setHeaderRowIndex(Number(event.target.value || 1))}
                type="number"
                value={String(headerRowIndex)}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--eq-color-fg-muted)]">Question Col</span>
              <select
                className="h-10 w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] px-3 text-sm"
                onChange={(event) => setQuestionCol(event.target.value)}
                value={questionCol}
              >
                {previewColumnOptions.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--eq-color-fg-muted)]">Answer Col</span>
              <select
                className="h-10 w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] px-3 text-sm"
                onChange={(event) => setAnswerCol(event.target.value)}
                value={answerCol}
              >
                {previewColumnOptions.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--eq-color-fg-muted)]">Evidence Col</span>
              <select
                className="h-10 w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] px-3 text-sm"
                onChange={(event) => setEvidenceCol(event.target.value)}
                value={evidenceCol}
              >
                {previewColumnOptions.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <Button disabled={isMapping || isLoading} onClick={() => void handleMapColumns()}>
              {isMapping ? 'Mapping...' : 'Save Mapping'}
            </Button>
          </div>
        </div>
      ) : null}

      {detail?.preview ? (
        <div className="mb-4 rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-4">
          <h2 className="text-sm font-semibold">Sheet Preview (first 10 rows)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <tbody>
                {detail.preview.previewRows.map((row, rowIndex) => (
                  <tr key={`preview-${rowIndex}`}>
                    {row.map((cell, columnIndex) => (
                      <td
                        className="border border-[var(--eq-color-border)] px-2 py-1 align-top"
                        key={`preview-cell-${rowIndex}-${columnIndex}`}
                      >
                        {cell || ' '}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <EmptyState
          description="Map columns and parse the XLSX to create question rows."
          title="No project questions yet"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-3">
            <h2 className="mb-3 text-sm font-semibold">Questions</h2>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {questions.map((question) => {
                const status = questionAnswerStatus(question);
                const isSelected = question.id === selectedQuestionId;

                return (
                  <button
                    className={`w-full rounded-[var(--eq-radius-md)] border px-3 py-2 text-left transition ${
                      isSelected
                        ? 'border-[var(--eq-color-accent)] bg-[var(--eq-color-surface-alt)]'
                        : 'border-[var(--eq-color-border)] hover:bg-[var(--eq-color-surface-alt)]'
                    }`}
                    key={question.id}
                    onClick={() => setSelectedQuestionId(question.id)}
                    type="button"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--eq-color-fg-muted)]">Row {question.rowIndex}</span>
                      <StatusPill label={status} tone={statusTone(status)} />
                    </div>
                    <p className="line-clamp-3 text-sm text-[var(--eq-color-fg)]">{question.questionText}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-4">
            {selectedQuestion ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Question Detail (Row {selectedQuestion.question.rowIndex})</h2>
                  <StatusPill label={selectedStatus} tone={statusTone(selectedStatus)} />
                </div>

                <p className="mb-4 rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface-alt)] p-3 text-sm">
                  {selectedQuestion.question.questionText}
                </p>

                <label className="mb-2 block text-sm font-medium">Answer</label>
                <textarea
                  className="mb-4 min-h-[140px] w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-white px-3 py-2 text-sm"
                  onChange={(event) => setAnswerEditor(event.target.value)}
                  placeholder="Draft answer text..."
                  value={answerEditor}
                />

                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium">Citations JSON</label>
                  <span className="text-xs text-[var(--eq-color-fg-muted)]">
                    Required for approval. quote must match source chunk text.
                  </span>
                </div>
                <textarea
                  className="mb-4 min-h-[140px] w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-white px-3 py-2 font-mono text-xs"
                  onChange={(event) => setCitationsEditor(event.target.value)}
                  value={citationsEditor}
                />

                <div className="mb-4 rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface-alt)] p-3">
                  <h3 className="mb-2 text-sm font-medium">Citation Preview</h3>
                  {citations.length === 0 ? (
                    <p className="text-sm text-[var(--eq-color-fg-muted)]">No citations attached to this draft.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {citations.map((citation) => {
                        const sourceFileId = citation.sourceFileId;

                        return (
                          <li
                            className="rounded-[var(--eq-radius-sm)] border border-[var(--eq-color-border)] bg-white p-2"
                            key={`${citation.kbChunkId}-${citation.quote}`}
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="font-medium">{citation.docName}</span>
                              <span className="text-[var(--eq-color-fg-muted)]">{citation.locator}</span>
                              {sourceFileId ? (
                                <button
                                  className="text-[var(--eq-color-accent-strong)] underline"
                                  onClick={() => void downloadFile(sourceFileId, citation.docName)}
                                  type="button"
                                >
                                  View source
                                </button>
                              ) : null}
                            </div>
                            <p className="text-[var(--eq-color-fg-muted)]">{citation.quote}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={isSavingEdit} onClick={() => void handleSaveEdits()}>
                    {isSavingEdit ? 'Saving...' : 'Save edits'}
                  </Button>
                  <Button disabled={isApproving} onClick={() => void handleApprove()} variant="secondary">
                    {isApproving ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button disabled={isRejecting} onClick={() => void handleReject()} variant="ghost">
                    {isRejecting ? 'Rejecting...' : 'Reject'}
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState
                description="Select a question from the left panel to review answer drafts and citations."
                title="No question selected"
              />
            )}
          </section>
        </div>
      )}

      <ModalShell
        description="Questions currently marked as insufficient evidence."
        isOpen={showGaps}
        title={`Gap List (${gaps.length})`}
      >
        <div className="space-y-3">
          <div className="max-h-[60vh] overflow-y-auto">
            {gaps.length === 0 ? (
              <p className="text-sm text-[var(--eq-color-fg-muted)]">No gaps recorded for this project.</p>
            ) : (
              <Table
                columns={[
                  {
                    header: 'Question',
                    key: 'question',
                    render: (row) => `Row ${row.questionItem.rowIndex}: ${row.questionItem.questionText}`
                  },
                  { header: 'Status', key: 'status' },
                  {
                    header: 'Suggested Missing Artifact',
                    key: 'suggestedMissingArtifact',
                    render: (row) => row.suggestedMissingArtifact || 'N/A'
                  }
                ]}
                getRowKey={(row) => row.id}
                rows={gaps}
              />
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowGaps(false)} variant="ghost">
              Close
            </Button>
          </div>
        </div>
      </ModalShell>
    </PageShell>
  );
}
