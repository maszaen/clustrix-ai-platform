// ===================================================================
// CODE AGENT: STATIC PROMPT (NO STATE MACHINE)
// ===================================================================
// Semua aturan ditempatkan pada satu system prompt statis. Tidak ada
// penentuan state atau <state> tag; AI hanya fokus menjalankan tugas
// berdasarkan aturan berikut tanpa berpindah state.

// ===================================
// RESPONSE FORMAT & CORE RULES (STATIC)
// ===================================
const RESPONSE_FORMAT = `
Gunakan tag berikut:
- <hidden> untuk penjelasan internal (WAJIB ada di setiap respon). Tidak boleh ada perintah di dalamnya.
- <checklist> untuk status tugas (kirim hanya ketika berubah). Format: "- [ ] pending task" | "- [/] in progress" | "- [x] done".
- <cmd> untuk setiap perintah yang perlu dijalankan dengan format:
  <cmd>
    <commentary>Alasan singkat</commentary>
    <execute>command here</execute>
  </cmd>
  Satu <cmd> per batch, gabungkan beberapa <execute> jika butuh beberapa langkah berurutan.
- <answer> untuk laporan ringkas ke user. Jangan ulang output panjang.
- <todo> untuk daftar tindak lanjut yang belum selesai (opsional jika checklist sudah cukup).
- <summary> untuk merangkum output command panjang (pakai ketika hasil lebih dari 10 baris).
- <!END> hanya jika pekerjaan benar-benar selesai.

Hindari tag <state> atau konsep state apapun.`;

const EXECUTION_RULES = `
PRINSIP KERJA:
1) Selalu baca <memory_view> sebelum membuka file baru agar tidak duplikat.
2) Saat butuh membaca file: pakai Show-FileWithLineNumbers, jangan Get-Content/cat/type.
3) Hindari Get-ChildItem -Recurse; gunakan List-ProjectFiles atau Search-InFiles dengan Depth.
4) Untuk edit file, gunakan <set> dalam <cmd> dengan instruksi jelas (range/add). Pakai New-Item -Force sebelum menulis ke file baru.
5) Saat menjalankan perintah, jelaskan alasannya di <commentary>. Jangan jalankan layanan/background tanpa alasan.
6) Prioritaskan keamanan: jangan eksekusi perintah berbahaya, cek pola terlarang sebelum menjalankan.
7) Jika command gagal, berikan analisis singkat di <hidden> dan rencana perbaikan.
8) Gunakan <answer> untuk update ringkas, bukan untuk menempelkan log panjang. Pakai <summary> bila perlu.
9) Gunakan checklist untuk tugas multi langkah dan perbarui segera ketika status berubah.
10) Selalu tampilkan <cmd> jika ada perintah yang perlu dijalankan; jika tidak ada, berikan konteks dan rencana di <hidden>.`;

// ===================================
// DANGEROUS COMMAND PATTERNS (BLOCKING)
// ===================================
const DANGEROUS_PATTERNS = [
  {
    pattern: /Get-ChildItem.*-Recurse(?!.*-Depth)/i,
    warning: 'BLOCKED: Unbounded -Recurse without -Depth limit will hang PowerShell',
    suggestion: 'Use: List-ProjectFiles -Extensions "<ext>" -Depth 2',
    block: true,
  },
  {
    pattern: /Get-ChildItem.*-Recurse.*\|.*Select-String/i,
    warning: 'BLOCKED: Piping recursive Get-ChildItem to Select-String will hang',
    suggestion: 'Use: Search-InFiles -Pattern "pattern" -Filter "*.js" -Path "backend" -Depth 2',
    block: true,
  },
  {
    pattern: /-Recurse.*\|/i,
    warning: 'WARNING: Unbounded -Recurse with pipe can be slow',
    suggestion: 'Add -Depth limit or use specific path filter',
    block: false,
  },
  {
    pattern: /-replace.*[\[\]{}()\\]/,
    warning: 'FRAGILE: Special regex characters in -replace often fail',
    suggestion: 'Use Set-FileLine or $lines pattern instead',
    block: false,
  },
  {
    pattern: /^edit\s+/i,
    warning: 'BLOCKED: "edit" is not a valid command',
    suggestion: 'Use: Show-FileWithLineNumbers to read, or <set> tag to edit',
    block: true,
  },
  // File/Directory deletion
  {
    pattern: /^remove-item/i,
    warning: 'BLOCKED: File deletion command requires confirmation',
    suggestion: 'This command may delete important files. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^rm\s/i,
    warning: 'BLOCKED: File deletion command requires confirmation',
    suggestion: 'This command may delete important files. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^rmdir/i,
    warning: 'BLOCKED: Directory deletion command requires confirmation',
    suggestion: 'This command may delete important directories. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^del\s/i,
    warning: 'BLOCKED: File deletion command requires confirmation',
    suggestion: 'This command may delete important files. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^format-/i,
    warning: 'BLOCKED: Disk formatting command requires confirmation',
    suggestion: 'This command may destroy data. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^clear-content/i,
    warning: 'BLOCKED: Content clearing command requires confirmation',
    suggestion: 'This command may delete file contents. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^truncate/i,
    warning: 'BLOCKED: File truncation command requires confirmation',
    suggestion: 'This command may delete file data. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^shred/i,
    warning: 'BLOCKED: File shredding command requires confirmation',
    suggestion: 'This command permanently destroys files. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^wipe/i,
    warning: 'BLOCKED: Data wiping command requires confirmation',
    suggestion: 'This command permanently destroys data. Confirm before proceeding.',
    block: true,
  },
  // Disk operations
  {
    pattern: /^format-volume/i,
    warning: 'BLOCKED: Volume formatting requires confirmation',
    suggestion: 'This command destroys all data on the volume. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^mkfs/i,
    warning: 'BLOCKED: Filesystem creation requires confirmation',
    suggestion: 'This command destroys existing data. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^new-partition/i,
    warning: 'BLOCKED: Partition creation requires confirmation',
    suggestion: 'This command modifies disk structure. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^diskpart/i,
    warning: 'BLOCKED: Disk partitioning requires confirmation',
    suggestion: 'This command modifies disk structure. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^fdisk/i,
    warning: 'BLOCKED: Disk partitioning requires confirmation',
    suggestion: 'This command modifies disk structure. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^parted/i,
    warning: 'BLOCKED: Disk partitioning requires confirmation',
    suggestion: 'This command modifies disk structure. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^dd\s/i,
    warning: 'BLOCKED: Data copying command requires confirmation',
    suggestion: 'This command can destroy data if misused. Confirm before proceeding.',
    block: true,
  },
  // Git operations
  {
    pattern: /^git\s+checkout/i,
    warning: 'BLOCKED: Git checkout requires confirmation',
    suggestion: 'This command changes branch/file state. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+reset/i,
    warning: 'BLOCKED: Git reset requires confirmation',
    suggestion: 'This command can lose commits/changes. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+clean/i,
    warning: 'BLOCKED: Git clean requires confirmation',
    suggestion: 'This command deletes untracked files. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+push\s+--force/i,
    warning: 'BLOCKED: Force push requires confirmation',
    suggestion: 'This command overwrites remote history. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+push\s+-f/i,
    warning: 'BLOCKED: Force push requires confirmation',
    suggestion: 'This command overwrites remote history. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+rebase/i,
    warning: 'BLOCKED: Git rebase requires confirmation',
    suggestion: 'This command rewrites commit history. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+branch\s+-d/i,
    warning: 'BLOCKED: Branch deletion requires confirmation',
    suggestion: 'This command deletes a branch. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+branch\s+-D/i,
    warning: 'BLOCKED: Force branch deletion requires confirmation',
    suggestion: 'This command force deletes a branch. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+filter-branch/i,
    warning: 'BLOCKED: Git filter-branch requires confirmation',
    suggestion: 'This command rewrites repository history. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+gc/i,
    warning: 'BLOCKED: Git garbage collection requires confirmation',
    suggestion: 'This command optimizes repository. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^git\s+init/i,
    warning: 'BLOCKED: Git init requires confirmation',
    suggestion: 'This command initializes a new repository. Confirm before proceeding.',
    block: true,
  },
  // Process/Service management
  {
    pattern: /^stop-service/i,
    warning: 'BLOCKED: Service stopping requires confirmation',
    suggestion: 'This command stops system services. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^stop-process/i,
    warning: 'BLOCKED: Process stopping requires confirmation',
    suggestion: 'This command terminates processes. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^kill\s/i,
    warning: 'BLOCKED: Process killing requires confirmation',
    suggestion: 'This command terminates processes. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^killall/i,
    warning: 'BLOCKED: Process killing requires confirmation',
    suggestion: 'This command terminates all matching processes. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^taskkill/i,
    warning: 'BLOCKED: Task killing requires confirmation',
    suggestion: 'This command terminates tasks. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^pkill/i,
    warning: 'BLOCKED: Process killing requires confirmation',
    suggestion: 'This command terminates processes. Confirm before proceeding.',
    block: true,
  },
  // Registry operations
  {
    pattern: /^reg\s+delete/i,
    warning: 'BLOCKED: Registry deletion requires confirmation',
    suggestion: 'This command modifies system registry. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^remove-itemproperty/i,
    warning: 'BLOCKED: Registry modification requires confirmation',
    suggestion: 'This command modifies system registry. Confirm before proceeding.',
    block: true,
  },
  // Permission changes
  {
    pattern: /^chmod/i,
    warning: 'BLOCKED: Permission change requires confirmation',
    suggestion: 'This command changes file permissions. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^chown/i,
    warning: 'BLOCKED: Ownership change requires confirmation',
    suggestion: 'This command changes file ownership. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^icacls/i,
    warning: 'BLOCKED: Permission change requires confirmation',
    suggestion: 'This command changes file permissions. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^set-acl/i,
    warning: 'BLOCKED: ACL change requires confirmation',
    suggestion: 'This command changes access control lists. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^chgrp/i,
    warning: 'BLOCKED: Group change requires confirmation',
    suggestion: 'This command changes file group. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^setfacl/i,
    warning: 'BLOCKED: ACL change requires confirmation',
    suggestion: 'This command changes access control lists. Confirm before proceeding.',
    block: true,
  },
  // Network config
  {
    pattern: /^netsh/i,
    warning: 'BLOCKED: Network configuration requires confirmation',
    suggestion: 'This command modifies network settings. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^iptables/i,
    warning: 'BLOCKED: Firewall configuration requires confirmation',
    suggestion: 'This command modifies firewall rules. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^route\s+delete/i,
    warning: 'BLOCKED: Route deletion requires confirmation',
    suggestion: 'This command modifies routing table. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^ifconfig/i,
    warning: 'BLOCKED: Network interface configuration requires confirmation',
    suggestion: 'This command modifies network interfaces. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^ip\s+route/i,
    warning: 'BLOCKED: Route configuration requires confirmation',
    suggestion: 'This command modifies routing. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^ufw\s+delete/i,
    warning: 'BLOCKED: Firewall rule deletion requires confirmation',
    suggestion: 'This command modifies firewall. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^firewall-cmd/i,
    warning: 'BLOCKED: Firewall configuration requires confirmation',
    suggestion: 'This command modifies firewall. Confirm before proceeding.',
    block: true,
  },
  // System operations
  {
    pattern: /^shutdown/i,
    warning: 'BLOCKED: System shutdown requires confirmation',
    suggestion: 'This command shuts down the system. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^restart-computer/i,
    warning: 'BLOCKED: System restart requires confirmation',
    suggestion: 'This command restarts the system. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^disable-/i,
    warning: 'BLOCKED: System disabling requires confirmation',
    suggestion: 'This command disables system features. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^uninstall/i,
    warning: 'BLOCKED: Uninstallation requires confirmation',
    suggestion: 'This command removes software. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^reboot/i,
    warning: 'BLOCKED: System reboot requires confirmation',
    suggestion: 'This command reboots the system. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^halt/i,
    warning: 'BLOCKED: System halt requires confirmation',
    suggestion: 'This command halts the system. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^poweroff/i,
    warning: 'BLOCKED: System poweroff requires confirmation',
    suggestion: 'This command powers off the system. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^init\s/i,
    warning: 'BLOCKED: Init system command requires confirmation',
    suggestion: 'This command affects system initialization. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^systemctl\s+stop/i,
    warning: 'BLOCKED: Service stopping requires confirmation',
    suggestion: 'This command stops system services. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^systemctl\s+disable/i,
    warning: 'BLOCKED: Service disabling requires confirmation',
    suggestion: 'This command disables system services. Confirm before proceeding.',
    block: true,
  },
  // Package managers
  {
    pattern: /^npm\s+uninstall/i,
    warning: 'BLOCKED: Package uninstallation requires confirmation',
    suggestion: 'This command removes npm packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^yarn\s+remove/i,
    warning: 'BLOCKED: Package removal requires confirmation',
    suggestion: 'This command removes yarn packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^pip\s+uninstall/i,
    warning: 'BLOCKED: Package uninstallation requires confirmation',
    suggestion: 'This command removes pip packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^apt-get\s+remove/i,
    warning: 'BLOCKED: Package removal requires confirmation',
    suggestion: 'This command removes apt packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^apt-get\s+purge/i,
    warning: 'BLOCKED: Package purging requires confirmation',
    suggestion: 'This command purges apt packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^yum\s+remove/i,
    warning: 'BLOCKED: Package removal requires confirmation',
    suggestion: 'This command removes yum packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^pacman\s+-r/i,
    warning: 'BLOCKED: Package removal requires confirmation',
    suggestion: 'This command removes pacman packages. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^brew\s+uninstall/i,
    warning: 'BLOCKED: Package uninstallation requires confirmation',
    suggestion: 'This command removes brew packages. Confirm before proceeding.',
    block: true,
  },
  // Environment/Config
  {
    pattern: /^set-executionpolicy/i,
    warning: 'BLOCKED: Execution policy change requires confirmation',
    suggestion: 'This command changes PowerShell execution policy. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^setenforce/i,
    warning: 'BLOCKED: SELinux enforcement change requires confirmation',
    suggestion: 'This command changes SELinux settings. Confirm before proceeding.',
    block: true,
  },
  // Cron/Scheduled tasks
  {
    pattern: /^crontab\s+-r/i,
    warning: 'BLOCKED: Cron removal requires confirmation',
    suggestion: 'This command removes cron jobs. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^unregister-scheduledtask/i,
    warning: 'BLOCKED: Scheduled task removal requires confirmation',
    suggestion: 'This command removes scheduled tasks. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^schtasks\s+\/delete/i,
    warning: 'BLOCKED: Scheduled task deletion requires confirmation',
    suggestion: 'This command deletes scheduled tasks. Confirm before proceeding.',
    block: true,
  },
  // Docker/Container
  {
    pattern: /^docker\s+rm/i,
    warning: 'BLOCKED: Container removal requires confirmation',
    suggestion: 'This command removes Docker containers. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^docker\s+rmi/i,
    warning: 'BLOCKED: Image removal requires confirmation',
    suggestion: 'This command removes Docker images. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^docker\s+system\s+prune/i,
    warning: 'BLOCKED: System pruning requires confirmation',
    suggestion: 'This command removes unused Docker resources. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^docker\s+volume\s+rm/i,
    warning: 'BLOCKED: Volume removal requires confirmation',
    suggestion: 'This command removes Docker volumes. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^kubectl\s+delete/i,
    warning: 'BLOCKED: Kubernetes resource deletion requires confirmation',
    suggestion: 'This command deletes Kubernetes resources. Confirm before proceeding.',
    block: true,
  },
  // Certificate/Security
  {
    pattern: /^revoke-/i,
    warning: 'BLOCKED: Certificate revocation requires confirmation',
    suggestion: 'This command revokes certificates. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^remove-certificate/i,
    warning: 'BLOCKED: Certificate removal requires confirmation',
    suggestion: 'This command removes certificates. Confirm before proceeding.',
    block: true,
  },
  // Symbolic links
  {
    pattern: /^ln\s+-sf/i,
    warning: 'BLOCKED: Symbolic link creation requires confirmation',
    suggestion: 'This command creates/modifies symbolic links. Confirm before proceeding.',
    block: true,
  },
  {
    pattern: /^mklink/i,
    warning: 'BLOCKED: Link creation requires confirmation',
    suggestion: 'This command creates links. Confirm before proceeding.',
    block: true,
  },
  // Sudo prefix
  {
    pattern: /^sudo\s/i,
    warning: 'BLOCKED: Sudo command requires confirmation',
    suggestion: 'This command runs with elevated privileges. Confirm before proceeding.',
    block: true,
  },
];

// ===================================
// CORE SYSTEM PROMPT (Static)
// ===================================
const STATIC_SYSTEM_PROMPT = `You are Clustrix, a highly skilled software engineer with extensive knowledge in many programming
languages, frameworks, design patterns, and best practices.

=== RESPONSE FORMAT ===
{response_format}

=== OPERATING RULES ===
{execution_rules}

## Checklist Guidance
Gunakan <checklist> untuk merencanakan dan melacak progres. Kirim hanya saat ada perubahan status. Format:
- [x] tugas selesai
- [/] sedang dikerjakan
- [ ] belum mulai

## Command Reference (gunakan seperlunya)
{command_reference}`;

// ===================================
// DYNAMIC CONTEXT (User Prompt)
// ===================================
const DYNAMIC_CONTEXT_TEMPLATE = `
<context>
<memory_view>
{memory_state}
</memory_view>

<workspace_state>
Current Memory: {current_memory}
</workspace_state>

<history_summary>
{history_summary}
</history_summary>

<recent_turns>
{command_history}
</recent_turns>

{last_hidden}

<checklist>
{last_checklist}
</checklist>
</context>

<instruction>
{user_prompt}
</instruction>

{summary_reminder}`;

// ===================================
// BUILD STATIC PROMPT (no state machine)
// ===================================
function buildStatePrompt(_state, iteration, commandHistory, includeReference = false, memoryState = '', currentMemory = 'default', userPromptText = '', historySummary = '', lastHidden = '', lastChecklist = '') {
  const commandRef = (includeReference || iteration === 0 || iteration > 5)
    ? COMMAND_REFERENCE
    : '';

  let systemPrompt = STATIC_SYSTEM_PROMPT
    .replace('{response_format}', RESPONSE_FORMAT)
    .replace('{execution_rules}', EXECUTION_RULES)
    .replace('{command_reference}', commandRef);

  let instruct = '';
  if (lastHidden) {
    instruct = `<hidden>
YOUR PREVIOUS THOUGHTS, THIS IS WHAT YOU SHOULD DO NOW:
${lastHidden}
</hidden>`;
  }

  let userContext = DYNAMIC_CONTEXT_TEMPLATE
    .replace('{memory_state}', memoryState || 'No files in memory yet.')
    .replace('{current_memory}', currentMemory || 'default')
    .replace('{history_summary}', historySummary || 'No previous history.')
    .replace('{command_history}', commandHistory || 'No recent history.')
    .replace('{last_hidden}', instruct)
    .replace('{last_checklist}', lastChecklist || 'No previous checklist.')
    .replace('{user_prompt}', userPromptText)
    .replace('{summary_reminder}', '');

  return { systemPrompt, userContext };
}

// ===================================
// COMMAND REFERENCE
// ===================================
const COMMAND_REFERENCE = `
=== AVAILABLE COMMANDS ===
SEARCH (recursive, fast):
  Search-InFiles -Pattern "regex" -Filter "*.js" [-Path "dir"] [-Depth 2] [-Context 2]
  Example: Search-InFiles -Pattern "functionName" -Filter "*.js" -Depth 2

SEARCH (single file):
  Find-Pattern -Pattern "regex" -Path <file> [-Context 2]

READ FILE:
  Show-FileWithLineNumbers -Path "file.js"
  Show-FileWithLineNumbers -Path "file.js" -StartLine 100 -EndLine 200
  Search-InFiles -Pattern "regex" -Filter "*.js" -Depth 2
  Find-Pattern -Pattern "regex" -Path "file.js"
  List-ProjectFiles -Depth 2 -Extensions "*.js,*.ts"
  Get-FileLineRange -Path "file.js" -Ranges @('1-10', '50-60')
  Search-FileWithContext -Path "file.js" -Pattern "regex" -ContextBefore 2 -ContextAfter 2
  Get-FileStats -Path "file.js"
  Find-DuplicateLines -Path "file.js"

FILE STATS:
  Get-FileStats -Path <file>

CREATE FILE:
  New-Item -ItemType File -Path "path/to/newfile.js" -Force
  mkdir -p "path/to/new/directory"

EDIT FILE:
<cmd>
<set file="path/to/file.js" range={10, 15}>
<![CDATA[
new content
]]>
</set>
<set file="path/to/file.js" range={30, 35}>
<![CDATA[
new content
]]>
</set>
</cmd>

INSERT (no delete):
<cmd><set file="path/to/file.js" add={25}>
<![CDATA[
inserted content
]]>
</set></cmd>

DELETE (only delete):
<cmd><set file="path/to/file.js" range={10, 15}>
<![CDATA[
]]>
</set></cmd>

RUN:
  node script.js | npm test | python script.py | node --check file.js`;

// ===================================
// ERROR GUIDANCE
// ===================================
const ERROR_GUIDANCE = {
  set_xml_error: `
===> XML SYNTAX ERROR
Your <set> tag has malformed XML.

Common Issues:
- Missing closing tag: </set>
- Unbalanced CDATA: <![CDATA[ must have matching ]]>
- Text outside <set> tags in <cmd>
- Missing file attribute: file="path/to/file.js"
- Invalid range format: use range={10, 20} not range="10-20"

Correct Format:
<cmd><set file="path/to/file.js" range={10, 15}>
<![CDATA[
new content
]]>
</set></cmd>`,

  line_numbers_missing: `
===> NEED LINE NUMBERS
You tried editing without precise ranges.

Required Steps:
1. Show-FileWithLineNumbers -Path <file>
2. Identify the exact start/end lines
3. Use <set file="..." range={start, end}> for replacement`,

  file_too_large: `
===> FILE TOO LARGE
Reading entire file failed/slow.

Solution:
1. Get-FileStats -Path <file>
2. Show-FileWithLineNumbers -Path <file> -StartLine 1 -EndLine 300`,

  command_timeout: `
===> COMMAND TIMEOUT
Command took > 30 seconds.

Solutions:
- Break into smaller operations
- Process fewer lines per command
- Avoid expensive recursion`,

  command_blocked: `
===> COMMAND BLOCKED
Your command was blocked for safety (would hang PowerShell).

Solution - Use fast search instead:
Search-InFiles -Pattern "your-pattern" -Filter "*.js" -Depth 2`,

  hashtable_syntax: `
===> INVALID EDIT SYNTAX
Your edit payload was malformed.

Checklist:
- <cmd> should contain ONLY <set> blocks
- Each <set> needs file="..." and range={start, end} or add={line}
- Wrap multi-line content inside <![CDATA[ ... ]]>`,
};

// ===================================
// FIRST PROMPT (LEGACY / OPTIONAL)
// ===================================
const PROMPT_FIRST = `
{user_prompt}

---

{common_command}`;

// ===================================
// SUBSEQUENT PROMPT
// ===================================
const PROMPT_SUBSEQUENT = `
You are Clustrix, a fast and helpful AI coding assistant. You have the capability to use PowerShell commands to explore, read, edit, and execute code in projects.

===> RECENT MESSAGE INDEX & CORE FOCUS
{user_prompt}

---

{common_command}

---

===> YOUR TASK
Continue solving based on information above.
{summary_reminder}
# CONTEXT AWARENESS:
  - You've executed commands in history - DON'T REPEAT THEM
  - If stuck after 3 attempts, ask user + <!END>
  - Build on previous work, remember what you learned

# WHEN DONE:
<answer>Summary (casual Indonesian)</answer>
<!END>

# FINAL REMINDER:
  - Selalu pakai <hidden> untuk alasan/analisis internal
  - Cek memory sebelum baca file
  - Jangan ulang command yang sudah ada di history`;

// ===================================
// DETECT DANGEROUS COMMANDS
// ===================================
function detectDangerousCommand(command = '') {
  const warnings = [];

  for (const danger of DANGEROUS_PATTERNS) {
    if (danger.pattern.test(command)) {
      warnings.push({
        warning: danger.warning,
        suggestion: danger.suggestion,
        block: danger.block,
      });
    }
  }

  return warnings;
}

// ===================================
// HISTORY FORMATTING (with deduplication)
// ===================================
function formatCommandHistory(history = [], lastHidden = null) {
  if (!history || history.length === 0) return 'No recent history.';

  // Deduplicate consecutive identical commands
  const deduped = [];
  let lastCmd = null;
  let repeatCount = 0;

  for (const entry of history) {
    if (entry.command === lastCmd) {
      repeatCount++;
    } else {
      if (repeatCount > 0 && deduped.length > 0) {
        deduped[deduped.length - 1].repeatNote = `(repeated ${repeatCount + 1}x)`;
      }
      deduped.push({ ...entry });
      lastCmd = entry.command;
      repeatCount = 0;
    }
  }

  if (repeatCount > 0 && deduped.length > 0) {
    deduped[deduped.length - 1].repeatNote = `(repeated ${repeatCount + 1}x)`;
  }

  // Tier system for history
  const recentTurns = deduped.slice(-5);
  const semiRecentTurns = deduped.slice(-10, -5);
  const olderTurns = deduped.slice(0, -10);

  // Tier 3: Older - command only
  let summary = '';
  if (olderTurns.length > 0) {
    summary = olderTurns.map(h => `- ${h.command}${h.repeatNote ? ' ' + h.repeatNote : ''}`).join('\n');
  } else {
    summary = 'No older history.';
  }

  // Tier 2: Semi-recent - truncated output
  const formattedSemiRecent = semiRecentTurns.map((entry, index) => {
    let output = entry.output || '';
    if (output.length > 5000) {
      output = output.substring(0, 5000) + '\n... [Output Truncated]';
    }
    const repeat = entry.repeatNote ? ` ${entry.repeatNote}` : '';
    return `<turn i="${olderTurns.length + index + 1}">
<command>${entry.command}${repeat}</command>
<o>${output}</o>
</turn>`;
  }).join('\n\n');

  // Tier 1: Recent - full output
  const formattedRecent = recentTurns.map((entry, index) => {
    let output = entry.output || '';
    if (output.length > 100000) {
      output = output.substring(0, 100000) + '\n... [Output Truncated]';
    }
    const repeat = entry.repeatNote ? ` ${entry.repeatNote}` : '';
    return `<turn i="${olderTurns.length + semiRecentTurns.length + index + 1}">
<command>${entry.command}${repeat}</command>
<o>${output}</o>
</turn>`;
  }).join('\n\n');

  // Combine
  const combinedRecent = [formattedSemiRecent, formattedRecent].filter(Boolean).join('\n\n');

  return {
    summary,
    recent: combinedRecent
  };
}

// ===================================
// HELPER FUNCTIONS
// ===================================
function getCommandReference(include = false) {
  return include ? COMMAND_REFERENCE : '';
}

function getErrorGuidance(errorType = null) {
  if (!errorType || !ERROR_GUIDANCE[errorType]) {
    return '';
  }
  return ERROR_GUIDANCE[errorType];
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  DANGEROUS_PATTERNS,
  STATIC_SYSTEM_PROMPT,
  RESPONSE_FORMAT,
  EXECUTION_RULES,
  DYNAMIC_CONTEXT_TEMPLATE,
  COMMAND_REFERENCE,
  ERROR_GUIDANCE,
  PROMPT_FIRST,
  PROMPT_SUBSEQUENT,
  detectDangerousCommand,
  buildStatePrompt,
  formatCommandHistory,
  getCommandReference,
  getErrorGuidance,
};
