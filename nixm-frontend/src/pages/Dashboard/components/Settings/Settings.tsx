import { useState, useEffect } from 'react';
import { AvatarSection } from './sections/AvatarSection';
import { BioSection } from './sections/BioSection';
import { InviteSection } from './sections/InviteSection';

type SettingsView = 'root' | 'profile' | 'invites';

const VIEWS: Record<Exclude<SettingsView, 'root'>, { label: string }> = {
  profile: { label: 'my profile' },
  invites: { label: 'invite links' },
};

const SettingsRow = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className='w-full flex items-center justify-between px-4 py-3 rounded border border-border hover:bg-muted transition-colors text-left'
  >
    <span className='text-xs font-mono text-foreground'>{label}</span>
    <span className='text-muted-foreground/40 text-xs font-mono'>→</span>
  </button>
);

const SettingsHeader = ({
  view,
  onBack,
  onClose,
}: {
  view: SettingsView;
  onBack: () => void;
  onClose: () => void;
}) => (
  <div className='flex items-center justify-between mb-6 shrink-0'>
    <div className='flex items-center gap-3'>
      {view !== 'root' && (
        <button
          onClick={onBack}
          className='text-muted-foreground hover:text-foreground font-mono text-xs transition-colors'
        >
          ←
        </button>
      )}
      <h2 className='text-sm font-mono tracking-widest uppercase'>
        {view === 'root' ? 'settings' : VIEWS[view].label}
      </h2>
    </div>
    <button
      onClick={onClose}
      className='text-muted-foreground hover:text-foreground transition-colors'
    >
      ✕
    </button>
  </div>
);

const SettingsRoot = ({
  onNavigate,
}: {
  onNavigate: (view: SettingsView) => void;
}) => (
  <div className='space-y-2'>
    <SettingsRow label='my profile' onClick={() => onNavigate('profile')} />
    <SettingsRow label='invite links' onClick={() => onNavigate('invites')} />
  </div>
);

export const Settings = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const [view, setView] = useState<SettingsView>('root');

  useEffect(() => {
    if (!open) setView('root');
  }, [open]);

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70'>
      <div className='bg-background border border-border rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-hidden flex flex-col'>
        <SettingsHeader
          view={view}
          onBack={() => setView('root')}
          onClose={onClose}
        />

        <div className='flex-1 overflow-y-auto pr-1'>
          {view === 'root' && <SettingsRoot onNavigate={setView} />}
          {view === 'profile' && (
            <div className='space-y-8'>
              <AvatarSection />
              <BioSection />
            </div>
          )}
          {view === 'invites' && <InviteSection />}
        </div>

        <div className='mt-6 flex justify-end pt-4'>
          <button
            onClick={onClose}
            className='px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg font-mono'
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
};
