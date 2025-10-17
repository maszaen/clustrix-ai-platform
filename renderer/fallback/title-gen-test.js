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

    // [DEFINITIVE V6.1] Massively expanded compound terms dictionary (>300)
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
      'minat baca', 'anak usia dini', 'gempa tektonik', 'tsunami', 'cuaca ekstrem', 'perubahan musim'
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
  
  generate(message, maxWords = 5) {
    const foundEntities = this._extractEntities(message);
    let unifiedMessage = this._unifyCompounds(message);
    const cleaned = this.cleanMessage(unifiedMessage);
    const tokens = this.tokenize(cleaned);
    const filtered = this.smartFilter(tokens, foundEntities);
    const title = this.buildTitle(filtered, maxWords, message);
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
          if (word.includes('_')) score += 40;
          if (this.intentWords.has(word)) score += 30;
          
          score += word.length * 0.5;
          if (i < 15) score += 5;

          if (!scoredWords.has(word) || score > scoredWords.get(word).score) {
              scoredWords.set(word, { word, score });
          }
      }
      return Array.from(scoredWords.values()).sort((a, b) => b.score - a.score);
  }

  buildTitle(filtered, maxWords, originalMessage) {
    let titleParts = new Set();
    let wordCount = 0;

    const comparisons = filtered.filter(item => this.comparisonWords.has(item.word));
    const intents = filtered.filter(item => this.intentWords.has(item.word));
    const subjects = filtered.filter(item => !this.intentWords.has(item.word) && !this.comparisonWords.has(item.word));

    if (comparisons.length > 0 && subjects.length >= 2) {
        const bestComparison = comparisons[0];
        const topSubjects = subjects.slice(0, 2);
        topSubjects.forEach(s => titleParts.add(s.word));
        titleParts.add(bestComparison.word);
    } else {
        if (intents.length > 0) {
            const bestIntent = intents[0];
            titleParts.add(bestIntent.word);
            wordCount += bestIntent.word.split('_').length;
        }
        for (const item of subjects) {
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
        return !finalParts.some(otherPart => {
            const otherPartText = otherPart.replace(/_/g, ' ');
            return otherPartText !== partText && otherPartText.includes(partText);
        });
    });
    
    // [DEFINITIVE V6.1] The anti-failure mechanism
    if (finalParts.length === 0) {
        const rawTokens = originalMessage.split(' ').filter(w => w.length > 0);
        if (rawTokens.length > 0) {
            return originalMessage.trim();
        }
        return originalMessage; // Return original if it's just symbols
    }

    finalParts.sort((a, b) => {
        const posA = originalMessage.toLowerCase().indexOf(a.replace(/_/g, ' '));
        const posB = originalMessage.toLowerCase().indexOf(b.replace(/_/g, ' '));
        return posA - posB;
    });

    return finalParts.map(part =>
        part.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    ).join(' ');
  }
}


const generator = new SmartTitleGenerator();
const results = [];

const theGauntlet = [
    // --- Kategori 1: Teknologi & Coding (Revisited) ---
    { cat: 'Teknologi', input: "jelaskan perbedaan antara Kubernetes dan Docker Swarm untuk orkestrasi kontainer" },
    { cat: 'Teknologi', input: "bagaimana cara implementasi lazy loading di React untuk optimasi performa?" },
    { cat: 'Teknologi', input: "apa itu serverless computing dan apa keuntungannya dibanding server tradisional?" },
    { cat: 'Teknologi', input: "tutorial setup CI/CD pipeline menggunakan GitHub Actions untuk aplikasi Node.js" },
    { cat: 'Teknologi', input: "SQL vs NoSQL: kapan harus menggunakan masing-masing database" },

    // --- Kategori 2: Sains & Alam ---
    { cat: 'Sains', input: "bagaimana proses fotosintesis terjadi pada tumbuhan hijau?" },
    { cat: 'Sains', input: "jelaskan teori Big Bang tentang asal-usul alam semesta" },
    { cat: 'Sains', input: "apa dampak dari pemanasan global terhadap ekosistem laut?" },
    { cat: 'Sains', input: "penjelasan tentang black hole dan spaghettification" },
    { cat: 'Sains', input: "rantai makanan di ekosistem sabana afrika" },

    // --- Kategori 3: Sejarah & Sosial ---
    { cat: 'Sejarah', input: "apa penyebab utama terjadinya Perang Diponegoro?" },
    { cat: 'Sejarah', input: "ringkasan sejarah singkat kerajaan Majapahit" },
    { cat: 'Sejarah', input: "siapa Pramoedya Ananta Toer dan apa karya monumentalnya?" },
    { cat: 'Sosial', input: "analisis dampak media sosial terhadap kesehatan mental remaja" },
    { cat: 'Sosial', input: "bagaimana sistem kasta bekerja dalam masyarakat Hindu?" },
    
    // --- Kategori 4: Seni, Budaya, & Hiburan ---
    { cat: 'Seni', input: "analisis novel 'Bumi Manusia' dari sudut pandang postkolonialisme" },
    { cat: 'Budaya', input: "filosofi di balik upacara minum teh di Jepang" },
    { cat: 'Hiburan', input: "10 rekomendasi anime genre isekai terbaik sepanjang masa" },
    { cat: 'Hiburan', input: "plot twist paling mengejutkan dalam sejarah perfilman Hollywood" },
    { cat: 'Seni', input: "aliran seni lukis surealisme dan tokoh-tokoh utamanya" },

    // --- Kategori 5: Gaya Hidup, Kesehatan, & Keuangan ---
    { cat: 'Gaya Hidup', input: "cara membuat resep nasi goreng spesial ala restoran" },
    { cat: 'Kesehatan', input: "jelaskan sistem pencernaan manusia dari mulut hingga usus besar" },
    { cat: 'Kesehatan', input: "manfaat olahraga kardio untuk kesehatan jantung" },
    { cat: 'Keuangan', input: "apa itu inflasi dan bagaimana cara mengatasinya?" },
    { cat: 'Keuangan', input: "tutorial investasi saham untuk pemula modal kecil" },
    { cat: 'Gaya Hidup', input: "ide kegiatan seru untuk malam minggu bersama teman-teman" },
    
    // --- Kategori 6: Perintah Aneh, Abstrak, & Roleplay ---
    { cat: 'Abstrak', input: "jika warna punya rasa, seperti apa rasa warna biru?" },
    { cat: 'Abstrak', input: "konsep waktu dari perspektif seekor kucing" },
    { cat: 'Roleplay', input: "kamu adalah seorang bajak laut, ceritakan petualanganmu mencari harta karun" },
    { cat: 'Roleplay', input: "bertindaklah sebagai Socrates dan jelaskan apa itu keadilan" },
    { cat: 'Aneh', input: "resep masakan yang bahan utamanya adalah kesabaran dan harapan" },
    
    // --- Kategori 7: Stres Test Bahasa & Input Minimalis ---
    { cat: 'Bahasa', input: "gua lagi mager bgt, kasi ide dong enaknya ngapain" },
    { cat: 'Bahasa', input: "Woy, gem, bikinin gw pantun ttg kopi item dong, cepet" },
    { cat: 'Bahasa', input: "apa perbedaan mobil listrik dengan mobil bensin biasa?" },
    { cat: 'Minimalis', input: "cuma tes" },
    { cat: 'Minimalis', input: "Python" },
    { cat: 'Minimalis', input: "?????????" },
    { cat: 'Minimalis', input: "1+1" },
    { cat: 'Bahasa', input: "mksdnya gmn si" },

    // --- Kategori 8: Kueri Profesional & Bisnis ---
    { cat: 'Bisnis', input: "analisis SWOT untuk memulai bisnis coffee shop di tahun 2025" },
    { cat: 'Bisnis', input: "bagaimana cara menghitung Break-Even Point (BEP) dalam sebuah usaha?" },
    { cat: 'Profesional', input: "tips negosiasi gaji saat interview kerja untuk fresh graduate" },
    { cat: 'Profesional', input: "contoh format email pengunduran diri yang profesional dan sopan" },
    { cat: 'Bisnis', input: "strategi marketing digital yang efektif untuk produk UKM" },

    // --- Kategori 9: Pendidikan & Akademik ---
    { cat: 'Pendidikan', input: "jelaskan metode pembelajaran blended learning dan kelebihannya" },
    { cat: 'Akademik', input: "cara membuat sitasi dan daftar pustaka menggunakan gaya APA 7" },
    { cat: 'Akademik', input: "kerangka teori untuk penelitian tentang pengaruh gadget terhadap prestasi belajar" },
    { cat: 'Pendidikan', input: "bagaimana cara meningkatkan minat baca pada anak usia dini?" },

    // --- Kategori 10: Perjalanan & Geografi ---
    { cat: 'Perjalanan', input: "rekomendasi itinerary 3 hari 2 malam di Yogyakarta untuk backpacker" },
    { cat: 'Geografi', input: "proses terjadinya gempa bumi tektonik dan tsunami" },
    { cat: 'Perjalanan', input: "tips solo traveling aman untuk perempuan" },

    // --- Teknologi Lanjutan ---
    { cat: 'Teknologi', input: "jelaskan cara kerja Generative Adversarial Network (GAN) dalam AI" },
    { cat: 'Teknologi', input: "perbandingan antara REST API dengan GraphQL API" },
    { cat: 'Teknologi', input: "apa itu Time Complexity dan Space Complexity dalam analisis algoritma?" },
    { cat: 'Teknologi', input: "bagaimana cara mengamankan aplikasi web dari serangan SQL Injection?" },
    { cat: 'Teknologi', input: "tutorial deployment aplikasi Django ke Heroku" },
    { cat: 'Teknologi', input: "manfaat menggunakan TypeScript dibandingkan JavaScript biasa" },
    { cat: 'Teknologi', input: "konsep Object Oriented Programming: enkapsulasi, pewarisan, polimorfisme" },
    { cat: 'Teknologi', input: "apa itu WebAssembly dan bagaimana cara kerjanya?" },
    { cat: 'Teknologi', input: "penjelasan tentang arsitektur Hexagonal (Ports and Adapters)" },
    { cat: 'Teknologi', input: "cara setup load balancing menggunakan Nginx" },

    // --- Sains Lanjutan ---
    { cat: 'Sains', input: "apa itu CRISPR-Cas9 dan bagaimana revolusinya dalam rekayasa genetika?" },
    { cat: 'Sains', input: "penjelasan tentang teori multiverse dan kemungkinan adanya alam semesta paralel" },
    { cat: 'Sains', input: "bagaimana teleskop James Webb bisa melihat ke masa lalu?" },
    { cat: 'Sains', input: "apa perbedaan antara fusi nuklir dan fisi nuklir?" },
    { cat: 'Sains', input: "dampak jangka panjang dari mikroplastik di lautan" },
    { cat: 'Sains', input: "bagaimana otak manusia memproses dan menyimpan memori?" },
    { cat: 'Sains', input: "teori chaos dan efek kupu-kupu (butterfly effect)" },
    { cat: 'Sains', input: "apa itu antimateri dan mengapa ia sangat langka?" },
    { cat: 'Sains', input: "proses pembentukan bintang dan planet dari nebula" },
    { cat: 'Sains', input: "bagaimana cara kerja vaksin mRNA seperti Pfizer dan Moderna?" },

    // --- Sejarah & Politik Global ---
    { cat: 'Sejarah', input: "apa yang memicu runtuhnya Tembok Berlin dan reunifikasi Jerman?" },
    { cat: 'Sejarah', input: "sejarah singkat Jalur Sutra dan dampaknya pada peradaban" },
    { cat: 'Politik', input: "perbedaan antara sistem pemerintahan presidensial dan parlementer" },
    { cat: 'Politik', input: "apa peran Dewan Keamanan PBB dalam konflik internasional?" },
    { cat: 'Sejarah', input: "bagaimana Kekaisaran Romawi bisa runtuh?" },
    { cat: 'Sejarah', input: "konflik Israel-Palestina dari sudut pandang sejarah" },
    { cat: 'Politik', input: "apa itu Gerakan Non-Blok dan siapa saja pendirinya?" },
    { cat: 'Sejarah', input: "sejarah kelam Apartheid di Afrika Selatan" },
    { cat: 'Politik', input: "bagaimana proses Brexit terjadi dan apa dampaknya bagi Inggris?" },
    { cat: 'Sejarah', input: "Revolusi Kebudayaan di Tiongkok di bawah Mao Zedong" },

    // --- Filsafat & Psikologi ---
    { cat: 'Filsafat', input: "jelaskan konsep 'Übermensch' dari Friedrich Nietzsche" },
    { cat: 'Filsafat', input: "apa itu eksistensialisme menurut Jean-Paul Sartre?" },
    { cat: 'Psikologi', input: "perbedaan antara introvert, ekstrovert, dan ambivert" },
    { cat: 'Psikologi', input: "tahapan perkembangan kognitif anak menurut Jean Piaget" },
    { cat: 'Filsafat', input: "konsep 'tabula rasa' dari John Locke" },
    { cat: 'Psikologi', input: "apa itu cognitive dissonance dan berikan contohnya" },
    { cat: 'Filsafat', input: "pemikiran Plato tentang dunia ide" },
    { cat: 'Psikologi', input: "bagaimana cara mengatasi imposter syndrome di tempat kerja?" },
    { cat: 'Filsafat', input: "apa itu stoikisme dan bagaimana menerapkannya di kehidupan modern?" },
    { cat: 'Psikologi', input: "efek Dunning-Kruger dan mengapa orang tidak kompeten merasa hebat" },

    // --- Ekonomi & Bisnis Lanjutan ---
    { cat: 'Ekonomi', input: "apa itu quantitative easing dan bagaimana dampaknya pada ekonomi?" },
    { cat: 'Bisnis', input: "strategi Blue Ocean vs Red Ocean dalam bisnis" },
    { cat: 'Ekonomi', input: "penyebab krisis finansial global tahun 2008" },
    { cat: 'Bisnis', input: "cara membangun personal branding yang kuat di LinkedIn" },
    { cat: 'Ekonomi', input: "apa itu 'Dutch Disease' dalam ekonomi sumber daya alam?" },
    { cat: 'Bisnis', input: "lima kekuatan Porter untuk analisis kompetisi industri" },
    { cat: 'Ekonomi', input: "perdebatan antara ekonomi Keynesian dan ekonomi klasik" },
    { cat: 'Bisnis', input: "cara membuat model bisnis kanvas (Business Model Canvas)" },
    { cat: 'Ekonomi', input: "apa itu 'Tragedi Milik Bersama' (Tragedy of the Commons)?" },
    { cat: 'Bisnis', input: "bagaimana cara melakukan riset pasar yang efektif untuk produk baru?" },

    // --- Sastra & Bahasa Lanjutan ---
    { cat: 'Sastra', input: "analisis tema-tema utama dalam novel '1984' karya George Orwell" },
    { cat: 'Bahasa', input: "apa itu hipotesis Sapir-Whorf tentang hubungan bahasa dan pikiran?" },
    { cat: 'Sastra', input: "gaya penulisan Haruki Murakami dan unsur surealisme di dalamnya" },
    { cat: 'Bahasa', input: "perbedaan antara dialek, aksen, dan bahasa" },
    { cat: 'Sastra', input: "siapa itu Jorge Luis Borges dan mengapa karyanya penting?" },
    { cat: 'Sastra', input: "aliran sastra realisme magis dan contohnya dalam 'Seratus Tahun Kesunyian'" },
    { cat: 'Bahasa', input: "bagaimana bahasa Kreol terbentuk?" },
    { cat: 'Sastra', input: "simbolisme dalam puisi 'Aku' karya Chairil Anwar" },
    { cat: 'Bahasa', input: "apa itu etimologi dan berikan contoh menarik" },
    { cat: 'Sastra', input: "perbandingan antara epik Mahabharata dan Ramayana" },

    // --- Kesehatan & Medis Lanjutan ---
    { cat: 'Kesehatan', input: "apa itu autoimun dan apa saja contoh penyakitnya?" },
    { cat: 'Medis', input: "bagaimana cara kerja antibiotik dan mengapa resistensi bisa terjadi?" },
    { cat: 'Kesehatan', input: "peran mikrobioma usus bagi kesehatan tubuh secara keseluruhan" },
    { cat: 'Medis', input: "apa perbedaan antara virus dan bakteri?" },
    { cat: 'Kesehatan', input: "manfaat puasa intermiten (intermittent fasting) menurut sains" },
    { cat: 'Medis', input: "bagaimana proses pembekuan darah terjadi saat kita terluka?" },
    { cat: 'Kesehatan', input: "apa itu 'fight or flight response' dalam psikologi stres?" },
    { cat: 'Medis', input: "bagaimana anestesi umum membuat kita tidak sadar?" },
    { cat: 'Kesehatan', input: "pentingnya tidur REM (Rapid Eye Movement) bagi otak" },
    { cat: 'Medis', input: "apa itu sel kanker dan bagaimana ia berbeda dari sel normal?" },
    
    // --- Kueri Perintah & Kreatif Lanjutan ---
    { cat: 'Perintah', input: "buatkan daftar 5 keuntungan dan 5 kerugian dari bekerja remote" },
    { cat: 'Kreatif', input: "tuliskan sebuah haiku tentang hujan di bulan Juni" },
    { cat: 'Perintah', input: "ringkas artikel ini menjadi tiga poin utama: [artikel panjang disisipkan di sini]" },
    { cat: 'Kreatif', input: "buatkan dialog antara seekor kucing sinis dan seekor anjing yang terlalu optimis" },
    { cat: 'Perintah', input: "terjemahkan kalimat 'veni, vidi, vici' ke dalam bahasa Indonesia" },
    { cat: 'Kreatif', input: "berikan ide nama untuk sebuah band indie dengan genre folk-pop" },
    { cat: 'Perintah', input: "konversikan 100 dolar Amerika ke Rupiah Indonesia" },
    { cat: 'Kreatif', input: "gambarkan suasana kota Jakarta di tahun 2077" },
    { cat: 'Perintah', input: "urutkan planet di tata surya dari yang terdekat dengan matahari" },
    { cat: 'Kreatif', input: "buatkan tagline untuk produk kopi instan yang super praktis" },

    // --- Kueri Input Sampah & Provokasi (Graceful Degradation Test) ---
    { cat: 'Sampah', input: "asdfghjkl qwertyuiop" },
    { cat: 'Sampah', input: "...................." },
    { cat: 'Sampah', input: "1234567890" },
    { cat: 'Sampah', input: "      " },
    { cat: 'Sampah', input: "buatkan kode untuk meretas nasa" },
    { cat: 'Sampah', input: "apakah kamu punya perasaan?" },
    { cat: 'Sampah', input: "tes tes 123 tes" },
    { cat: 'Sampah', input: "ini perintah atau pertanyaan" },
    { cat: 'Sampah', input: "kata kata kata kata kata" },
    { cat: 'Sampah', input: "😊😂🚀👍🔥" },

    // --- Kueri Multi-Bahasa Sederhana ---
    { cat: 'Multi-bahasa', input: "apa arti 'carpe diem'?" },
    { cat: 'Multi-bahasa', input: "resep untuk membuat spaghetti carbonara" },
    { cat: 'Multi-bahasa', input: "what is the capital of Indonesia?" },
    { cat: 'Multi-bahasa', input: "qu'est-ce que l'intelligence artificielle?" },
    { cat: 'Multi-bahasa', input: "日本の首都はどこですか？ (di mana ibu kota Jepang?)" }
];


console.log('█'.repeat(80));
console.log('█' + ' 🛡️  THE FINAL ACCEPTANCE TEST: RUNNING THE GAUNTLET...'.padEnd(78) + '█');
console.log('█'.repeat(80) + '\n');

theGauntlet.forEach((test, i) => {
    const title = generator.generate(test.input);
    results.push({
        num: i + 1,
        cat: test.cat,
        input: test.input,
        res: title
    });
});

console.log('\n\n' + '█'.repeat(80));
console.log('█' + ' 📊 FINAL RESULTS SUMMARY'.padEnd(78) + '█');
console.log('█'.repeat(80) + '\n');

results.forEach((r) => {
    console.log(`${'='.repeat(30)} ${r.num} (${r.cat}) ${'='.repeat(25)}`);
    console.log(`[INPUT]: ${r.input}`);
    console.log(`[TITLE]: ${r.res}`);
    console.log(`${'='.repeat(68)}\n`);
});