function PreviewSection() {
  try {
    return (
      <section 
        className="py-20 px-6 relative"
        data-name="preview" 
        data-file="components/PreviewSection.js"
      >
        <div className="blur-light bg-[var(--blur-dark-blue)] w-96 h-96 top-1/4 right-0 animate-pulse-glow"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">Platform Preview</h2>
            <p className="text-xl text-[var(--text-secondary)]">
              See Clustrix AI in action
            </p>
          </div>
          
          <div className="max-w-6xl mx-auto space-y-16">
            {/* Preview Item 1 */}
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl hover:border-white/30 transition-all duration-300 fade-in-up">
              <div className="p-8 pb-6 max-w-2xl">
                <h3 className="text-3xl font-bold text-white mb-3">Interactive Chat Interface</h3>
                <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
                  Experience seamless AI conversations with an intuitive and responsive chat interface designed for productivity.
                </p>
              </div>
              <div className="w-[90%] ml-auto relative overflow-hidden border border-white/20 bg-black/20" style={{borderRadius: '1.5rem 0 1.5rem 0'}}>
                <img src="./images/ui-review.png" alt="UI Review" className="w-full h-auto" />
              </div>
            </div>

            {/* Preview Item 2 */}
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl hover:border-white/30 transition-all duration-300 fade-in-up">
              <div className="p-8 pb-6 max-w-2xl">
                <h3 className="text-3xl font-bold text-white mb-3">Project Management</h3>
                <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
                  Organize your work with powerful project tools and track progress across multiple AI-assisted tasks.
                </p>
              </div>
              <div className="w-[90%] ml-auto relative overflow-hidden border border-white/20 bg-black/20" style={{borderRadius: '1.5rem 0 1.5rem 0'}}>
                <img src="./images/project-detail.png" alt="Project Detail" className="w-full h-auto" />
              </div>
            </div>

            {/* Preview Item 3 */}
            <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl hover:border-white/30 transition-all duration-300 fade-in-up">
              <div className="p-8 pb-6 max-w-2xl">
                <h3 className="text-3xl font-bold text-white mb-3">Code Artifacts</h3>
                <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
                  Generate, preview, and manage code artifacts with syntax highlighting and instant execution capabilities.
                </p>
              </div>
              <div className="w-[90%] ml-auto relative overflow-hidden border border-white/20 bg-black/20" style={{borderRadius: '1.5rem 0 1.5rem 0'}}>
                <img src="./images/artifacts.png" alt="Artifacts" className="w-full h-auto" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  } catch (error) {
    console.error('PreviewSection component error:', error);
    return null;
  }
}