import { AvatarSection } from './sections/AvatarSection';
import { BioSection } from './sections/BioSection';
import { InviteSection } from './sections/InviteSection';

export const Settings = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70'>
      <div className='bg-background border border-border rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-hidden flex flex-col'>
        <div className='flex items-center justify-between mb-6'>
          <h2 className='text-sm font-mono tracking-widest uppercase'>
            settings
          </h2>
          <button
            onClick={onClose}
            className='text-muted-foreground hover:text-foreground'
          >
            ✕
          </button>
        </div>

        <div className='space-y-8 overflow-y-auto flex-1 pr-1'>
          <AvatarSection />
          <BioSection />
          <InviteSection />
        </div>

        <div className='mt-6 flex justify-end pt-4 border-t border-border'>
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
