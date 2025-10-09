fungsi save/load sudah perfect, jangan rubah apapun.

#1 Pada projects session, pada messagenya biasanya gini:

ANALYZING FILES
UAS PKN.docx
ACTION
Analyzing file structure of "UAS PKN.docx" This will give me a comprehensive overview of the document's structure, sections, and content organization, helping me understand the scope and depth of the analysis that likely contributed to the A grade.
ACTION
Searching for pattern "A|nilai|nilai A|nilai sempurna|nilai maksimal" This search will help me find explicit mentions of the A grade or evaluation results, confirming the grade and potentially providing context about why it was achieved.
ACTION
Searching for pattern "analisis|metode|pendekatan|penelitian|metodologi" This will help me identify the analytical approach and methodology used, which is crucial for understanding how the analysis was conducted and what made it worthy of an A grade.
ACTION
Searching for pattern "nama|oleh|penulis|pembuat|disusun oleh|ditulis oleh" This search will help me identify the author or creator of the document, which is necessary to provide proper praise as requested.
ACTION
Searching for pattern "kesimpulan|hasil|temuan|rekomendasi|saran" This will help me identify the conclusions and findings, which are likely indicators of the high quality analysis that earned the A grade.

tapi seharusnya action langsung aja, contohnya gini:
ANALYZING FILES
UAS PKN.docx
Analyzing file structure of "UAS PKN.docx"
This will give me a comprehensive overview of the document's structure, sections, and content organization, helping me understand the scope and depth of the analysis that likely contributed to the A grade.
Searching for pattern "A|nilai|nilai A|nilai sempurna|nilai maksimal"
This search will help me find explicit mentions of the A grade or evaluation results, confirming the grade and potentially providing context about why it was achieved.
Searching for pattern "analisis|metode|pendekatan|penelitian|metodologi"
This will help me identify the analytical approach and methodology used, which is crucial for understanding how the analysis was conducted and what made it worthy of an A grade.
Searching for pattern "nama|oleh|penulis|pembuat|disusun oleh|ditulis oleh"
This search will help me identify the author or creator of the document, which is necessary to provide proper praise as requested.
Searching for pattern "kesimpulan|hasil|temuan|rekomendasi|saran"
This will help me identify the conclusions and findings, which are likely indicators of the high quality analysis that earned the A grade.

ini sudah perfect, gak perlu rubah apapun, hanya yg masalah di atas aja.


#2 Pada message di session with websearch on.
bro, cari info nepal terbaru dong

REASONING
The user is asking for the latest information about Nepal ('info nepal terbaru'), which requires real-time internet access to find current news, events, or developments about the country.
KEYWORDS
Nepal latest news 2025
Nepal terbaru 2025
Nepal current events 2025

itu sudah perfect, hanya saja seperti yang instant, jadi kejanggalannya adalah, thinking update disini dikirim, dan tiba tiba mode think final result sudah muncul, meskipun tidak mengganggu mata, tapi ini kejanggalan.

secara logika, Keyword itu ditentukan di request pertama setelah Decided request. setelah itu pasti ada keyword dari response AI serta reasoningnya. nah intinya nanti juga ada link hasil keywordnya.

kamu bisa cek dulu, kenapa ini instant. padahal untuk ke respons final harusnya ada jeda (jangan tambah delay, karna itu bukan masalahnya, karena sudah perfect dan cepat, jadi ini bukan masalah delay typewriter, tapi lebih ke "kapan backend ngirim ke frontend" ) (masalah ini tidak ada pada projects session, fokus cari di backend).

dan satu lagi, kadang search api tidak kasih link apa apa. karna mungkin gak ada api, atau api limit, atau habis credit. itu juga harusnya kirim updatenya ke frontend. biar user tau, kenapa AI ga bisa nyari.
