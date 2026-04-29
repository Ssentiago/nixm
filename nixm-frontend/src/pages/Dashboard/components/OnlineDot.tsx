export const OnlineDot = ({ online }: { online: boolean }) => (
  <span
    className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-background ${
      online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
    }`}
  />
);
