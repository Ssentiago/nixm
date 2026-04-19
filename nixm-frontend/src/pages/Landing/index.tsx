import { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import TerminalPrint from '@/components/TerminalPrint';

const Landing: FC = () => {
  return (
    <div className='relative min-h-screen flex flex-col overflow-hidden bg-black'>
      {/* Background grid */}
      <div className='absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:50px_50px]' />
      <div className='absolute inset-0 bg-gradient-to-b from-transparent via-black/70 to-black' />

      <header className='relative z-10 w-full border-b border-border/30'>
        <div className='flex items-center justify-between px-8 py-5 max-w-screen-xl mx-auto'>
          <div className='text-2xl font-bold tracking-tighter'>Nixm</div>
        </div>
      </header>

      <div className='relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center'>
        <div className='max-w-3xl mx-auto'>
          <h1 className='text-7xl md:text-8xl font-bold tracking-tighter mb-6 bg-gradient-to-br from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent'>
            Nixm
          </h1>

          <p className='text-2xl md:text-3xl text-muted-foreground mb-10'>
            Encrypted.
            <br />
            Anonymous.
            <br />
            Yours.
          </p>

          <div className='mb-12'>
            <TerminalPrint />
          </div>

          <div className='flex flex-col sm:flex-row gap-4 justify-center'>
            <Button
              size='lg'
              className='text-lg px-10 py-7 font-medium'
              asChild
            >
              <Link to='/register'>Sign Up</Link>
            </Button>

            <Button
              size='lg'
              variant='outline'
              className='text-lg px-10 py-7'
              asChild
            >
              <Link to='/login'>Sign In</Link>
            </Button>
          </div>

          <p className='text-sm text-muted-foreground mt-8'>
            Apache 2.0 • Sentiago
          </p>
        </div>
      </div>
    </div>
  );
};

export default Landing;
