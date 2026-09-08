import { useState } from 'react';

import { TeamManagerModal } from './TeamManagerModal.js';
import { Button } from './ui/Button.js';

/** Compact floating team-management strip at the top-center.
 *  The old Boss Console input / Send button has been removed — use the
 *  Office Intercom panel on the right to send orders to the team. */
export function BossOrderBar() {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token') || '';
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const handleQuickAdd = async (isBoss: boolean) => {
    const defaultName = isBoss
      ? `Boss-${Date.now().toString().slice(-3)}`
      : `Dev-${Date.now().toString().slice(-3)}`;
    const defaultRole = isBoss ? 'Executive Director / Boss' : 'Software Engineer';
    try {
      setFeedback(`Adding ${isBoss ? 'Boss' : 'Employee'} to desk…`);
      const res = await fetch('/api/team/add', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name: defaultName, role: defaultRole, isBoss }),
      });
      if (res.ok) {
        setFeedback(`✅ ${defaultName} seated at workstation!`);
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Compact team strip — top-center, no text input */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        <div className="flex items-center gap-4 pixel-panel px-6 py-3 shadow-pixel bg-bg/95 backdrop-blur-xs">
          <Button
            variant="default"
            size="md"
            onClick={() => setIsTeamModalOpen(true)}
            className="whitespace-nowrap text-sm border-accent/60 bg-active-bg hover:bg-btn-hover"
            title="Manage team members, roles and direct tasks"
          >
            👥 Manage Team
          </Button>

          <div className="w-px h-6 bg-border" />

          <Button
            variant="default"
            size="sm"
            onClick={() => handleQuickAdd(false)}
            className="whitespace-nowrap text-xs"
            title="Quickly add a worker employee"
          >
            + Employee
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => handleQuickAdd(true)}
            className="whitespace-nowrap text-xs"
            title="Quickly add a Boss"
          >
            + Boss
          </Button>
        </div>

        {feedback && (
          <div className="text-xs text-text px-8 py-2 bg-bg-dark border border-accent shadow-pixel animate-fade-in">
            {feedback}
          </div>
        )}
      </div>

      <TeamManagerModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
      />
    </>
  );
}
