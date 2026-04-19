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
    <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono select-none'>
      /
    </span>
    <Input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className='pl-6 h-9 bg-background border-border text-foreground placeholder:text-muted-foreground font-mono text-sm rounded-sm focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground'
      placeholder={placeholder}
    />
  </div>
);
