function CallToAction() {
  try {
    return (
      <section 
        className="py-20 px-6 relative border-t border-white/10 "
        data-name="cta" 
        data-file="components/CallToAction.js"
      >
        
        <div className="max-w-4xl mx-auto text-center relative z-10 fade-in-up">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-[var(--text-secondary)] mb-10">
            Download Clustrix AI today and experience the future of AI desktop computing
          </p>
          <a 
            href="https://drive.google.com/file/d/127aKLjHeunvyEUeC80IcM2kICTac3gBY/view?usp=sharing" 
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download Now
          </a>
        </div>
      </section>
    );
  } catch (error) {
    console.error('CallToAction component error:', error);
    return null;
  }
}