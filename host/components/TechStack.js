function TechStack() {
  try {
    const technologies = [
      'Electron',
      'LangChain',
      'OpenRouter',
      'Node.js',
      'SQLite3',
      'MathJax',
      'Markdown-It',
      'Prism.js'
    ];

    return (
      <section 
        id="tech-stack"
        className="py-20 px-6 relative"
        data-name="tech-stack" 
        data-file="components/TechStack.js"
      >
        <div className="blur-light bg-[var(--blur-dark-blue)] w-80 h-80 top-1/3 left-10 animate-pulse-glow"></div>
        <div className="blur-light bg-[var(--blur-dark-blue)] w-72 h-72 bottom-10 right-20 animate-pulse-glow" style={{animationDelay: '3s'}}></div>
        
        <div className="absolute inset-0 backdrop-blur-3xl bg-gradient-to-b from-transparent via-[var(--bg-card)]/20 to-transparent"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">Tech Stack</h2>
            <p className="text-xl text-[var(--text-secondary)]">
              Built with cutting-edge technologies
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {technologies.map((tech, index) => (
              <div 
                key={index} 
                className="tech-badge text-center"
                style={{
                  animation: 'slide-up 0.5s ease-out forwards',
                  animationDelay: `${index * 0.1}s`,
                  opacity: 0
                }}
              >
                {tech}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('TechStack component error:', error);
    return null;
  }
}