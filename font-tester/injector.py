import os
import re

# --- KONFIGURASI ---
FONT_DIR = "."  # Direktori saat ini
HTML_FILE = "index.html"
FONT_EXTENSIONS = (
    ".woff2",
    ".woff",
    ".ttf",
    ".otf",
)  # Bisa ditambah jika ada format lain


def generate_font_face_rules(font_files):
    """Menghasilkan blok string CSS @font-face dari daftar file font."""
    rules = []
    for font_file in font_files:
        # Nama font diambil dari nama file tanpa ekstensi
        font_name = os.path.splitext(font_file)[0]
        # Format woff2 adalah yang paling umum untuk web modern
        font_format = "woff2"

        rule = (
            f"    @font-face {{ "
            f'font-family: "{font_name}"; '
            f'src: url("./{font_file}") format("{font_format}"); '
            f"font-weight: 400; font-style: normal; font-display: swap; "
            f"}}"
        )
        rules.append(rule)
    return "\n".join(rules)


def generate_js_array(font_files):
    """Menghasilkan blok string array JavaScript dari daftar file font."""
    font_names = [f'    "{os.path.splitext(font_file)[0]}"' for font_file in font_files]
    return ",\n".join(font_names)


def main():
    """Fungsi utama untuk menjalankan proses injeksi."""
    print("🚀 Memulai proses injeksi font...")

    # 1. Pindai direktori untuk file font
    try:
        all_files = os.listdir(FONT_DIR)
        font_files = sorted([f for f in all_files if f.endswith(FONT_EXTENSIONS)])
    except FileNotFoundError:
        print(f"❌ Error: Direktori '{FONT_DIR}' tidak ditemukan.")
        return

    if not font_files:
        print("🟡 Peringatan: Tidak ada file font ditemukan. Tidak ada yang diubah.")
        return

    print(f"✅ Ditemukan {len(font_files)} file font.")

    # 2. Hasilkan blok kode CSS dan JS yang baru
    css_rules = generate_font_face_rules(font_files)
    js_array_content = generate_js_array(font_files)

    # 3. Baca konten file HTML
    try:
        with open(HTML_FILE, "r", encoding="utf-8") as f:
            html_content = f.read()
    except FileNotFoundError:
        print(
            f"❌ Error: File '{HTML_FILE}' tidak ditemukan. Pastikan skrip ini berada di direktori yang sama."
        )
        return

    # 4. Ganti blok kode lama dengan yang baru menggunakan RegEx
    # Pola RegEx untuk menemukan konten di antara penanda
    css_pattern = re.compile(
        r"(/\* START: FONT-FACE RULES \*/\n).*(/\* END: FONT-FACE RULES \*/)", re.DOTALL
    )
    js_pattern = re.compile(
        r"(// START: FONT-FAMILIES ARRAY\n).*(// END: FONT-FAMILIES ARRAY)", re.DOTALL
    )

    # Konten baru yang akan diinjeksi
    new_css_block = f"\\1{css_rules}\n\\2"
    new_js_block = f"\\1let fontFamilies = [\n{js_array_content}\n];\n\\2"

    html_content = re.sub(css_pattern, new_css_block, html_content)
    html_content = re.sub(js_pattern, new_js_block, html_content)

    print("🔧 Kode CSS dan JavaScript baru telah dihasilkan.")

    # 5. Tulis kembali konten yang sudah diperbarui ke file HTML
    try:
        with open(HTML_FILE, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"✨ Injeksi berhasil! '{HTML_FILE}' telah diperbarui.")
    except IOError as e:
        print(f"❌ Error saat menulis ke file: {e}")


if __name__ == "__main__":
    main()
