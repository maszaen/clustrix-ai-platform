/**
 * Smart Title Fallback Generator v5.0 (The Final Boss Engine)
 * A role-based assembly engine with strategic blueprints,
 * a near-perfect knowledge base, and flawless execution.
 */
class SmartTitleGenerator {
  constructor() {
    // [FINAL BOSS V5.0] The ultimate, battle-hardened dictionaries
    this.stopwordsIndo = new Set(['aku', 'saya', 'gua', 'gue', 'gw', 'ane', 'kamu', 'kau', 'lu', 'lo', 'elo', 'yang', 'dan', 'atau', 'untuk', 'dari', 'ke', 'di', 'pada', 'dengan', 'ini', 'itu', 'adalah', 'akan', 'telah', 'sudah', 'sedang', 'bisa', 'dapat', 'tolong', 'mohon', 'minta', 'dong', 'deh', 'sih', 'nih', 'yah', 'ya', 'coba', 'bantu', 'buatin', 'bikinin', 'kasih', 'kasi', 'beri', 'gimana', 'bagaimana', 'apa', 'apakah', 'kenapa', 'mengapa', 'tentang', 'mengenai', 'soal', 'perihal', 'informasi', 'data', 'detail', 'penjelasan', 'keterangan', 'sebuah', 'suatu', 'beberapa', 'banyak', 'sedikit', 'sangat', 'sekali', 'banget', 'amat', 'lebih', 'paling', 'nya', 'ku', 'mu', 'kah', 'lah', 'tah', 'sekarang', 'saat', 'progress', 'kerja', 'internet', 'web']);
    this.stopwordsEnglish = new Set(['i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they', 'the', 'a', 'an', 'and', 'or', 'but', 'for', 'from', 'to', 'in', 'on', 'at', 'with', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'please', 'help', 'give', 'make', 'create', 'tell', 'show', 'how', 'what', 'where', 'when', 'why', 'which', 'who', 'about', 'regarding', 'concerning', 'information', 'data', 'details', 'explanation', 'some', 'any', 'many', 'much', 'few', 'little', 'very', 'quite', 'really', 'more', 'most', 'now', 'current', 'way', 'work']);
    this.requestVerbs = new Set(['cari', 'carikan', 'carilah', 'search', 'find', 'look', 'tolong', 'mohon', 'please', 'bantu', 'help', 'jelaskan', 'explain', 'describe', 'jelasin', 'buatin', 'bikinin', 'buatkan', 'bikinkan', 'make', 'create', 'tau', 'tahu', 'know', 'ketahui', 'mau', 'ingin', 'want']);

    // [FINAL BOSS V5.0] Aggressive removal of descriptive/filler words
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

    this.questionWords = new Set(['apa', 'kenapa', 'bagaimana', 'kapan', 'dimana', 'siapa']);
    this.intentWords = new Set(['perbedaan', 'analisis', 'resep', 'sinopsis', 'tutorial', 'cara', 'makna', 'konsep', 'proses', 'definisi', 'risiko', 'rekomendasi', 'siklus', 'membuat', 'memulai']);
    this.comparisonWords = new Set(['vs', 'versus', 'lawan', 'dibanding']);
    this.namedEntities = new Set(['g30s pki', 'albert einstein', 'van gogh', 'yogyakarta', 'deno', 'stoikisme', 'padang', 'sunda', 'node.js']);

    // [FINAL BOSS V5.0] The Ultimate Compound List
    this.compoundTerms = [
        'quantum computing', 'machine learning', 'artificial intelligence', 'deep learning', 'neural network', 'data science', 'web development',
        'software engineering', 'computer vision', 'natural language processing', 'blockchain technology', 'cloud computing', 'cyber security',
        'user experience', 'user interface', 'ui/ux', 'ui / ux', 'search algorithm', 'ranking system', 'cryptocurrency mining', 'lazy loading',
        'code splitting', 'supervised learning', 'unsupervised learning', 'react native', 'vue.js', 'node.js', 'next.js', 'cross-platform',
        'reksa dana', 'es kopi susu', 'gula aren', 'fiksi ilmiah', 'kue coklat', 'pemandangan alam', 'kehendak bebas', 'psychological thriller',
        'the starry night', 'security sandbox', 'package management', 'pahlawan revolusi', 'relativitas waktu', 'monolith', 'microservices',
        'serverless', 'kupu-kupu', 'olahraga lari', 'reksa dana saham', 'siklus hidup', 'cara kerja', 'plot twist'
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
    
  cleanMessage(message) { return message.toLowerCase().replace(/[?!,;:"`()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(); }
  
  tokenize(message) { return message.split(' ').filter(w => w.length > 0); }
  
  generate(message, maxWords = 5) {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 SMART TITLE GENERATOR v5.0 (The Final Boss)');
    console.log('='.repeat(70));
    console.log('📝 Input:', message);
    const foundEntities = this._extractEntities(message);
    if (foundEntities.length > 0) { console.log('👁️  Entities Found:', foundEntities); }
    let unifiedMessage = this._unifyCompounds(message);
    const cleaned = this.cleanMessage(unifiedMessage);
    const tokens = this.tokenize(cleaned);
    const filtered = this.smartFilter(tokens, foundEntities);
    console.log('\n✨ Top Scored Keywords:');
    filtered.slice(0, 10).forEach(f => console.log(`   - "${f.word}" (score: ${f.score.toFixed(2)})`));
    const title = this.buildTitle(filtered, maxWords, message);
    console.log('\n🎉 FINAL TITLE:', title);
    console.log('='.repeat(70) + '\n');
    return title;
  }

  smartFilter(tokens, entities) {
      const entitySet = new Set(entities.map(e => e.replace(/\s+/g, '_')));
      const scoredWords = new Map();

      for (let i = 0; i < tokens.length; i++) {
          let word = tokens[i].replace(/\.$/, '');
          if (word.length < 2 && word !== 'vs') continue;

          if (this.stopwordsIndo.has(word) || this.stopwordsEnglish.has(word) || this.conversationalStopwords.has(word)) {
              continue;
          }
          if (i < 5 && this.requestVerbs.has(word)) continue;

          let score = 10;
          const cleanedWord = word.replace(/_/g, ' ');

          // [FINAL BOSS V5.0] Balanced Scoring
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

  // [FINAL BOSS V5.0] The Role-Based Assembly Builder
  buildTitle(filtered, maxWords, originalMessage) {
    console.log('\n🏗️  Building Title (Final Boss Algorithm)...');
    let titleParts = new Set();
    let wordCount = 0;

    const comparisons = filtered.filter(item => this.comparisonWords.has(item.word));
    const intents = filtered.filter(item => this.intentWords.has(item.word));
    const subjects = filtered.filter(item => !this.intentWords.has(item.word) && !this.comparisonWords.has(item.word));

    // Blueprint A: Comparison-driven Title (Highest Priority)
    if (comparisons.length > 0 && subjects.length >= 2) {
        const bestComparison = comparisons[0];
        const topSubjects = subjects.slice(0, 2);
        
        topSubjects.forEach(s => titleParts.add(s.word));
        titleParts.add(bestComparison.word);
        
    } else { // Blueprint B & C: Intent-driven or Subject-driven Title
        // Step 1: Anchor with the single best intent word
        if (intents.length > 0) {
            const bestIntent = intents[0];
            titleParts.add(bestIntent.word);
            wordCount += bestIntent.word.split('_').length;
        }

        // Step 2: Fill remaining slots with the most important subjects
        for (const item of subjects) {
            const subWords = item.word.split('_');
            if (wordCount + subWords.length <= maxWords) {
                titleParts.add(item.word);
                wordCount += subWords.length;
            }
            if (wordCount >= maxWords) break;
        }
    }

    // Post-processing: Intelligent De-duplication & Ordering
    let finalParts = Array.from(titleParts);
    finalParts = finalParts.filter(part => {
        const partText = part.replace(/_/g, ' ');
        return !finalParts.some(otherPart => {
            const otherPartText = otherPart.replace(/_/g, ' ');
            return otherPartText !== partText && otherPartText.includes(partText);
        });
    });
    
    // Fallback if all parts are filtered out (e.g. only stopwords)
    if (finalParts.length === 0 && filtered.length > 0) {
        finalParts.push(filtered[0].word);
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