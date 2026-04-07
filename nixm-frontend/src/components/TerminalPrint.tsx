import { useState, useEffect } from 'react';

interface Props {
  lines: string[];
  charDelay?: number;
  lineDelay?: number;
}

const TerminalPrint = ({ lines, charDelay = 40, lineDelay = 600 }: Props) => {
  const [displayed, setDisplayed] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);

  useEffect(() => {
    if (currentLine >= lines.length) return;

    if (currentChar < lines[currentLine].length) {
      const t = setTimeout(() => {
        setDisplayed(prev => {
          const next = [...prev];
          next[currentLine] =
            (next[currentLine] ?? '') + lines[currentLine][currentChar];
          return next;
        });
        setCurrentChar(c => c + 1);
      }, charDelay);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setCurrentLine(l => l + 1);
        setCurrentChar(0);
      }, lineDelay);
      return () => clearTimeout(t);
    }
  }, [currentLine, currentChar]);

  return (
    <div className='flex flex-col gap-1 font-mono'>
      {displayed.map((line, i) => (
        <span key={i} className='text-sm text-zinc-500'>
          <span className='text-zinc-600 mr-2'>{'>'}</span>
          {line}
          {i === currentLine && (
            <span className='animate-pulse ml-0.5 text-zinc-500'>▋</span>
          )}
        </span>
      ))}
    </div>
  );
};

export default TerminalPrint;
