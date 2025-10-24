# Test Markdown Examples

## 1. Email Links Test

### Input:
```markdown
Hubungi kami:
- Email utama: [support@example.com](mailto:support@example.com)
- Sales: [sales@example.com](mailto:sales@example.com?subject=Inquiry)
- Founder: [ceo@example.com](mailto:ceo@example.com)
```

### Expected Output:
Setiap email link harus memiliki icon email (✉), bukan icon browser (↗)

---

## 2. Image Alt Text Test

### Input:
```markdown
### Screenshot dengan Alt Text
![Dashboard Screenshot](https://via.placeholder.com/800x600)

### Image tanpa Alt Text (harus fallback ke "Image")
![](https://via.placeholder.com/300x200)

### Multiple Images
![Logo Perusahaan](https://via.placeholder.com/150x150)
![Team Photo](https://via.placeholder.com/600x400)
![](https://via.placeholder.com/200x200)
```

### Expected Output:
```html
<img class="md-image" src="https://via.placeholder.com/800x600" alt="Dashboard Screenshot" loading="lazy">
<img class="md-image" src="https://via.placeholder.com/300x200" alt="Image" loading="lazy">
```

---

## 3. Links dengan Parentheses Test

### Input:
```markdown
Dokumentasi lengkap:
- [Markdown Guide](https://en.wikipedia.org/wiki/Markdown_(markup_language))
- [API Reference](https://docs.example.com/api/v2_(beta))
- [Tutorial (Advanced)](https://tutorial.example.com/advanced_(part_1))
```

### Expected Output:
Semua links harus berfungsi dengan benar, termasuk yang mengandung parentheses dalam URL.

---

## 4. Mixed Content Test

### Input:
```markdown
## Contact Information

Untuk informasi lebih lanjut:

1. Kunjungi [website kami](https://example.com)
2. Lihat [dokumentasi lengkap](https://docs.example.com/guide_(v2))
3. Email ke [support@example.com](mailto:support@example.com)
4. Atau hubungi [admin](mailto:admin@example.com?subject=Help%20Request)

### Screenshots

![Main Dashboard](https://via.placeholder.com/1200x800)
![Settings Page](https://via.placeholder.com/1200x800)
![User Profile](https://via.placeholder.com/1200x800)

**Note:** Semua gambar di atas menggunakan lazy loading untuk performa yang lebih baik.
```

### Expected Output:
- Regular links: icon browser (↗), `target="_blank"`
- Email links: icon email (✉), tanpa `target="_blank"`
- Images: semua memiliki alt text yang proper dan `loading="lazy"`

---

## 5. Edge Cases Test

### Input:
```markdown
### URL dengan karakter khusus
[Query dengan (params)](https://api.example.com/search?q=test(value)&sort=asc)
[Path dengan [brackets]](https://example.com/path/[id]/view)

### Email dengan parameters
[Report Bug](mailto:bugs@example.com?subject=Bug%20Report&body=Describe%20the%20bug)

### Image dengan special chars di alt
![Image (with) special [chars]](https://via.placeholder.com/400x300)
```

### Expected Output:
Semua harus ter-parse dengan benar tanpa error atau broken links.

---

## 6. Complex Nested Test

### Input:
```markdown
## Project Resources

> **Important Links:**
> 
> - Main site: [example.com](https://example.com)
> - Docs: [documentation](https://docs.example.com/guide_(v2))
> - Contact: [hello@example.com](mailto:hello@example.com)
>
> ![Project Logo](https://via.placeholder.com/200x100)

### Code dengan links di comments
\`\`\`javascript
// Visit https://example.com for more info
// Email: support@example.com
const apiUrl = "https://api.example.com/v2_(beta)";
\`\`\`

**Table dengan mixed content:**

| Type | Link | Description |
|------|------|-------------|
| Website | [Main Site](https://example.com) | ![Icon](https://via.placeholder.com/20x20) |
| Email | [Support](mailto:support@example.com) | Contact us |
| Docs | [Guide (v2)](https://docs.example.com/guide_(v2)) | Full docs |
```

---

## Verification Checklist

- [ ] Email links menampilkan icon email (✉)
- [ ] Regular links menampilkan icon browser (↗)
- [ ] Email links TIDAK membuka tab baru
- [ ] Regular links membuka tab baru
- [ ] Semua images memiliki alt attribute
- [ ] Images tanpa alt text menggunakan fallback "Image"
- [ ] Semua images memiliki loading="lazy"
- [ ] Links dengan parentheses di URL berfungsi
- [ ] Links dengan special characters berfungsi
- [ ] Streaming dan non-streaming menghasilkan output yang sama
- [ ] Blockquotes dengan links/images berfungsi
- [ ] Tables dengan links/images berfungsi
- [ ] Code blocks tidak mem-parse links (tetap sebagai text)

## Testing Instructions

1. Copy contoh markdown di atas
2. Paste di aplikasi
3. Test di mode streaming (ketik pelan-pelan)
4. Test di mode non-streaming (paste sekaligus)
5. Verifikasi output HTML dengan inspect element
6. Test accessibility dengan screen reader (khususnya alt text)
7. Verify email links membuka email client
8. Verify regular links membuka tab baru

## Expected Behavior

### Streaming Mode (md.worker.js)
- Token datang secara bertahap
- Links dan images ter-parse saat streaming
- Icon yang benar muncul (email vs browser)
- No broken placeholders di UI

### Non-Streaming Mode (md.js)
- Render langsung selesai
- Output HTML identik dengan streaming mode
- No performance issues
- Code blocks ter-highlight dengan benar
