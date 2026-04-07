const AppContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className='min-h-screen bg-background text-foreground font-mono antialiased dark'>
      {children}
    </div>
  );
};

export default AppContainer;
