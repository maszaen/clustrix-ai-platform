function TechStack() {
  try {
    const technologies = [
      { name: 'Electron', description: 'Cross-platform desktop app framework' },
      { name: 'LangChain', description: 'Framework for building AI applications with LLMs' },
      { name: 'OpenRouter', description: 'Unified API for multiple AI providers' },
      { name: 'Node.js', description: 'JavaScript runtime for server-side development' },
      { name: 'SQLite3', description: 'Lightweight local database for data storage' },
      { name: 'MathJax', description: 'Mathematical notation rendering engine' },
      { name: 'Prism.js', description: 'Syntax highlighting for code blocks' },
      { name: 'Cheerio', description: 'Fast, flexible jQuery-like library for HTML parsing' },
      { name: 'Mammoth', description: 'Library for converting DOCX files to HTML' }
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
          <div className="text-center mb-16 fade-in-up">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">Tech Stack</h2>
            <p className="text-xl text-[var(--text-secondary)]">
              Built with cutting-edge technologies
            </p>
          </div>
          
          <div className="max-w-6xl mx-auto fade-in-up">
            <div className="backdrop-filter backdrop-blur-10 bg-white/8 border border-white/20 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-4 text-left text-white font-semibold">Technology</th>
                    <th className="px-6 py-4 text-left text-white font-semibold">Function</th>
                  </tr>
                </thead>
                <tbody>
                  {technologies.map((tech, index) => (
                    <tr 
                      key={index} 
                      className="border-t border-white/10 hover:bg-white/5 transition-all duration-400 fade-in-up"
                    >
                      <td className="px-6 py-4 text-white font-medium">{tech.name}</td>
                      <td className="px-6 py-4 text-[var(--text-secondary)]">{tech.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('TechStack component error:', error);
    return null;
  }
}