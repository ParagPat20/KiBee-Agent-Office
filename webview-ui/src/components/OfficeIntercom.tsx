import { useEffect, useRef, useState } from 'react';

import { Button } from './ui/Button.js';

export interface IntercomMessage {
  id: string;
  sender: string;
  role: 'boss' | 'employee' | 'director';
  text: string;
  timestamp: number;
}

interface OfficeIntercomProps {
  messages: IntercomMessage[];
  onSendMessage: (text: string) => void;
  onClearMessages: () => void;
  isSending?: boolean;
}

const S: Record<string, React.CSSProperties> = {
  font: { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' },
  headerTitle: { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--color-accent-bright)' },
  headerSub: { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 },
  msgCount: { fontFamily: 'system-ui, sans-serif', fontSize: 13, padding: '3px 8px', background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-muted)', borderRadius: 4 },
  btnClear: { fontFamily: 'system-ui, sans-serif', fontSize: 13, padding: '4px 10px', cursor: 'pointer' },
  btnCollapse: { fontFamily: 'system-ui, sans-serif', fontSize: 15, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 },
  emptyTitle: { fontSize: 15, fontFamily: 'system-ui, sans-serif' },
  emptySub: { fontSize: 14, fontFamily: 'system-ui, sans-serif', opacity: 0.75 },
  msgSender: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 700 },
  msgTime: { fontFamily: 'monospace', fontSize: 12, opacity: 0.65, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  msgBody: { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 15, lineHeight: 1.65, wordBreak: 'break-word', whiteSpace: 'pre-wrap', color: 'var(--color-text)', paddingLeft: 4 },
  inputBox: { fontFamily: 'system-ui, sans-serif', fontSize: 15, padding: '10px 14px', color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', outline: 'none', flex: 1 },
  inputHint: { fontFamily: 'system-ui, sans-serif', fontSize: 13, color: 'var(--color-text-muted)', padding: '0 2px' },
  tabLabel: { writingMode: 'vertical-rl' as const, fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--color-accent-bright)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  tabCount: { fontFamily: 'system-ui, sans-serif', fontSize: 13, color: 'var(--color-text-muted)' },
};

export function OfficeIntercom({
  messages,
  onSendMessage,
  onClearMessages,
  isSending = false,
}: OfficeIntercomProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      if (!isOpen) setHasUnread(true);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages.length, isOpen]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const handleToggle = () => {
    if (!isOpen) setHasUnread(false);
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      {/* ── Collapsed tab ── */}
      {!isOpen && (
        <button
          onClick={handleToggle}
          className="fixed top-24 right-0 z-40 pixel-panel py-4 px-2.5 bg-bg/95 backdrop-blur-md border-l-2 border-y-2 border-accent shadow-pixel hover:border-accent-bright flex flex-col items-center gap-2 cursor-pointer transition-all duration-150 rounded-l-md"
          title="Open Office Intercom & Chat"
        >
          <span style={{ fontSize: 20 }} className="animate-pulse">📻</span>
          <span style={S.tabLabel} className="select-none">Chat & Intercom</span>
          {hasUnread && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />}
          <span style={S.tabCount} className="select-none">({messages.length})</span>
        </button>
      )}

      {/* ── Full right panel ── */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-40 flex flex-col bg-bg/98 backdrop-blur-md border-l-2 border-border shadow-2xl transition-all duration-200 ease-in-out pointer-events-auto ${
          isOpen ? 'w-[400px] translate-x-0' : 'w-0 translate-x-full overflow-hidden pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-border bg-bg-dark/90 select-none" style={{ padding: '12px 16px' }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span style={{ fontSize: 22 }}>📻</span>
            <div className="flex flex-col">
              <span style={S.headerTitle}>Office Intercom &amp; Chat</span>
              <span style={S.headerSub}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Antigravity IDE Stream · Gemini 2.5
              </span>
            </div>
          </div>

          <div className="flex items-center" style={{ gap: 8 }}>
            <span style={S.msgCount}>{messages.length} msgs</span>
            <button
              onClick={onClearMessages}
              title="Clear intercom log"
              className="text-text-muted hover:text-text border border-border/40 hover:border-border rounded cursor-pointer"
              style={S.btnClear}
            >
              Clear
            </button>
            <button
              onClick={handleToggle}
              title="Collapse chat sidebar"
              className="text-text-muted hover:text-accent-bright border border-border/40 hover:border-accent rounded cursor-pointer"
              style={S.btnCollapse}
            >
              ▶
            </button>
          </div>
        </div>

        {/* Message feed */}
        <div className="flex-1 overflow-y-auto flex flex-col" style={{ padding: '12px 14px', gap: 10 }}>
          {messages.length === 0 && (
            <div className="text-center text-text-muted py-16 italic flex flex-col items-center" style={{ gap: 10 }}>
              <span style={{ fontSize: 36, opacity: 0.35 }}>📻</span>
              <span style={S.emptyTitle}>Intercom channel open.</span>
              <span style={S.emptySub}>Speak directly to the Boss or order workers below.</span>
            </div>
          )}

          {messages.map((m) => {
            const isBoss = m.role === 'boss';
            const isDirector = m.role === 'director';
            const badgeBg = isBoss
              ? 'bg-amber-950/40 border-amber-500/50'
              : isDirector
                ? 'bg-emerald-950/40 border-emerald-500/50'
                : 'bg-cyan-950/40 border-cyan-500/50';
            const senderColor = isBoss ? '#fde68a' : isDirector ? '#6ee7b7' : '#67e8f9';
            const roleIcon = isBoss ? '👑' : isDirector ? '👤' : '💻';

            return (
              <div
                key={m.id}
                className={`rounded-sm border ${badgeBg} flex flex-col animate-fade-in`}
                style={{ padding: '12px 14px', gap: 6 }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center" style={{ gap: 7 }}>
                    <span style={{ fontSize: 15 }}>{roleIcon}</span>
                    <span style={{ ...S.msgSender, color: senderColor }}>{m.sender}</span>
                  </span>
                  <span style={S.msgTime}>
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <div style={S.msgBody}>{m.text}</div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t-2 border-border bg-bg-dark/80 flex flex-col" style={{ padding: '12px 14px', gap: 8 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
              disabled={isSending}
              placeholder="Order Boss or chat (e.g. 'Build user auth')..."
              style={{ ...S.inputBox, opacity: isSending ? 0.6 : 1 }}
            />
            <Button
              variant="accent"
              size="sm"
              onClick={handleSend}
              disabled={isSending || !inputText.trim()}
              className="whitespace-nowrap"
              style={{ fontSize: 14, padding: '10px 18px' }}
            >
              {isSending ? 'Sending…' : '🚀 Send'}
            </Button>
          </div>
          <div className="flex items-center justify-between" style={S.inputHint}>
            <span>Press Enter to send</span>
            <span>Responses appear here &amp; in bubble</span>
          </div>
        </div>
      </div>
    </>
  );
}
