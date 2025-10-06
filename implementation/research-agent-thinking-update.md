perbaiki thinking update content.
Saat ini semua konten yang ada di thinking text, semua newline akan dihapus, dan itu hanya cocok pada think mode biasa, tidak cocok untuk thinking update dari backend misal websearch, dan search agent.

Thinking update output saat ini pada research agent (tanpa ada new line dan, bahasa kaku, konten kurang lengkap dan tidak informatif):
Analyzing Project Files:UAS PKN.docx Analyzing:"oke, apa isi file ini, tolong ringkas, gua pengen ..."analyzeFileStructure:Searching for information...searchPattern:Searching for information...searchPattern:Searching for information...searchPattern:Searching for information...

Thinking update seharusnya (Bahasa manusia, bukan bahasa sistem, dilengkapi reason AI dalam plan.):
Analyzing files UAS PKN, UTS Math, and other files

[Spinner loader/check mark] Analyzing file structure of UTS Math
<AI Reason>

[Spinner loader/check mark] Searching for <search pattern>
<AI Reason>

[Spinner loader/check mark] Searching file pattern for <search pattern>
<AI Reason>

[Spinner loader/check mark] Searching information from website for <web search query>
<AI Reason>
<Link cited>

[dan to do lainnya]

[Spinner loader] Syntethizing final response, please wait...

note2 spinner loader hanya ditambahkan pada plan terakhir, dan check mark hanya ada pada plan yang berada di atas yang sudah dieksekusi.