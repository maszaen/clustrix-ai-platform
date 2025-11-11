function Footer() {
  try {
    const handleGitHubClick = () => {
      showModal('This is a private repository. Please contact the team for access.');
    };

    return (
      <footer 
        className="py-12 px-6 border-t border-white/10"
        data-name="footer" 
        data-file="components/Footer.js"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center gap-6">
            <div className="flex gap-8">
              <a href="privacy.html" className="text-[var(--text-secondary)] hover:text-white transition-colors">
                Privacy Policy
              </a>
              <button onClick={handleGitHubClick} className="text-[var(--text-secondary)] hover:text-white transition-colors">
                GitHub Repository
              </button>
              <a href="mailto:contact@clustrix.ai" className="text-[var(--text-secondary)] hover:text-white transition-colors">
                Contact
              </a>
            </div>
          </div>
          
          <div className="text-center mt-8 text-[var(--text-secondary)] text-sm">
            © 2025 Clustrix AI. All rights reserved.
          </div>
        </div>
      </footer>
    );
  } catch (error) {
    console.error('Footer component error:', error);
    return null;
  }
}