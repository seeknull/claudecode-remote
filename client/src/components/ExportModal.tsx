import { useState } from 'react';
import type { ChatMessage } from '../stores/chatStore';
import { generateSessionPDF, generateFilename, type SessionMetadata, type ExportOptions } from '../utils/pdfExport';
import { shareOrDownloadPDF, canShareFiles } from '../utils/shareUtils';

interface Props {
  sessionId: string;
  sessionLabel: string;
  directory: string;
  createdAt: string;
  messages: ChatMessage[];
  stats?: {
    totalCost?: number;
    totalTokens?: number;
    duration?: number;
  };
  onClose: () => void;
}

export default function ExportModal({
  sessionId,
  sessionLabel,
  directory,
  createdAt,
  messages,
  stats,
  onClose,
}: Props) {
  const [startFromMessageId, setStartFromMessageId] = useState<string | undefined>(undefined);
  const [includeThinking, setIncludeThinking] = useState(false);
  const [includeTools, setIncludeTools] = useState(true);
  const [includeStats, setIncludeStats] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const supportsShare = canShareFiles();

  // Filter to only user and assistant messages for selection
  const selectableMessages = messages.filter(
    m => m.role === 'user' || m.role === 'assistant'
  );

  const handleExport = async (forceDownload: boolean = false) => {
    setIsGenerating(true);
    setError(null);
    setProgress('Generating PDF...');

    try {
      const metadata: SessionMetadata = {
        label: sessionLabel,
        directory,
        createdAt,
        messageCount: messages.length,
        stats,
      };

      const options: ExportOptions = {
        startFromMessageId,
        includeThinking,
        includeTools,
        includeStats,
      };

      // Generate PDF
      const pdfBlob = await generateSessionPDF(metadata, messages, options);

      const filename = generateFilename(sessionLabel);

      if (forceDownload) {
        // Direct download
        setProgress('Downloading...');
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        onClose();
      } else {
        // Share or download
        setProgress('Preparing to share...');
        const result = await shareOrDownloadPDF(pdfBlob, filename, `Claude Code: ${sessionLabel}`);

        if (result.error) {
          setError(result.error);
        } else if (result.cancelled) {
          // User cancelled, just close the modal
          onClose();
        } else {
          // Success - close modal
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Export failed:', err);
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const getMessagePreview = (msg: ChatMessage): string => {
    if (msg.role === 'user') {
      return msg.text?.substring(0, 60) || '[User message]';
    } else if (msg.role === 'assistant') {
      return msg.text?.substring(0, 60) || '[Assistant message]';
    }
    return '[Message]';
  };

  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-gray-700/50 shadow-2xl flex flex-col
                   w-full h-full md:w-[90vw] md:max-w-xl md:h-auto md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-200">Export Session</h3>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0 md:p-1 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 space-y-5">
          {/* Session info */}
          <div className="text-sm">
            <div className="text-gray-400 mb-1">Session: <span className="text-gray-200">{sessionLabel}</span></div>
            <div className="text-gray-400">Messages: <span className="text-gray-200">{messages.length}</span></div>
          </div>

          {/* Message selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Export Range
            </label>
            <select
              value={startFromMessageId || 'all'}
              onChange={(e) => setStartFromMessageId(e.target.value === 'all' ? undefined : e.target.value)}
              disabled={isGenerating}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="all">Export entire session</option>
              {selectableMessages.map((msg, idx) => (
                <option key={msg.id} value={msg.id}>
                  From message {idx + 1}: {truncate(getMessagePreview(msg), 50)}
                </option>
              ))}
            </select>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeThinking}
                onChange={(e) => setIncludeThinking(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
              />
              <span className="text-sm text-gray-300">Include thinking blocks</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTools}
                onChange={(e) => setIncludeTools(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
              />
              <span className="text-sm text-gray-300">Include tool calls</span>
            </label>

            {stats && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStats}
                  onChange={(e) => setIncludeStats(e.target.checked)}
                  disabled={isGenerating}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50"
                />
                <span className="text-sm text-gray-300">Include session statistics</span>
              </label>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-md">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Progress */}
          {isGenerating && progress && (
            <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-md">
              <p className="text-sm text-blue-400">{progress}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-700/50">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-sm text-gray-300 hover:text-gray-100 transition-colors disabled:opacity-50 min-h-[44px] md:min-h-0"
          >
            Cancel
          </button>
          <button
            onClick={() => handleExport(true)}
            disabled={isGenerating || messages.length === 0}
            className="px-4 py-2 bg-gray-700 text-white text-sm rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-h-[44px] md:min-h-0"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </>
            )}
          </button>
          {supportsShare && (
            <button
              onClick={() => handleExport(false)}
              disabled={isGenerating || messages.length === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-h-[44px] md:min-h-0"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
