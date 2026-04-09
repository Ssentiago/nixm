export const EmptyState = () => (
  <div className='flex-1 flex flex-col items-center justify-center gap-3 select-none'>
    <div className='font-mono text-sm space-y-1 text-center'>
      <p className='text-muted-foreground'>no channel selected</p>
      <p className='text-muted-foreground'>pick a conversation or</p>
      <p className='text-muted-foreground'>search for someone to start one</p>
    </div>
  </div>
);
