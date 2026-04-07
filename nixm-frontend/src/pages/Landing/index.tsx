import { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import TerminalPrint from '@/components/TerminalPrint';

const TERMINAL_LINES = [
  'initializing secure channel...',
  'end-to-end encryption enabled',
  'no logs. no traces. no compromises.',
  'ready.',
];

const Landing: FC = () => {
  return (
    <div className='flex flex-col min-h-screen'>
      <header className='w-full border-b border-border/50'>
        <div className='flex items-center justify-between px-8 py-5'>
          <div></div>
          <div className='flex items-center gap-3'>
            <Button variant='ghost' size='sm' className='text-sm'>
              <Link to='/login'>Sign in</Link>
            </Button>
            <Button size='sm' className='text-sm'>
              <Link to='/register'>Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className='flex-1 flex flex-col items-center justify-center gap-6'>
        <h1 className='text-7xl font-bold tracking-tighter'>Nixm</h1>
        <p className='text-xl text-muted-foreground'>
          Encrypted. Anonymous. Yours.
        </p>
        <TerminalPrint lines={TERMINAL_LINES} charDelay={100} lineDelay={500} />
      </div>
    </div>
  );
};

export default Landing;
