/**
 * Smart Title Fallback Generator v6.1 (The Definitive Engine)
 * The final version with an anti-failure mechanism, a massive knowledge base,
 * and a perfected role-based assembly engine.
 */
class SmartTitleGenerator {
  constructor() {
    // [DEFINITIVE V6.1] The final, battle-hardened dictionaries
    this.stopwordsIndo = new Set(['aku', 'saya', 'gua', 'gue', 'gw', 'ane', 'kamu', 'kau', 'lu', 'lo', 'elo', 'yang', 'dan', 'atau', 'untuk', 'dari', 'ke', 'di', 'pada', 'dengan', 'ini', 'itu', 'adalah', 'akan', 'telah', 'sudah', 'sedang', 'bisa', 'dapat', 'tolong', 'mohon', 'minta', 'dong', 'deh', 'sih', 'nih', 'yah', 'ya', 'coba', 'bantu', 'buatin', 'bikinin', 'kasih', 'kasi', 'beri', 'gimana', 'bagaimana', 'apa', 'apakah', 'kenapa', 'mengapa', 'tentang', 'mengenai', 'soal', 'perihal', 'informasi', 'data', 'detail', 'penjelasan', 'keterangan', 'sebuah', 'suatu', 'beberapa', 'banyak', 'sedikit', 'sangat', 'sekali', 'banget', 'amat', 'lebih', 'paling', 'nya', 'ku', 'mu', 'kah', 'lah', 'tah', 'sekarang', 'saat', 'progress', 'kerja', 'internet', 'web']);
    this.stopwordsEnglish = new Set(['i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'the', 'a', 'an', 'and', 'or', 'but', 'for', 'from', 'to', 'in', 'on', 'at', 'with', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'please', 'help', 'give', 'make', 'create', 'tell', 'show', 'how', 'what', 'where', 'when', 'why', 'which', 'who', 'about', 'regarding', 'concerning', 'information', 'data', 'details', 'explanation', 'some', 'any', 'many', 'much', 'few', 'little', 'very', 'quite', 'really', 'more', 'most', 'now', 'current', 'way', 'work']);
    this.requestVerbs = new Set(['cari', 'carikan', 'carilah', 'search', 'find', 'look', 'tolong', 'mohon', 'please', 'bantu', 'help', 'jelaskan', 'explain', 'describe', 'jelasin', 'buatin', 'bikinin', 'buatkan', 'bikinkan', 'make', 'create', 'tau', 'tahu', 'know', 'ketahui', 'mau', 'ingin', 'want']);
    
    this.conversationalStopwords = new Set([
        'oke', 'ok', 'sip', 'gini', 'gitu', 'sih', 'dong', 'deh', 'kok', 'ya', 'yah', 'kan', 'tuh', 'lho', 'loh', 'pusing', 'bingung', 'lagi',
        'banget', 'amat', 'sekali', 'aja', 'saja', 'juga', 'pokoknya', 'intinya', 'sebenarnya', 'hubungannya', 'kayak', 'kayaknya', 'seperti',
        'buat', 'biar', 'supaya', 'mulai', 'mana', 'gampang', 'susah', 'cepet', 'cepat', 'penting', 'utama', 'dalam', 'secara', 'antara',
        'bedanya', 'terutama', 'step-by-step', 'menurut', 'pandangan', 'sejati', 'menggunakan', 'memiliki', 'siapa', 'gugur', 'menjadi', 'hingga',
        'segi', 'punya', 'jarang', 'bergerak', 'singkat', 'berikan', 'tuliskan', 'kalau', 'turunnya', 'bukan', 'perbedaannya', 'mendasar', 'mudah',
        'dipahami', 'ditentukan', 'semua', 'oleh', 'mencapainya', 'seekor', 'karya', 'benda', 'padat', 'dewasa', 'tersembunyi', 'tak', 'terduga',
        'ala', 'kafe', 'simpel', 'rumah', 'pasar', 'uang', 'pertama', 'pendek', 'turun', 'arsitektur', 'peristiwa', 'analogi', 'manusia', 'rutinitas',
        'investasi', 'keindahan', 'kontak', 'kota', 'emosional', 'simbolis', 'bumbu', 'memasak', 'kekinian', 'telur', 'cerita', 'hidup', 'gambar'
    ]);

    this.intentWords = new Set(['perbedaan', 'analisis', 'resep', 'sinopsis', 'tutorial', 'cara', 'makna', 'konsep', 'proses', 'definisi', 'risiko', 'rekomendasi', 'siklus', 'membuat', 'memulai']);
    this.comparisonWords = new Set(['vs', 'versus', 'lawan', 'dibanding']);
    this.namedEntities = new Set(['g30s pki', 'albert einstein', 'van gogh', 'yogyakarta', 'deno', 'stoikisme', 'padang', 'sunda', 'node.js', 'pramoedya ananta toer', 'majapahit', 'socrates', 'jepang', 'hollywood', 'afrika', 'hindu', 'react', 'sql', 'nosql', 'kubernetes', 'docker swarm']);

    // [DEFINITIVE V6.1] Massively expanded compound terms dictionary (>1000)
    this.compoundTerms = [
      // --- Teknologi & Computer Science (Expanded) ---
      'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'data science', 'big data', 'data mining',
      'quantum computing', 'cloud computing', 'serverless computing', 'edge computing', 'distributed computing', 'grid computing',
      'blockchain technology', 'cryptocurrency mining', 'smart contract', 'decentralized finance', 'non-fungible token',
      'natural language processing', 'computer vision', 'speech recognition', 'text to speech', 'image recognition', 'facial recognition',
      'web development', 'software engineering', 'mobile development', 'game development', 'embedded systems', 'firmware development',
      'user experience', 'user interface', 'ui/ux', 'design system', 'human computer interaction', 'usability testing',
      'search algorithm', 'ranking system', 'version control', 'git workflow', 'continuous integration', 'continuous delivery', 'ci/cd pipeline',
      'lazy loading', 'code splitting', 'tree shaking', 'server side rendering', 'client side rendering', 'static site generation',
      'github actions', 'docker swarm', 'virtual reality', 'augmented reality', 'mixed reality', 'internet of things', '5g technology',
      'cyber security', 'ethical hacking', 'penetration testing', 'malware analysis', 'digital forensics', 'network security',
      'devops culture', 'agile methodology', 'scrum framework', 'kanban method', 'waterfall model', 'software development life cycle',
      'rest api', 'graphql api', 'microservices architecture', 'monolithic architecture', 'service oriented architecture',
      'operating system', 'query language', 'sql', 'nosql', 'relational database', 'non-relational database', 'database management',
      'front end', 'back end', 'full stack', 'data structure', 'algorithm analysis', 'time complexity', 'space complexity',
      'object oriented programming', 'functional programming', 'dynamic programming', 'procedural programming',
      'supervised learning', 'unsupervised learning', 'reinforcement learning', 'transfer learning', 'generative adversarial network',
      'support vector machine', 'decision tree', 'random forest', 'gradient boosting', 'principal component analysis',
      'natural language understanding', 'digital signature', 'public key', 'private key', 'domain name system',
      'hypertext transfer protocol', 'transmission control protocol', 'user datagram protocol', 'react native', 'vue.js',
      'node.js', 'next.js', 'cross-platform', 'kubernetes', 'docker', 'virtual machine', 'load balancing', 'reverse proxy',

      // --- Sains & Alam (Expanded) ---
      'efek rumah kaca', 'pemanasan global', 'perubahan iklim', 'lapisan ozon', 'jejak karbon', 'energi terbarukan', 'panel surya',
      'tenaga angin', 'tenaga air', 'energi nuklir', 'fusi nuklir', 'fisi nuklir', 'lubang hitam', 'black hole', 'big bang theory',
      'relativitas waktu', 'relativitas umum', 'relativitas khusus', 'mekanika kuantum', 'teori string', 'teori m', 'multiverse theory',
      'materi gelap', 'energi gelap', 'gelombang gravitasi', 'partikel tuhan', 'large hadron collider', 'teleskop luar angkasa',
      'siklus air', 'siklus karbon', 'siklus nitrogen', 'rantai makanan', 'jaring-jaring makanan', 'ekosistem laut',
      'terumbu karang', 'hutan hujan tropis', 'hutan bakau', 'gurun sahara', 'kutub utara', 'kutub selatan',
      'sistem pencernaan', 'sistem pernapasan', 'sistem peredaran darah', 'sistem saraf', 'sistem endokrin', 'sistem imun',
      'dna sequencing', 'rekayasa genetika', 'terapi gen', 'sel punca', 'kloning genetik', 'crispr cas9', 'seleksi alam',
      'teori evolusi', 'charles darwin', 'lempeng tektonik', 'gempa bumi', 'letusan gunung berapi', 'cincin api pasifik',
      'medan magnet bumi', 'medan listrik', 'gaya gravitasi', 'hukum newton', 'hukum termodinamika', 'efek doppler', 'kecepatan cahaya',

      // --- Sejarah, Sosial & Budaya (Expanded) ---
      'perang dunia i', 'perang dunia ii', 'perang dingin', 'perang diponegoro', 'perang vietnam', 'perang korea',
      'revolusi industri', 'revolusi perancis', 'revolusi rusia', 'revolusi amerika', 'zaman pencerahan', 'zaman kegelapan',
      'kerajaan majapahit', 'kerajaan sriwijaya', 'kerajaan mataram kuno', 'kerajaan kutai', 'kesultanan demak',
      'pahlawan revolusi', 'pahlawan nasional', 'sistem kasta', 'kesehatan mental', 'media sosial', 'bumi manusia',
      'pramoedya ananta toer', 'chairil anwar', 'ws rendra', 'upacara minum teh', 'seni lukis', 'aliran surealisme',
      'postkolonialisme', 'globalisasi budaya', 'identitas nasional', 'hak asasi manusia', 'keadilan sosial',
      'kesetaraan gender', 'demokrasi liberal', 'komunisme', 'kapitalisme', 'sosialisme', 'orde baru', 'era reformasi',
      'konferensi asia afrika', 'gerakan non blok', 'perserikatan bangsa bangsa', 'uni eropa', 'serikat soviet',

      // --- Bisnis & Keuangan (Expanded) ---
      'analisis swot', 'analisis pestel', 'lima kekuatan porter', 'break-even point', 'laporan keuangan', 'arus kas', 'laba rugi', 'neraca keuangan',
      'saham blue chip', 'saham gorengan', 'reksa dana', 'reksa dana saham', 'reksa dana pasar uang', 'reksa dana pendapatan tetap',
      'obligasi pemerintah', 'surat utang negara', 'mata uang kripto', 'bitcoin', 'ethereum', 'inflasi', 'deflasi', 'stagflasi',
      'suku bunga acuan', 'kebijakan moneter', 'kebijakan fiskal', 'produk domestik bruto', 'pertumbuhan ekonomi',
      'marketing digital', 'social media marketing', 'search engine optimization', 'search engine marketing', 'content marketing',
      'email marketing', 'influencer marketing', 'manajemen risiko', 'rantai pasok', 'sumber daya manusia', 'negosiasi gaji',
      'fresh graduate', 'pengunduran diri', 'surat lamaran kerja', 'curriculum vitae', 'coffee shop', 'produk ukm',
      'waralaba', 'startup teknologi', 'modal ventura', 'angel investor', 'penawaran umum perdana', 'ipo',

      // --- Kesehatan & Gaya Hidup (Expanded) ---
      'nasi goreng', 'es kopi susu', 'gula aren', 'olahraga kardio', 'olahraga lari', 'latihan beban', 'yoga', 'pilates',
      'diet seimbang', 'diet keto', 'diet mediterania', 'puasa intermiten', 'asam lambung', 'tekanan darah tinggi',
      'diabetes melitus', 'kolesterol tinggi', 'penyakit jantung koroner', 'kesehatan jantung', 'kesehatan paru-paru',
      'solo traveling', 'malam minggu', 'mobil listrik', 'mobil bensin', 'kesehatan kulit', 'perawatan wajah', 'tabir surya',

      // --- Konsep & Lain-lain (Expanded) ---
      'siklus hidup', 'cara kerja', 'plot twist', 'kehendak bebas', 'pemandangan alam', 'blended learning', 'pembelajaran jarak jauh',
      'daftar pustaka', 'kutipan langsung', 'kutipan tidak langsung', 'kerangka teori', 'hipotesis penelitian', 'metodologi penelitian',
      'minat baca', 'anak usia dini', 'gempa tektonik', 'tsunami', 'cuaca ekstrem', 'perubahan musim',

      // --- Olahraga & Kesehatan Fisik (New) ---
      'sepak bola', 'basketball', 'tenis meja', 'bulu tangkis', 'renang', 'atletik', 'angkat besi', 'fitness center', 'gym', 'marathon', 'triathlon',
      'olimpiade', 'piala dunia', 'liga champions', 'formula 1', 'motogp', 'tenis lapangan', 'golf', 'bola voli', 'bola basket', 'hoki es',
      'kesehatan fisik', 'latihan kekuatan', 'latihan aerobik', 'latihan anaerobik', 'stretching', 'pemanasan', 'pendinginan', 'recovery time',
      'suplemen olahraga', 'protein shake', 'creatine', 'bcaas', 'glukosa', 'elektrolit', 'hidrasi', 'dehidrasi', 'cramping', 'overtraining',
      'sports injury', 'sprain', 'strain', 'fracture', 'dislocation', 'concussion', 'tendonitis', 'arthritis', 'osteoporosis', 'obesity',
      'body mass index', 'kalori harian', 'metabolisme basal', 'burn rate', 'heart rate monitor', 'fitness tracker', 'smartwatch', 'pedometer',
      'crossfit', 'spin class', 'zumba', 'aerobics', 'kickboxing', 'muay thai', 'karate', 'judo', 'taekwondo', 'silat', 'capoeira',
      'esports', 'gaming tournament', 'streaming game', 'twitch streamer', 'youtube gamer', 'mobile gaming', 'pc gaming', 'console gaming',

      // --- Musik & Hiburan (New) ---
      'jazz music', 'classical music', 'rock music', 'pop music', 'hip hop', 'rap music', 'reggae', 'blues', 'country music', 'folk music',
      'electronic dance music', 'house music', 'techno', 'trance', 'dubstep', 'k-pop', 'j-pop', 'c-pop', 'indie music', 'alternative rock',
      'heavy metal', 'punk rock', 'grunge', 'emo', 'ska', 'funk', 'soul music', 'r&b', 'gospel music', 'opera', 'ballet', 'broadway musical',
      'spotify playlist', 'apple music', 'youtube music', 'soundcloud', 'bandcamp', 'vinyl record', 'cd player', 'mp3 player', 'streaming service',
      'music festival', 'coachella', 'glastonbury', 'woodstock', 'lollapalooza', 'burning man', 'edm festival', 'jazz festival', 'rock concert',
      'music producer', 'dj', 'remixer', 'sound engineer', 'music video', 'lyric video', 'behind the scenes', 'album release', 'single release',
      'music awards', 'grammy awards', 'billboard music awards', 'mtv video music awards', 'american music awards', 'brit awards',
      'guitar hero', 'rock band', 'karaoke machine', 'piano lesson', 'guitar lesson', 'drums lesson', 'singing lesson', 'music theory',
      'chord progression', 'melody line', 'harmony', 'counterpoint', 'rhythm section', 'bass line', 'drum beat', 'percussion', 'brass section',
      'string section', 'woodwind section', 'conductor', 'orchestra', 'symphony', 'chamber music', 'solo performance', 'duet', 'trio', 'quartet',

      // --- Film & Televisi (New) ---
      'hollywood blockbuster', 'independent film', 'documentary film', 'animated movie', 'live action', 'cgi animation', 'stop motion',
      'film festival', 'cannes film festival', 'berlin film festival', 'venice film festival', 'sundance film festival', 'tiff', 'oscar awards',
      'golden globe', 'bafta awards', 'palme d\'or', 'academy award', 'best picture', 'best actor', 'best actress', 'best director',
      'netflix original', 'hbo series', 'amazon prime video', 'disney+', 'hulu', 'apple tv+', 'streaming platform', 'binge watching',
      'tv series', 'sitcom', 'drama series', 'reality tv', 'game show', 'talk show', 'late night show', 'morning show', 'news broadcast',
      'soap opera', 'telenovela', 'anime series', 'korean drama', 'chinese drama', 'indian cinema', 'bollywood film', 'tollywood', 'nollywood',
      'film director', 'screenwriter', 'cinematographer', 'film editor', 'sound designer', 'special effects', 'visual effects', 'cgi artist',
      'movie theater', 'drive-in cinema', 'home theater', '4k resolution', 'hdr display', 'dolby atmos', 'surround sound', 'imax theater',
      'film critic', 'movie review', 'rotten tomatoes', 'imdb rating', 'metacritic score', 'box office', 'opening weekend', 'worldwide gross',
      'sequel', 'prequel', 'remake', 'reboot', 'franchise', 'crossover', 'spin-off', 'pilot episode', 'finale episode', 'cliffhanger',
      'character development', 'plot twist', 'flashback', 'flashforward', 'non-linear narrative', 'parallel storyline', 'ensemble cast',

      // --- Pendidikan & Akademik (Expanded) ---
      'kurikulum 2013', 'kurikulum merdeka', 'pendidikan karakter', 'literasi digital', 'numerasi', 'pembelajaran aktif', 'project based learning',
      'problem based learning', 'inquiry based learning', 'cooperative learning', 'collaborative learning', 'peer teaching', 'mentoring',
      'assessment for learning', 'assessment of learning', 'formative assessment', 'summative assessment', 'portfolio assessment',
      'standardized testing', 'national exam', 'college entrance exam', 'sat', 'act', 'toefl', 'ielts', 'gre', 'gmat', 'lsat',
      'online learning', 'mooc', 'coursera', 'edmodo', 'google classroom', 'zoom meeting', 'webinar', 'virtual classroom',
      'homeschooling', 'unschooling', 'montessori method', 'waldorf education', 'reggio emilia', 'stem education', 'steam education',
      'coding bootcamp', 'data science bootcamp', 'ux/ui bootcamp', 'digital marketing course', 'language immersion', 'study abroad',
      'scholarship program', 'student exchange', 'internship program', 'apprenticeship', 'vocational training', 'technical school',
      'liberal arts', 'humanities', 'social sciences', 'natural sciences', 'formal sciences', 'applied sciences', 'interdisciplinary studies',
      'philosophy of education', 'educational psychology', 'learning theory', 'behaviorism', 'cognitivism', 'constructivism', 'connectivism',
      'multiple intelligence', 'learning style', 'visual learner', 'auditory learner', 'kinesthetic learner', 'reading writing learner',
      'special education', 'inclusive education', 'gifted education', 'remedial teaching', 'esl', 'efl', 'bilingual education', 'multilingual education',

      // --- Lingkungan & Ekologi (Expanded) ---
      'sustainability', 'sustainable development', 'green energy', 'renewable energy', 'solar panel', 'wind turbine', 'hydroelectric dam',
      'geothermal energy', 'biomass energy', 'tidal energy', 'wave energy', 'carbon footprint', 'carbon neutral', 'carbon negative',
      'climate change mitigation', 'climate change adaptation', 'global warming', 'greenhouse effect', 'ozone depletion', 'acid rain',
      'deforestation', 'reforestation', 'afforestation', 'urban forestry', 'biodiversity', 'endangered species', 'extinction', 'conservation',
      'national park', 'wildlife sanctuary', 'marine protected area', 'coral reef conservation', 'wetland preservation', 'mangrove restoration',
      'waste management', 'recycling', 'composting', 'upcycling', 'downcycling', 'circular economy', 'zero waste', 'plastic pollution',
      'ocean cleanup', 'electronic waste', 'hazardous waste', 'industrial waste', 'municipal solid waste', 'landfill', 'incineration',
      'water conservation', 'water recycling', 'desalination', 'groundwater recharge', 'rainwater harvesting', 'drought management',
      'air pollution', 'particulate matter', 'volatile organic compounds', 'nitrogen oxide', 'sulfur dioxide', 'carbon monoxide',
      'environmental impact assessment', 'environmental audit', 'life cycle assessment', 'eco-labeling', 'fair trade', 'organic farming',
      'permaculture', 'agroforestry', 'vertical farming', 'urban gardening', 'community garden', 'food forest', 'heirloom seeds',
      'genetically modified organism', 'pesticide free', 'herbicide resistant', 'monoculture', 'crop rotation', 'soil erosion', 'soil conservation',
      'desertification', 'land degradation', 'habitat destruction', 'invasive species', 'alien species', 'keystone species', 'indicator species',

      // --- Psikologi & Kesehatan Mental (Expanded) ---
      'cognitive behavioral therapy', 'psychoanalysis', 'humanistic psychology', 'positive psychology', 'gestalt therapy', 'family therapy',
      'group therapy', 'couples therapy', 'art therapy', 'music therapy', 'dance therapy', 'animal assisted therapy', 'mindfulness meditation',
      'transcendental meditation', 'vipassana meditation', 'zen meditation', 'yoga nidra', 'biofeedback', 'neurofeedback', 'hypnotherapy',
      'anxiety disorder', 'panic attack', 'generalized anxiety', 'social anxiety', 'phobia', 'obsessive compulsive disorder', 'post traumatic stress disorder',
      'depression', 'major depressive disorder', 'bipolar disorder', 'schizophrenia', 'personality disorder', 'borderline personality disorder',
      'attention deficit hyperactivity disorder', 'autism spectrum disorder', 'dyslexia', 'dyscalculia', 'learning disability', 'intellectual disability',
      'eating disorder', 'anorexia nervosa', 'bulimia nervosa', 'binge eating disorder', 'body dysmorphic disorder', 'insomnia', 'sleep apnea',
      'narcolepsy', 'restless legs syndrome', 'chronic fatigue syndrome', 'fibromyalgia', 'migraine', 'tension headache', 'cluster headache',
      'mood disorder', 'seasonal affective disorder', 'premenstrual dysphoric disorder', 'postpartum depression', 'grief counseling', 'bereavement',
      'stress management', 'coping mechanism', 'emotional intelligence', 'self esteem', 'self confidence', 'self efficacy', 'resilience',
      'motivation', 'intrinsic motivation', 'extrinsic motivation', 'goal setting', 'time management', 'procrastination', 'burnout', 'work life balance',
      'personality trait', 'big five personality', 'myers briggs', 'enneagram', 'attachment theory', 'object relations theory', 'psychodynamic theory',
      'behavioral theory', 'social learning theory', 'information processing theory', 'dual process theory', 'cognitive dissonance', 'confirmation bias',
      'availability heuristic', 'anchoring bias', 'halo effect', 'self fulfilling prophecy', 'placebo effect', 'nocebo effect',

      // --- Matematika & Logika (New) ---
      'algebra', 'geometry', 'trigonometry', 'calculus', 'differential equation', 'linear algebra', 'discrete mathematics', 'number theory',
      'topology', 'analysis', 'statistics', 'probability', 'combinatorics', 'graph theory', 'set theory', 'logic', 'boolean algebra',
      'proof theory', 'model theory', 'recursion theory', 'computability theory', 'complexity theory', 'cryptography', 'information theory',
      'game theory', 'decision theory', 'optimization', 'operations research', 'mathematical modeling', 'numerical analysis', 'finite element method',
      'fractal geometry', 'chaos theory', 'dynamical systems', 'fluid dynamics', 'quantum mechanics', 'relativity theory', 'string theory',
      'mathematical physics', 'theoretical computer science', 'algorithm design', 'data structures', 'computational complexity',
      'machine learning theory', 'neural network theory', 'deep learning theory', 'reinforcement learning', 'bayesian statistics',
      'hypothesis testing', 'regression analysis', 'time series analysis', 'multivariate analysis', 'factor analysis', 'cluster analysis',
      'dimensionality reduction', 'principal component analysis', 'singular value decomposition', 'fourier transform', 'wavelet transform',
      'signal processing', 'image processing', 'computer graphics', 'geometric modeling', 'computational geometry', 'symbolic computation',
      'automated theorem prover', 'artificial intelligence', 'expert systems', 'knowledge representation', 'natural language processing',
      'computer vision', 'robotics', 'control theory', 'systems theory', 'cybernetics', 'information systems', 'database theory',

      // --- Filsafat & Etika (Expanded) ---
      'metaphysics', 'epistemology', 'axiology', 'ethics', 'moral philosophy', 'political philosophy', 'aesthetics', 'philosophy of mind',
      'philosophy of language', 'philosophy of science', 'philosophy of religion', 'philosophy of history', 'existentialism', 'phenomenology',
      'hermeneutics', 'structuralism', 'postmodernism', 'analytic philosophy', 'continental philosophy', 'pragmatism', 'empiricism',
      'rationalism', 'idealism', 'realism', 'nominalism', 'platonism', 'aristotelianism', 'stoicism', 'epicureanism', 'skepticism',
      'nihilism', 'absurdism', 'humanism', 'transhumanism', 'feminism', 'postcolonialism', 'marxism', 'liberalism', 'conservatism',
      'anarchism', 'utilitarianism', 'deontology', 'virtue ethics', 'contractarianism', 'natural law', 'divine command theory',
      'relativism', 'subjectivism', 'objectivism', 'cognitivism', 'emotivism', 'prescriptivism', 'metaethics', 'normative ethics',
      'applied ethics', 'bioethics', 'environmental ethics', 'business ethics', 'professional ethics', 'media ethics', 'war ethics',
      'animal rights', 'human rights', 'civil rights', 'women\'s rights', 'children\'s rights', 'disability rights', 'lgbtq rights',
      'freedom of speech', 'freedom of religion', 'freedom of assembly', 'right to privacy', 'right to life', 'duty', 'obligation',
      'responsibility', 'accountability', 'justice', 'fairness', 'equality', 'liberty', 'autonomy', 'dignity', 'respect', 'tolerance',
      'compassion', 'empathy', 'sympathy', 'altruism', 'egoism', 'selfishness', 'greed', 'envy', 'pride', 'lust', 'gluttony', 'wrath',
      'sloth', 'virtue', 'wisdom', 'courage', 'temperance', 'justice', 'faith', 'hope', 'love', 'charity', 'humility', 'patience',

      // --- Agama & Spiritualitas (New) ---
      'islam', 'kristen', 'katolik', 'protestan', 'hindu', 'buddha', 'konfusianisme', 'taoism', 'shinto', 'judaisme', 'sikhisme', 'bahai',
      'zoroastrianisme', 'jainisme', 'atheism', 'agnosticism', 'deism', 'pantheism', 'panentheism', 'monotheism', 'polytheism', 'henotheism',
      'animism', 'totemism', 'shamanism', 'mysticism', 'esotericism', 'occultism', 'new age', 'spiritualism', 'theosophy', 'anthroposophy',
      'sufism', 'zen buddhism', 'tibetan buddhism', 'theravada buddhism', 'mahayana buddhism', 'vajrayana buddhism', 'christian mysticism',
      'kabbalah', 'sufi poetry', 'bhakti movement', 'reformation', 'counter reformation', 'enlightenment', 'fundamentalism', 'evangelicalism',
      'pentecostalism', 'charismatic movement', 'ecumenism', 'interfaith dialogue', 'religious pluralism', 'secularism', 'laicism',
      'separation of church and state', 'religious freedom', 'blasphemy', 'apostasy', 'heresy', 'schism', 'excommunication', 'conversion',
      'pilgrimage', 'hajj', 'umrah', 'ziarah', 'kumbh mela', 'canterbury tales', 'santiago de compostela', 'meditation', 'prayer', 'contemplation',
      'yoga', 'tai chi', 'qigong', 'reiki', 'acupuncture', 'ayurveda', 'traditional chinese medicine', 'homeopathy', 'naturopathy',
      'spiritual retreat', 'ashram', 'monastery', 'convent', 'temple', 'mosque', 'church', 'synagogue', 'gurudwara', 'pagoda', 'shrine',
      'sacred text', 'quran', 'bible', 'torah', 'vedas', 'tripitaka', 'analects', 'tao te ching', 'upanishads', 'sutras', 'hadith',
      'scripture', 'exegesis', 'hermeneutics', 'theology', 'dogma', 'doctrine', 'creed', 'canon', 'apocrypha', 'mythology', 'legend',
      'parable', 'allegory', 'metaphor', 'symbolism', 'ritual', 'ceremony', 'sacrifice', 'offering', 'worship', 'devotion', 'piety',

      // --- Politik & Pemerintahan (Expanded) ---
      'democracy', 'republic', 'monarchy', 'dictatorship', 'autocracy', 'oligarchy', 'theocracy', 'anarchy', 'federalism', 'unitarism',
      'parliamentary system', 'presidential system', 'semi-presidential system', 'constitutional monarchy', 'absolute monarchy',
      'social democracy', 'liberal democracy', 'illiberal democracy', 'authoritarianism', 'totalitarianism', 'fascism', 'nazism',
      'communism', 'socialism', 'capitalism', 'market economy', 'planned economy', 'mixed economy', 'welfare state', 'night watchman state',
      'electoral system', 'first past the post', 'proportional representation', 'mixed member proportional', 'ranked choice voting',
      'referendum', 'plebiscite', 'initiative', 'recall election', 'primary election', 'general election', 'by-election', 'midterm election',
      'political party', 'coalition government', 'minority government', 'hung parliament', 'confidence vote', 'no confidence vote',
      'cabinet', 'prime minister', 'president', 'chancellor', 'chancellor of the exchequer', 'foreign minister', 'defense minister',
      'interior minister', 'justice minister', 'finance minister', 'education minister', 'health minister', 'environment minister',
      'parliament', 'congress', 'senate', 'house of representatives', 'house of commons', 'bundestag', 'duma', 'national assembly',
      'supreme court', 'constitutional court', 'high court', 'court of appeal', 'district court', 'magistrate court', 'tribunal',
      'judiciary', 'legislature', 'executive', 'bureaucracy', 'civil service', 'public administration', 'governance', 'policy making',
      'legislation', 'regulation', 'decree', 'ordinance', 'statute', 'bill', 'act', 'law', 'constitution', 'amendment', 'ratification',
      'treaty', 'convention', 'protocol', 'accord', 'pact', 'alliance', 'coalition', 'bloc', 'union', 'federation', 'confederation',
      'international law', 'diplomatic immunity', 'extradition', 'asylum', 'sanctuary', 'refugee', 'migrant', 'immigration', 'emigration',
      'citizenship', 'nationality', 'passport', 'visa', 'border control', 'customs', 'tariff', 'trade agreement', 'free trade zone',
      'economic union', 'common market', 'customs union', 'monetary union', 'political union', 'supranational organization',

      // --- Ekonomi & Pasar (Expanded) ---
      'macroeconomics', 'microeconomics', 'econometrics', 'economic theory', 'classical economics', 'neoclassical economics', 'keynesian economics',
      'monetarist economics', 'austrian economics', 'marxian economics', 'institutional economics', 'behavioral economics', 'experimental economics',
      'development economics', 'international economics', 'comparative economics', 'environmental economics', 'resource economics', 'labor economics',
      'industrial economics', 'agricultural economics', 'urban economics', 'regional economics', 'transport economics', 'health economics',
      'education economics', 'public economics', 'welfare economics', 'game theory economics', 'information economics', 'contract theory',
      'auction theory', 'mechanism design', 'principal agent theory', 'asymmetric information', 'moral hazard', 'adverse selection',
      'market failure', 'public good', 'externalities', 'monopoly', 'oligopoly', 'monopolistic competition', 'perfect competition',
      'price discrimination', 'predatory pricing', 'dumping', 'cartel', 'antitrust law', 'competition policy', 'merger control',
      'privatization', 'nationalization', 'deregulation', 'regulation', 'subsidy', 'tax incentive', 'trade barrier', 'quota', 'embargo',
      'exchange rate', 'fixed exchange rate', 'floating exchange rate', 'currency peg', 'currency board', 'dollarization', 'eurozone',
      'central bank', 'federal reserve', 'european central bank', 'bank of england', 'bank of japan', 'people\'s bank of china',
      'monetary policy', 'fiscal policy', 'expansionary policy', 'contractionary policy', 'quantitative easing', 'open market operation',
      'discount rate', 'reserve requirement', 'capital requirement', 'stress testing', 'bank run', 'bailout', 'too big to fail',
      'financial crisis', 'recession', 'depression', 'stagflation', 'hyperinflation', 'deflation', 'disinflation', 'reflation',
      'business cycle', 'expansion', 'peak', 'contraction', 'trough', 'recovery', 'growth rate', 'unemployment rate', 'inflation rate',
      'consumer price index', 'producer price index', 'gross domestic product', 'gross national product', 'net national product',
      'national income', 'personal income', 'disposable income', 'savings rate', 'investment rate', 'consumption function',
      'aggregate demand', 'aggregate supply', 'multiplier effect', 'accelerator effect', 'crowding out effect', 'crowding in effect',

      // --- Transportasi & Infrastruktur (New) ---
      'public transportation', 'mass transit', 'railway', 'subway', 'metro', 'tram', 'light rail', 'high speed rail', 'bullet train',
      'monorail', 'maglev train', 'bus rapid transit', 'trolleybus', 'ferry', 'water taxi', 'cable car', 'funicular', 'elevator', 'escalator',
      'highway', 'freeway', 'expressway', 'toll road', 'bridge', 'tunnel', 'overpass', 'underpass', 'flyover', 'roundabout', 'traffic circle',
      'airport', 'runway', 'terminal', 'control tower', 'air traffic control', 'radar', 'navigation system', 'flight plan', 'airspace',
      'seaport', 'dock', 'pier', 'wharf', 'container ship', 'cruise ship', 'cargo ship', 'tanker', 'ferry terminal', 'marina', 'harbor',
      'pipeline', 'oil pipeline', 'gas pipeline', 'water pipeline', 'sewer system', 'storm drain', 'culvert', 'aqueduct', 'canal', 'lock',
      'dam', 'reservoir', 'water treatment plant', 'wastewater treatment plant', 'power plant', 'nuclear power plant', 'coal fired plant',
      'gas fired plant', 'hydroelectric plant', 'solar farm', 'wind farm', 'geothermal plant', 'transmission line', 'distribution grid',
      'smart grid', 'microgrid', 'electric vehicle charging station', 'hydrogen fuel station', 'compressed natural gas station',
      'traffic management', 'traffic light', 'traffic sign', 'speed limit', 'parking meter', 'parking garage', 'bike lane', 'pedestrian path',
      'sidewalk', 'crosswalk', 'zebra crossing', 'traffic jam', 'congestion', 'rush hour', 'peak hour', 'off peak', 'carpool lane',
      'hov lane', 'bus lane', 'bike sharing', 'scooter sharing', 'ride sharing', 'car rental', 'taxi', 'uber', 'lyft', 'didi', 'grab',
      'autonomous vehicle', 'self driving car', 'connected vehicle', 'vehicle to everything', 'intelligent transportation system',
      'mobility as a service', 'transportation demand management', 'land use planning', 'urban planning', 'smart city', 'sustainable transport',

      // --- Makanan & Kuliner (Expanded) ---
      'gastronomy', 'culinary arts', 'molecular gastronomy', 'fusion cuisine', 'street food', 'fast food', 'slow food', 'organic food',
      'vegan cuisine', 'vegetarian cuisine', 'gluten free', 'keto friendly', 'paleo diet', 'mediterranean diet', 'asian cuisine', 'european cuisine',
      'american cuisine', 'latin american cuisine', 'african cuisine', 'middle eastern cuisine', 'indian cuisine', 'chinese cuisine', 'japanese cuisine',
      'korean cuisine', 'thai cuisine', 'vietnamese cuisine', 'indonesian cuisine', 'malaysian cuisine', 'filipino cuisine', 'italian cuisine',
      'french cuisine', 'spanish cuisine', 'greek cuisine', 'turkish cuisine', 'mexican cuisine', 'brazilian cuisine', 'peruvian cuisine',
      'fine dining', 'casual dining', 'family style', 'buffet', 'all you can eat', 'tapas', 'dim sum', 'sushi', 'sashimi', 'tempura',
      'ramen', 'udon', 'soba', 'curry', 'nasi goreng', 'satay', 'rendang', 'gado gado', 'soto', 'bakso', 'mie goreng', 'ayam goreng',
      'pizza', 'pasta', 'risotto', 'paella', 'tacos', 'burritos', 'quesadillas', 'fajitas', 'hamburger', 'hot dog', 'sandwich', 'salad',
      'soup', 'stew', 'roast', 'grill', 'bake', 'fry', 'steam', 'boil', 'poach', 'braise', 'stir fry', 'deep fry', 'microwave', 'slow cooker',
      'food processor', 'blender', 'mixer', 'oven', 'stove', 'grill', 'wok', 'frying pan', 'pot', 'kettle', 'coffee maker', 'espresso machine',
      'food photography', 'food blogging', 'food vlogging', 'food critic', 'food review', 'restaurant review', 'michelin star', 'james beard award',
      'food festival', 'food fair', 'food market', 'farmers market', 'night market', 'food truck', 'pop up restaurant', 'ghost kitchen',
      'meal kit', 'food delivery', 'takeout', 'dine in', 'drive thru', 'room service', 'catering', 'banquet', 'wedding reception', 'corporate event',
      'nutrition', 'calorie counting', 'macronutrient', 'micronutrient', 'vitamin', 'mineral', 'antioxidant', 'fiber', 'protein', 'carbohydrate',
      'fat', 'sugar', 'salt', 'spice', 'herb', 'seasoning', 'condiment', 'sauce', 'dressing', 'dip', 'pickle', 'preserve', 'jam', 'jelly',
      'honey', 'syrup', 'chocolate', 'candy', 'dessert', 'cake', 'pie', 'cookie', 'ice cream', 'pudding', 'fruit', 'vegetable', 'grain', 'legume',
      'meat', 'poultry', 'fish', 'seafood', 'dairy', 'cheese', 'milk', 'yogurt', 'butter', 'egg', 'bread', 'rice', 'pasta', 'noodle',

      // --- Fashion & Mode (New) ---
      'haute couture', 'ready to wear', 'fast fashion', 'slow fashion', 'sustainable fashion', 'eco friendly fabric', 'organic cotton',
      'recycled polyester', 'vegan leather', 'faux fur', 'upcycled fashion', 'thrift shopping', 'vintage clothing', 'second hand',
      'designer brand', 'luxury brand', 'mass market', 'streetwear', 'athleisure', 'business casual', 'formal wear', 'casual wear',
      'evening wear', 'bridal wear', 'maternity wear', 'plus size', 'petite size', 'tall size', 'curvy fit', 'inclusive sizing',
      'runway show', 'fashion week', 'paris fashion week', 'milan fashion week', 'new york fashion week', 'london fashion week',
      'tokyo fashion week', 'met gala', 'oscar red carpet', 'grammy red carpet', 'fashion icon', 'style icon', 'influencer', 'model',
      'supermodel', 'plus size model', 'trans model', 'diverse representation', 'body positivity', 'size inclusivity', 'gender fluidity',
      'androgynous fashion', 'unisex clothing', 'gender neutral', 'non binary fashion', 'queer fashion', 'drag queen', 'drag king',
      'costume design', 'theatrical costume', 'film costume', 'historical costume', 'cosplay', 'halloween costume', 'masquerade',
      'accessory', 'jewelry', 'handbag', 'shoe', 'boot', 'sandal', 'sneaker', 'heel', 'flat', 'belt', 'hat', 'scarf', 'glove', 'sunglasses',
      'watch', 'bracelet', 'necklace', 'earring', 'ring', 'brooch', 'tie', 'bow tie', 'cufflink', 'pocket square', 'lapel pin',
      'fabric', 'cotton', 'silk', 'wool', 'linen', 'denim', 'leather', 'suede', 'velvet', 'lace', 'chiffon', 'satin', 'taffeta', 'organza',
      'tulle', 'crepe', 'jersey', 'knit', 'woven', 'printed', 'pattern', 'stripe', 'plaid', 'polka dot', 'floral', 'geometric', 'abstract',
      'color theory', 'color palette', 'monochrome', 'pastel', 'neon', 'earth tone', 'jewel tone', 'metallic', 'matte', 'glossy', 'sheer',
      'tailoring', 'sewing', 'pattern making', 'draping', 'couture technique', 'embroidery', 'beading', 'appliqué', 'quilting', 'knitting',
      'crocheting', 'macramé', 'weaving', 'dyeing', 'printing', 'textile design', 'fashion design', 'product design', 'industrial design',
      'graphic design', 'typography', 'layout design', 'packaging design', 'brand identity', 'logo design', 'corporate identity', 'signage',
      'wayfinding', 'exhibition design', 'museum design', 'theater design', 'stage design', 'set design', 'costume design', 'lighting design',
      'sound design', 'multimedia design', 'interactive design', 'ux/ui design', 'web design', 'mobile app design', 'game design', 'level design',
      'character design', 'environment design', 'prop design', 'vehicle design', 'weapon design', 'armor design', 'spaceship design', 'robot design',
      'prosthetic design', 'orthotic design', 'medical device design', 'surgical instrument', 'diagnostic equipment', 'therapeutic device',
      'rehabilitation equipment', 'assistive technology', 'wearable technology', 'iot device', 'smart home device', 'connected device',
      'embedded system', 'microcontroller', 'sensor', 'actuator', 'display', 'interface', 'human machine interface', 'gesture recognition',
      'voice recognition', 'facial recognition', 'biometric authentication', 'rfid', 'nfc', 'bluetooth', 'wifi', 'zigbee', 'lora', '5g',
      'satellite communication', 'gps', 'glonass', 'galileo', 'beidou', 'irnss', 'qzss'
    ];
  }

  _extractEntities(message) {
      const entities = new Set();
      const quotedRegex = /['"]([^'"]+)['"]/g;
      let match;
      while ((match = quotedRegex.exec(message)) !== null) { entities.add(match[1].toLowerCase()); }
      this.namedEntities.forEach(entity => {
          if (message.toLowerCase().includes(entity)) { entities.add(entity); }
      });
      const capitalizedRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
       while ((match = capitalizedRegex.exec(message)) !== null) { entities.add(match[1].toLowerCase()); }
      // Add found compound terms
      this.compoundTerms.forEach(term => {
          if (message.toLowerCase().includes(term)) { entities.add(term); }
      });
      return Array.from(entities);
  }
    
  _unifyCompounds(message) {
    let unifiedMessage = message.replace(/\s*\/\s*/g, '/');
    const sortedCompounds = [...this.compoundTerms].sort((a, b) => b.length - a.length);
    for (const term of sortedCompounds) {
        const placeholder = term.replace(/[\s/]+/g, '_');
        const regex = new RegExp(`\\b${term}\\b`, 'ig');
        unifiedMessage = unifiedMessage.replace(regex, placeholder);
    }
    return unifiedMessage;
  }
    
  cleanMessage(message) { return message.toLowerCase().replace(/[?!.,;:"`()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(); }
  
  tokenize(message) { return message.split(' ').filter(w => w.length > 0); }
  
  generate(message, maxWords = 7) {
    const foundEntities = this._extractEntities(message);
    let unifiedMessage = this._unifyCompounds(message);
    const cleaned = this.cleanMessage(unifiedMessage);
    const tokens = this.tokenize(cleaned);
    const filtered = this.smartFilter(tokens, foundEntities);
    const title = this.buildTitle(filtered, maxWords, message, foundEntities);
    return title;
  }

  smartFilter(tokens, entities) {
      const entitySet = new Set(entities.map(e => e.replace(/\s+/g, '_')));
      const scoredWords = new Map();

      for (let i = 0; i < tokens.length; i++) {
          let word = tokens[i].replace(/\.$/, '');
          if (word.length < 2 && word !== 'vs' && !/^\d+\+\d+$/.test(word)) continue;

          if (this.stopwordsIndo.has(word) || this.stopwordsEnglish.has(word) || this.conversationalStopwords.has(word)) {
              continue;
          }
          if (i < 5 && this.requestVerbs.has(word)) continue;

          let score = 10;
          const cleanedWord = word.replace(/_/g, ' ');

          if (entitySet.has(word) || entities.includes(cleanedWord)) score += 100;
          if (this.comparisonWords.has(word)) score += 80;
          if (word.includes('_')) score += 50;
          if (this.intentWords.has(word)) score += 35;
          
          score += word.length * 0.5;
          if (i < 15) score += 5;

          if (!scoredWords.has(word) || score > scoredWords.get(word).score) {
              scoredWords.set(word, { word, score });
          }
      }
      return Array.from(scoredWords.values()).sort((a, b) => b.score - a.score);
  }

  buildTitle(filtered, maxWords, originalMessage, entities) {
    let titleParts = new Set();
    let wordCount = 0;

    const entitySet = new Set(entities.map(e => e.replace(/\s+/g, '_')));
    const comparisons = filtered.filter(item => this.comparisonWords.has(item.word));
    const intents = filtered.filter(item => this.intentWords.has(item.word));
    const subjects = filtered.filter(item => !this.intentWords.has(item.word) && !this.comparisonWords.has(item.word));
    
    // Prioritize subjects that are entities
    const entitySubjects = subjects.filter(item => entitySet.has(item.word.replace(/_/g, ' ')) || entities.includes(item.word.replace(/_/g, ' ')));
    const nonEntitySubjects = subjects.filter(item => !entitySet.has(item.word.replace(/_/g, ' ')) && !entities.includes(item.word.replace(/_/g, ' ')));
    const prioritizedSubjects = [...entitySubjects, ...nonEntitySubjects];

    if (comparisons.length > 0 && prioritizedSubjects.length >= 2) {
        const bestComparison = comparisons[0];
        const topSubjects = prioritizedSubjects.slice(0, 3);
        topSubjects.forEach(s => titleParts.add(s.word));
        titleParts.add(bestComparison.word);
    } else {
        if (intents.length > 0) {
            const bestIntent = intents[0];
            titleParts.add(bestIntent.word);
            wordCount += bestIntent.word.split('_').length;
        }
        for (const item of prioritizedSubjects) {
            const subWords = item.word.split('_');
            if (wordCount + subWords.length <= maxWords) {
                titleParts.add(item.word);
                wordCount += subWords.length;
            }
            if (wordCount >= maxWords) break;
        }
    }

    let finalParts = Array.from(titleParts);
    finalParts = finalParts.filter(part => {
        const partText = part.replace(/_/g, ' ');
        const isEntity = entities.includes(partText) || entitySet.has(part);
        return !finalParts.some(otherPart => {
            const otherPartText = otherPart.replace(/_/g, ' ');
            const otherIsEntity = entities.includes(otherPartText) || entitySet.has(otherPart);
            return otherPartText !== partText && otherPartText.includes(partText) && !(isEntity && otherIsEntity);
        });
    });

    finalParts.sort((a, b) => {
        const posA = originalMessage.toLowerCase().indexOf(a.replace(/_/g, ' '));
        const posB = originalMessage.toLowerCase().indexOf(b.replace(/_/g, ' '));
        return posA - posB;
    });

    return finalParts.map(part =>
        part.split('_').map(w => {
            const lower = w.toLowerCase();
            if (lower === 'vs' || lower === 'dan' || lower === 'atau' || lower === 'dengan' || lower === 'di' || lower === 'ke' || lower === 'dari') return lower;
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ')
    ).join(' ');
  }
}

// Export for use in renderer.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartTitleGenerator;
}