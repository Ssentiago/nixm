const AppContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className='dark min-h-screen bg-background text-foreground font-mono antialiased'>
      {children}
    </div>
  );
};

export default AppContainer;
