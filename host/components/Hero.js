function Hero() {
  try {
    const handleGitHubClick = () => {
      alert('This is a private repository. Please contact the team for access.');
    };

    return (
      <section 
        className="relative pt-32 pb-20 px-6 overflow-hidden"
        data-name="hero" 
        data-file="components/Hero.js"
      >
        <div className="blur-light bg-[var(--blur-dark-blue)] w-96 h-96 top-20 left-10 animate-pulse-glow"></div>
        <div className="blur-light bg-[var(--blur-dark-blue)] w-80 h-80 top-40 right-20 animate-pulse-glow" style={{animationDelay: '2s'}}></div>
        <div className="blur-light bg-[var(--blur-dark-blue)] w-72 h-72 bottom-20 left-1/3 animate-pulse-glow" style={{animationDelay: '4s'}}></div>
        
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 via-transparent to-transparent"></div>
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 backdrop-blur-xl bg-white/10 px-4 py-2 rounded-full border border-white/20 mb-8 animate-slide-up">
            <svg className="w-6 h-6 text-[var(--accent-blue)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.18l5.5 3.44v6.76L12 17.82l-5.5-3.44V7.62L12 4.18z"/>
              <path d="M12 8.5l-4 2.5v5l4 2.5 4-2.5v-5l-4-2.5z"/>
            </svg>
            <span className="text-sm font-semibold">Open Source AI Platform</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight animate-slide-up" style={{animationDelay: '0.1s'}}>
            <span className="gradient-text">Advanced AI</span>
            <br />
            Desktop Platform
          </h1>
          
          <p className="text-xl text-[var(--text-secondary)] mb-10 max-w-3xl mx-auto animate-slide-up" style={{animationDelay: '0.2s'}}>
            Harness the power of multiple AI models with advanced reasoning, web search, 
            file processing, and secure local execution. Built for developers and power users.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16 animate-slide-up" style={{animationDelay: '0.3s'}}>
            <a 
              href="https://drive.google.com/file/d/your-file-id/view" 
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              Download Now
            </a>
            <button onClick={handleGitHubClick} className="btn-secondary inline-flex items-center justify-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center backdrop-blur-lg bg-white/10 rounded-2xl p-6 border border-white/20 animate-slide-up" style={{animationDelay: '0.4s'}}>
              <div className="text-4xl font-bold gradient-text mb-2">12+</div>
              <div className="text-[var(--text-secondary)]">AI Models</div>
            </div>
            <div className="text-center backdrop-blur-lg bg-white/10 rounded-2xl p-6 border border-white/20 animate-slide-up" style={{animationDelay: '0.5s'}}>
              <div className="text-4xl font-bold gradient-text mb-2">100%</div>
              <div className="text-[var(--text-secondary)]">Open Source</div>
            </div>
            <div className="text-center backdrop-blur-lg bg-white/10 rounded-2xl p-6 border border-white/20 animate-slide-up" style={{animationDelay: '0.6s'}}>
              <div className="text-4xl font-bold gradient-text mb-2">0ms</div>
              <div className="text-[var(--text-secondary)]">Local Latency</div>
            </div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('Hero component error:', error);
    return null;
  }
}