/* eslint-disable pixel-agents/pixel-font, pixel-agents/no-inline-colors */
import { useEffect, useRef, useState } from 'react';

export interface PastDeed {
  id: string;
  timestamp: number;
  task: string;
  order: string;
  fileName: string;
  fullPath: string;
  fileSize: number;
  summary: string;
}

export interface EmployeeWorkspaceInfo {
  employeeName: string;
  role: string;
  assignedFolder: string;
  fullPath: string;
  exists: boolean;
  files: Array<{ name: string; isDir: boolean; size: number; ext: string; updatedAt: number }>;
  pastDeeds: PastDeed[];
}

export interface WorkspaceTreeResult {
  currentPath: string;
  parentPath: string | null;
  folders: string[];
  files: Array<{ name: string; size: number; ext: string; updatedAt: number }>;
}

// ── Centralised typography & spacing constants ──────────────────────────────
const F = 'system-ui, -apple-system, Segoe UI, sans-serif';

const S: Record<string, React.CSSProperties> = {
  // Header
  headerTitle: {
    fontFamily: F,
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--color-accent-bright)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  headerSub: { fontFamily: F, fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 },
  // Section labels
  sectionLabel: {
    fontFamily: F,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  // Employee cards
  cardName: { fontFamily: F, fontSize: 15, fontWeight: 700 },
  cardPath: { fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-muted)' },
  cardDeeds: { fontFamily: F, fontSize: 13, color: 'var(--color-accent-bright)' },
  // Active employee
  empName: { fontFamily: F, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' },
  roleBadge: {
    fontFamily: F,
    fontSize: 13,
    padding: '3px 10px',
    background: 'rgba(96,48,255,0.2)',
    color: 'var(--color-accent-bright)',
    border: '1px solid rgba(96,48,255,0.45)',
    borderRadius: 4,
  },
  setFolderBtn: {
    fontFamily: F,
    fontSize: 13,
    color: 'var(--color-accent-bright)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
  },
  // Path row
  pathText: { fontFamily: 'monospace', fontSize: 14, color: 'var(--color-text-muted)' },
  pathValue: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-accent-bright)',
  },
  parentBtn: {
    fontFamily: F,
    fontSize: 13,
    padding: '4px 10px',
    cursor: 'pointer',
    borderRadius: 3,
  },
  // Subfolder chips
  folderChip: {
    fontFamily: F,
    fontSize: 14,
    padding: '5px 12px',
    cursor: 'pointer',
    borderRadius: 3,
  },
  // File rows
  fileName: { fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: 'var(--color-text)' },
  fileSize: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
    marginLeft: 8,
  },
  // File section heading
  fileCount: { fontFamily: F, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' },
  // Past deeds
  deedHeading: {
    fontFamily: F,
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--color-accent-bright)',
  },
  deedFile: { fontFamily: F, fontSize: 14, fontWeight: 700, color: 'var(--color-text)' },
  deedTask: { fontFamily: F, fontSize: 14, color: 'var(--color-accent-bright)', lineHeight: 1.5 },
  deedPath: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: 'var(--color-text-muted)',
    lineHeight: 1.4,
  },
  deedSummary: {
    fontFamily: F,
    fontSize: 13,
    color: 'var(--color-text-muted)',
    lineHeight: 1.6,
    opacity: 0.85,
  },
  deedTime: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
  },
  // Tabs
  tabLabel: {
    writingMode: 'vertical-lr' as const,
    fontFamily: F,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--color-accent-bright)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  tabCount: { fontFamily: F, fontSize: 13, color: 'var(--color-text-muted)' },
  // Input
  customInput: {
    fontFamily: 'monospace',
    fontSize: 14,
    padding: '8px 12px',
    color: 'var(--color-text)',
    background: 'var(--color-bg-dark)',
    border: '1px solid var(--color-border)',
    outline: 'none',
    flex: 1,
  },
  customSetBtn: {
    fontFamily: F,
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 14px',
    cursor: 'pointer',
    background: 'var(--color-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 2,
  },
  // Memory badge
  memoryBadge: {
    fontFamily: F,
    fontSize: 13,
    padding: '3px 9px',
    background: 'rgba(34,197,94,0.15)',
    color: 'rgb(134,239,172)',
    border: '1px solid rgba(34,197,94,0.35)',
    borderRadius: 4,
  },
  memoryHint: { fontFamily: F, fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 },
  // empty state
  empty: { fontFamily: F, fontSize: 14, color: 'var(--color-text-muted)', fontStyle: 'italic' },
};

// ───────────────────────────────────────────────────────────────────────────

export function EmployeeWorkspaceSidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [workspaces, setWorkspaces] = useState<EmployeeWorkspaceInfo[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('JACK');
  const [currentTree, setCurrentTree] = useState<WorkspaceTreeResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isAssigningCustom, setIsAssigningCustom] = useState(false);
  const [customPathInput, setCustomPathInput] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  // Ref so the live-refresh listener can read current state without stale closure
  const activeWsRef = useRef<EmployeeWorkspaceInfo | undefined>(undefined);

  const token = new URLSearchParams(window.location.search).get('token') || '';
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchWorkspaces = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/employee/workspaces', { headers: authHeaders });
      if (res.ok) {
        const data: EmployeeWorkspaceInfo[] = await res.json();
        setWorkspaces(data);
        if (data.length > 0 && !data.some((w) => w.employeeName === selectedEmployee)) {
          setSelectedEmployee(data[0].employeeName);
        }
      }
    } catch (err) {
      console.error('[Workspaces] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTree = async (subpath: string) => {
    try {
      const res = await fetch(`/api/workspace/tree?subpath=${encodeURIComponent(subpath)}`, {
        headers: authHeaders,
      });
      if (res.ok) setCurrentTree(await res.json());
    } catch (err) {
      console.error('[Tree] Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const activeWs = workspaces.find((w) => w.employeeName === selectedEmployee) || workspaces[0];
  activeWsRef.current = activeWs;

  useEffect(() => {
    if (activeWs) fetchTree(activeWs.assignedFolder);
  }, [selectedEmployee, activeWs?.assignedFolder]);

  // ── Live auto-refresh: listen for task-completion messages ─────────────────
  useEffect(() => {
    const doRefresh = async () => {
      // Silently refresh workspaces (deeds + files) and current tree
      try {
        const res = await fetch('/api/employee/workspaces', {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const data: EmployeeWorkspaceInfo[] = await res.json();
          setWorkspaces(data);
          setLastUpdated(Date.now());
        }
      } catch {
        /* ignore */
      }

      // Refresh the current folder tree for the active employee
      const current = activeWsRef.current;
      if (current) {
        try {
          const res2 = await fetch(
            `/api/workspace/tree?subpath=${encodeURIComponent(current.assignedFolder)}`,
            {
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            },
          );
          if (res2.ok) setCurrentTree(await res2.json());
        } catch {
          /* ignore */
        }
      }
    };

    // Listen to the same window postMessage bus that App.tsx uses
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        // Employee task completion (file written or command run)
        if (
          (msg?.type === 'intercomMessage' && msg?.message?.role === 'employee') ||
          (msg?.type === 'agentSpeech' && msg?.role !== 'boss' && msg?.role !== 'director')
        ) {
          // Small delay to let the server flush the deed to disk before we re-fetch
          setTimeout(() => {
            void doRefresh();
          }, 600);
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('message', onMessage);

    // Polling fallback: refresh every 4 s regardless (catches server-side writes
    // that don't produce a postMessage event, e.g. manual file drops).
    const poll = setInterval(() => {
      void doRefresh();
    }, 4000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAssignFolder = async (folderPath: string) => {
    if (!activeWs) return;
    try {
      setFeedback(`Assigning ${activeWs.employeeName} to ${folderPath || 'root'}…`);
      const res = await fetch('/api/employee/assign-folder', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          employeeName: activeWs.employeeName,
          folderPath: folderPath || '.',
        }),
      });
      if (res.ok) {
        setFeedback(`✅ Moved ${activeWs.employeeName} → [${folderPath || 'root'}]`);
        await fetchWorkspaces();
        await fetchTree(folderPath || '.');
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch (err) {
      setFeedback(`⚠️ Failed: ${(err as Error).message}`);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleEnterChild = (child: string) => {
    const cur = currentTree?.currentPath || '';
    handleAssignFolder(cur ? `${cur}/${child}` : child);
  };

  const handleGoToParent = () => {
    if (currentTree?.parentPath !== null && currentTree?.parentPath !== undefined)
      handleAssignFolder(currentTree.parentPath);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024,
      sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (ext: string) => {
    const m: Record<string, string> = {
      '.ino': '⚡',
      '.py': '🐍',
      '.ts': '📘',
      '.tsx': '📘',
      '.js': '📜',
      '.jsx': '📜',
      '.css': '🎨',
      '.html': '🌐',
      '.json': '📋',
      '.md': '📝',
      '.cpp': '💻',
      '.c': '💻',
      '.rs': '💻',
    };
    return m[ext] ?? '📄';
  };

  const getEmployeeIcon = (ws: EmployeeWorkspaceInfo) => {
    if (/boss/i.test(ws.employeeName) || /boss/i.test(ws.role)) return '👑';
    if (/frontend/i.test(ws.role)) return '🎨';
    if (/backend/i.test(ws.role)) return '⚙️';
    if (/fullstack/i.test(ws.role)) return '🔥';
    return '💻';
  };

  return (
    <>
      {/* ── Collapsed tab ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-24 left-0 z-40 pixel-panel py-4 px-2.5 bg-bg/95 backdrop-blur-md border-r-2 border-y-2 border-accent shadow-pixel hover:border-accent-bright flex flex-col items-center gap-2 cursor-pointer transition-all duration-150 rounded-r-md"
          title="Open Employee Workspace Explorer"
        >
          <span style={{ fontSize: 20 }} className="animate-pulse">
            📁
          </span>
          <span style={S.tabLabel} className="select-none">
            Workspaces
          </span>
          <span style={S.tabCount} className="select-none">
            ({workspaces.length})
          </span>
        </button>
      )}

      {/* ── Full left panel ── */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-40 flex flex-col bg-bg/98 backdrop-blur-md border-r-2 border-border shadow-2xl transition-all duration-200 ease-in-out pointer-events-auto ${
          isOpen
            ? 'w-[360px] translate-x-0'
            : 'w-0 -translate-x-full overflow-hidden pointer-events-none'
        }`}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b-2 border-border bg-bg-dark/90 select-none"
          style={{ padding: '12px 16px' }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ fontSize: 22 }}>📁</span>
            <div>
              <div style={S.headerTitle}>Workspaces &amp; Folders</div>
              <div className="flex items-center" style={{ gap: 8, marginTop: 3 }}>
                <span style={S.headerSub}>Assign Employees &amp; Context</span>
                {/* Live indicator — pulses green when auto-refresh is active */}
                <span
                  title={
                    lastUpdated
                      ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString()}`
                      : 'Auto-refresh active'
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: F,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'rgb(134,239,172)',
                    letterSpacing: '0.06em',
                    padding: '2px 6px',
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: 3,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'rgb(74,222,128)',
                      display: 'inline-block',
                      animation: 'pulse 2s infinite',
                    }}
                  />
                  LIVE
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 8 }}>
            <button
              onClick={() => {
                fetchWorkspaces();
                if (activeWs) fetchTree(activeWs.assignedFolder);
              }}
              disabled={isLoading}
              title="Refresh"
              className={`text-text-muted hover:text-text border border-border/40 hover:border-border rounded cursor-pointer ${isLoading ? 'opacity-50 animate-spin' : ''}`}
              style={{ fontSize: 16, padding: '4px 8px' }}
            >
              🔄
            </button>
            <button
              onClick={() => setIsOpen(false)}
              title="Collapse"
              className="text-text-muted hover:text-accent-bright border border-border/40 hover:border-accent rounded cursor-pointer font-bold"
              style={{ fontSize: 15, padding: '4px 8px' }}
            >
              ◀
            </button>
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className="border-b border-accent bg-bg-dark"
            style={{
              padding: '8px 16px',
              fontFamily: F,
              fontSize: 14,
              color: 'var(--color-accent-bright)',
            }}
          >
            {feedback}
          </div>
        )}

        {/* Employee selector */}
        <div
          className="border-b border-border/60 bg-bg-dark/50 flex flex-col"
          style={{ padding: '12px 14px', gap: 10 }}
        >
          <div className="flex items-center justify-between" style={S.sectionLabel}>
            <span>Team Members</span>
            <span style={{ fontWeight: 400, color: 'var(--color-accent-bright)', fontSize: 13 }}>
              click to select
            </span>
          </div>
          <div className="grid grid-cols-2" style={{ gap: 8 }}>
            {workspaces.map((ws) => {
              const isSelected = ws.employeeName === selectedEmployee;
              return (
                <button
                  key={ws.employeeName}
                  onClick={() => setSelectedEmployee(ws.employeeName)}
                  className={`border text-left flex flex-col cursor-pointer rounded-xs transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/20 text-white shadow-xs'
                      : 'border-border/60 bg-bg hover:bg-bg-dark hover:border-border text-text'
                  }`}
                  style={{ padding: '10px 12px', gap: 5 }}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center truncate" style={{ gap: 6 }}>
                      <span style={{ fontSize: 16 }}>{getEmployeeIcon(ws)}</span>
                      <span style={S.cardName} className="truncate">
                        {ws.employeeName}
                      </span>
                    </span>
                    {isSelected && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--color-accent-bright)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between" style={{ gap: 4 }}>
                    <span style={S.cardPath} className="truncate">
                      {ws.assignedFolder || 'root'}
                    </span>
                    <span style={S.cardDeeds}>{ws.pastDeeds.length} deeds</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active workspace view */}
        {activeWs && (
          <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-border/60">
            {/* Employee header + path + subfolders */}
            <div className="bg-bg-dark/30 flex flex-col" style={{ padding: '14px 16px', gap: 12 }}>
              {/* Name + role + set folder button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={S.empName}>{activeWs.employeeName}</span>
                  <span style={S.roleBadge}>{activeWs.role}</span>
                </div>
                <button
                  onClick={() => setIsAssigningCustom(!isAssigningCustom)}
                  style={S.setFolderBtn}
                >
                  {isAssigningCustom ? 'Cancel' : '✏️ Set Folder'}
                </button>
              </div>

              {/* Custom path input */}
              {isAssigningCustom && (
                <div
                  className="flex items-center bg-bg border border-accent rounded-sm"
                  style={{ gap: 8, padding: 8 }}
                >
                  <input
                    type="text"
                    value={customPathInput}
                    onChange={(e) => setCustomPathInput(e.target.value)}
                    placeholder="e.g. server/src or JACK/tests"
                    style={S.customInput}
                  />
                  <button
                    onClick={() => {
                      if (customPathInput.trim()) {
                        handleAssignFolder(customPathInput.trim());
                        setIsAssigningCustom(false);
                        setCustomPathInput('');
                      }
                    }}
                    style={S.customSetBtn}
                  >
                    Set
                  </button>
                </div>
              )}

              {/* Current path + parent navigation */}
              <div
                className="bg-bg-dark border border-border/80 rounded-sm flex flex-col"
                style={{ padding: '10px 12px', gap: 8 }}
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span style={S.pathText}>📂 </span>
                    <span style={S.pathValue}>
                      /{currentTree?.currentPath || activeWs.assignedFolder || 'root'}
                    </span>
                  </span>
                  {currentTree?.parentPath !== null && currentTree?.parentPath !== undefined && (
                    <button
                      onClick={handleGoToParent}
                      className="bg-border/50 hover:bg-accent/40 hover:text-white text-text rounded flex items-center cursor-pointer transition-colors"
                      style={{ ...S.parentBtn, gap: 4 }}
                    >
                      ⬆ Parent (..)
                    </button>
                  )}
                </div>

                {/* Subfolders */}
                {currentTree && currentTree.folders.length > 0 && (
                  <div
                    className="flex flex-col pt-6 border-t border-border/40"
                    style={{ gap: 8, paddingTop: 10 }}
                  >
                    <span style={S.sectionLabel}>Subfolders</span>
                    <div className="flex flex-wrap" style={{ gap: 6 }}>
                      {currentTree.folders.map((folder) => (
                        <button
                          key={folder}
                          onClick={() => handleEnterChild(folder)}
                          className="bg-bg border border-border/70 hover:border-accent hover:text-accent-bright flex items-center cursor-pointer transition-all rounded-xs"
                          style={{ ...S.folderChip, gap: 5 }}
                        >
                          📁 {folder}/
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Files list */}
            <div className="flex flex-col" style={{ padding: '14px 16px', gap: 10 }}>
              <div className="flex items-center justify-between select-none">
                <span style={S.fileCount}>
                  📄 Files in Workspace
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                      marginLeft: 6,
                    }}
                  >
                    ({currentTree?.files.length || 0})
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {currentTree?.currentPath ? `/${currentTree.currentPath}` : '/root'}
                </span>
              </div>

              <div className="flex flex-col overflow-y-auto" style={{ gap: 5, maxHeight: 240 }}>
                {(!currentTree || currentTree.files.length === 0) && (
                  <div
                    className="py-12 text-center border border-dashed border-border/40 rounded"
                    style={S.empty}
                  >
                    Folder is clean. No files yet.
                  </div>
                )}
                {currentTree?.files.map((file) => (
                  <div
                    key={file.name}
                    className="bg-bg-dark/60 border border-border/50 hover:border-border rounded-xs flex items-center justify-between"
                    style={{ padding: '8px 12px' }}
                  >
                    <div className="flex items-center truncate" style={{ gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{getFileIcon(file.ext)}</span>
                      <span style={S.fileName} className="truncate">
                        {file.name}
                      </span>
                    </div>
                    <span style={S.fileSize}>{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Past deeds */}
            <div className="flex flex-col flex-1" style={{ padding: '14px 16px', gap: 10 }}>
              <div className="flex items-center justify-between select-none">
                <span style={S.deedHeading}>
                  🧠 Past Deeds &amp; Context
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                      marginLeft: 6,
                    }}
                  >
                    ({activeWs.pastDeeds.length})
                  </span>
                </span>
                <span style={S.memoryBadge}>Memory Active</span>
              </div>

              <div style={S.memoryHint}>
                These deeds are fed as context to Gemini when {activeWs.employeeName} gets a task.
              </div>

              <div
                className="flex flex-col overflow-y-auto"
                style={{ gap: 8, flex: 1, maxHeight: 360 }}
              >
                {activeWs.pastDeeds.length === 0 && (
                  <div
                    className="py-16 text-center border border-dashed border-border/40 rounded"
                    style={S.empty}
                  >
                    No past deeds recorded yet.
                    <br />
                    Order this employee to start building history!
                  </div>
                )}
                {activeWs.pastDeeds.map((deed) => (
                  <div
                    key={deed.id}
                    className="bg-bg-dark/70 border border-border/60 rounded-xs flex flex-col"
                    style={{ padding: '12px 14px', gap: 6 }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={S.deedFile} className="truncate">
                        📄 {deed.fileName}
                      </span>
                      <span style={S.deedTime}>
                        {new Date(deed.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div style={S.deedTask}>Task: "{deed.task}"</div>
                    <div style={S.deedPath} className="truncate">
                      📂 {deed.fullPath}
                    </div>
                    {deed.summary && <div style={S.deedSummary}>{deed.summary}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
