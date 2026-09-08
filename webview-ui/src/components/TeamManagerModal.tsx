import { useEffect, useState } from 'react';

import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface TeamMember {
  id: number;
  sessionId: string;
  name: string;
  role: string;
  isBoss: boolean;
  isWaiting: boolean;
  status: string;
}

interface TeamManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeamUpdated?: () => void;
}

export function TeamManagerModal({ isOpen, onClose, onTeamUpdated }: TeamManagerModalProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Frontend Developer');
  const [directTasks, setDirectTasks] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const token = new URLSearchParams(window.location.search).get('token') || '';
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/team', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.team || []);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTeam();
      const interval = setInterval(fetchTeam, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleAddMember = async (isBoss: boolean) => {
    const name = newName.trim() || (isBoss ? `Boss-${members.filter((m) => m.isBoss).length + 1}` : `Dev-${members.filter((m) => !m.isBoss).length + 1}`);
    setIsLoading(true);
    setFeedback(`Spawning ${isBoss ? 'Boss' : 'Employee'} to desk...`);

    try {
      const res = await fetch('/api/team/add', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name,
          role: newRole || (isBoss ? 'Executive Director' : 'Software Engineer'),
          isBoss,
        }),
      });
      if (res.ok) {
        setNewName('');
        setFeedback(`✅ ${name} assigned to office workstation!`);
        await fetchTeam();
        onTeamUpdated?.();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setFeedback(`⚠️ Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (id: number, name: string) => {
    try {
      const res = await fetch('/api/team/remove', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setFeedback(`Removed ${name} from office.`);
        await fetchTeam();
        onTeamUpdated?.();
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch {
      /* ignore */
    }
  };

  const handleCommandMember = async (id: number, name: string) => {
    const task = directTasks[id]?.trim();
    if (!task) return;

    try {
      const res = await fetch('/api/team/command', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ id, task }),
      });
      if (res.ok) {
        setFeedback(`⚡ Sent direct task to ${name}!`);
        setDirectTasks((prev) => ({ ...prev, [id]: '' }));
        await fetchTeam();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="👥 Office Team Management" zIndex={60}>
      <div className="flex flex-col gap-8 max-h-[70vh] overflow-y-auto px-4 text-text">
        {/* Feedback alert */}
        {feedback && (
          <div className="bg-bg-dark border-2 border-accent px-8 py-3 text-sm text-accent-bright shadow-pixel">
            {feedback}
          </div>
        )}

        {/* Add Member Form */}
        <div className="pixel-panel p-6 bg-bg-dark/80 flex flex-col gap-4">
          <div className="text-base font-bold text-accent-bright flex items-center gap-2">
            <span>➕</span> Add New Team Member
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Name (e.g. Alice, Bob, DevOps-Dave)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-bg border-2 border-border px-6 py-2 text-sm text-text outline-none focus:border-accent"
            />

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-bg border-2 border-border px-6 py-2 text-sm text-text outline-none focus:border-accent cursor-pointer"
            >
              <option value="Frontend Developer">Frontend Developer</option>
              <option value="Backend Developer">Backend Developer</option>
              <option value="Fullstack Engineer">Fullstack Engineer</option>
              <option value="QA & Testing Specialist">QA & Testing Specialist</option>
              <option value="DevOps & Cloud Engineer">DevOps & Cloud Engineer</option>
              <option value="Security Specialist">Security Specialist</option>
              <option value="Executive Director / Boss">Executive Director / Boss</option>
            </select>
          </div>

          <div className="flex gap-4 pt-2">
            <Button
              variant="accent"
              size="md"
              disabled={isLoading}
              onClick={() => handleAddMember(false)}
              className="flex-1"
            >
              + Add Employee
            </Button>
            <Button
              variant="default"
              size="md"
              disabled={isLoading}
              onClick={() => handleAddMember(true)}
              className="flex-1 border-accent/60"
            >
              👑 + Add Boss
            </Button>
          </div>
        </div>

        {/* Active Team Roster */}
        <div className="flex flex-col gap-4">
          <div className="text-base font-bold text-text-muted">
            Active Office Members ({members.length})
          </div>

          {members.length === 0 ? (
            <div className="text-sm text-text-muted py-4 text-center">
              No active agents in the office. Click "Add Employee" above to seat one!
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="pixel-panel p-6 flex flex-col gap-4 bg-bg border-border/80"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{member.isBoss ? '👑' : '💻'}</span>
                    <div>
                      <div className="text-base font-bold text-text flex items-center gap-2">
                        {member.name}
                        {member.isBoss && (
                          <span className="text-xs bg-accent px-4 py-1 rounded-none text-white">
                            BOSS
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">{member.role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`text-xs px-4 py-1 border ${
                        member.isWaiting
                          ? 'border-status-success text-status-success'
                          : 'border-status-active text-status-active'
                      }`}
                    >
                      {member.status}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id, member.name)}
                      className="text-danger hover:bg-danger/20 hover:border-danger text-xs px-4"
                      title="Dismiss from office desk"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>

                {/* Direct Command Bar */}
                <div className="flex gap-2 pt-2 border-t border-border/40">
                  <input
                    type="text"
                    placeholder={`Direct task for ${member.name} (e.g. "Run test suite")...`}
                    value={directTasks[member.id] || ''}
                    onChange={(e) =>
                      setDirectTasks({ ...directTasks, [member.id]: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommandMember(member.id, member.name);
                    }}
                    className="flex-1 bg-bg-dark border border-border px-4 py-1 text-xs text-text outline-none focus:border-accent"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleCommandMember(member.id, member.name)}
                    disabled={!directTasks[member.id]?.trim()}
                    className="text-xs whitespace-nowrap"
                  >
                    ⚡ Command
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
