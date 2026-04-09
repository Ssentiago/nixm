import { Input } from '@/components/ui/input';

export const SearchBar = ({
  placeholder = 'search users...',
  value,
  onChange,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
}) => (
  <div className='relative'>
    <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs font-mono select-none'>
      /
    </span>
    <Input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className='pl-6 h-8 bg-muted border-border text-foreground placeholder:text-muted-foreground/40 font-mono text-xs rounded-md focus-visible:ring-0 focus-visible:border-muted-foreground/40'
      placeholder={placeholder}
    />
  </div>
);