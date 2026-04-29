import { useState, useEffect } from 'react';

const LINES = [
  'init device identity...',
  'no servers. no logs. no names.',
  'your keys never leave this device.',
  'connecting to peer...',
  'channel open. say something.',
];

const TerminalPrint = () => {
  const [displayed, setDisplayed] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentLine >= LINES.length) {
      setIsComplete(true);
      return;
    }

    const delay = currentChar === 0 ? 280 : 32;

    const timer = setTimeout(() => {
      if (currentChar < LINES[currentLine].length) {
        setDisplayed(prev => {
          const next = [...prev];
          next[currentLine] =
            (next[currentLine] ?? '') + LINES[currentLine][currentChar];
          return next;
        });
        setCurrentChar(c => c + 1);
      } else {
        setCurrentLine(l => l + 1);
        setCurrentChar(0);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [currentLine, currentChar]);

  return (
    <div className='mx-auto max-w-md'>
      <div className='bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 font-mono text-sm'>
        <div className='space-y-2 min-h-[138px]'>
          {displayed.map((line, i) => (
            <div key={i} className='text-emerald-400/90 flex'>
              <span className='text-zinc-700 mr-3 select-none'>$</span>
              <span>{line}</span>
              {i === currentLine && !isComplete && (
                <span className='inline-block w-2.5 h-5 bg-emerald-400 ml-1 animate-pulse' />
              )}
            </div>
          ))}
        </div>

        {isComplete && (
          <div className='mt-6 text-emerald-500/80 text-xs tracking-wide'>
            ✓ end-to-end encrypted channel active
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPrint;
