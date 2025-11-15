user prompt:
lanjutkan page.tsx

```powershell
List-ProjectFiles -Extensions ".tsx,.ts" -Depth 2 -Sort
```
```text
booking-app\next-env.d.ts
booking-app\next.config.ts
# Exit Code: 0
```
```powershell
List-ProjectFiles -Extensions ".tsx,.ts,.jsx,.js" -Depth 3 -Sort
```
```text
booking-app\.next\types\cache-life.d.ts
booking-app\.next\types\routes.d.ts
booking-app\.next\types\validator.ts
booking-app\next-env.d.ts
booking-app\next.config.ts
booking-app\src\app\layout.tsx
booking-app\src\app\page.tsx
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Get-FileStats -Path "booking-app\src\app\page.tsx"
```
```text
Path         : H:\VSCode\Codes Environtment\Build From Scratch\booking-app\src\app\page.tsx
Name         : page.tsx
SizeKB       : 4.04
SizeMB       : 0
Lines        : 65
Extension    : .tsx
LastModified : 11/15/2025 4:25:45 AM
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Get-FileStats -Path "booking-app\src\app\page.tsx"
```
```text
Path         : H:\VSCode\Codes Environtment\Build From Scratch\booking-app\src\app\page.tsx
Name         : page.tsx
SizeKB       : 4.04
SizeMB       : 0
Lines        : 65
Extension    : .tsx
LastModified : 11/15/2025 4:25:45 AM
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 60 -EndLine 65
```
```text
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 1 -EndLine 65
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 65
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Get-FileStats -Path "booking-app\src\app\page.tsx"
```
```text
Path         : H:\VSCode\Codes Environtment\Build From Scratch\booking-app\src\app\page.tsx
Name         : page.tsx
SizeKB       : 4.04
SizeMB       : 0
Lines        : 65
Extension    : .tsx
LastModified : 11/15/2025 4:25:45 AM
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 65
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx"
```
```text
001: import Image from "next/image";
002: 
003: export default function Home() {
004:   return (
005:     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
006:       {/* Header */}
007:       <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
008:         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
009:           <div className="flex justify-between items-center h-16">
010:             <div className="flex items-center">
011:               <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">BookingApp</h1>
012:             </div>
013:             <nav className="hidden md:flex space-x-8">
014:               <a href="#" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Beranda</a>
015:               <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Fitur</a>
016:               <a href="#how-it-works" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Cara Kerja</a>
017:               <a href="#testimonials" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Testimoni</a>
018:               <a href="#" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">Login</a>
019:             </nav>
020:           </div>
021:         </div>
022:       </header>
023: 
024:       <main className="pt-16">
025:         {/* Hero Section */}
026:         <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
027:           <div className="max-w-7xl mx-auto">
028:             <div className="text-center">
029:               <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
030:                 Booking App Terpercaya
031:               </h1>
032:               <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
033:                 Pesan tiket, hotel, dan rental mobil dengan mudah dan cepat. Harga terbaik, pengalaman terbaik.
034:               </p>
035:               <div className="flex flex-col sm:flex-row gap-4 justify-center">
036:                 <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 shadow-lg">
037:                   Mulai Booking Sekarang
038:                 </button>
039:                 <button className="bg-white hover:bg-gray-50 text-gray-900 font-semibold py-3 px-8 rounded-lg transition-colors duration-200 border border-gray-300">
040:                   Pelajari Lebih Lanjut
041:                 </button>
042:               </div>
043:             </div>
044:           </div>
045: 
046:         {/* Features Section */}
047:         <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
048:           <div className="max-w-7xl mx-auto">
049:             <div className="text-center mb-16">
050:               <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
051:                 Kenapa Memilih Kami?
052:               </h2>
053:               <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
054:                 Fitur-fitur unggulan yang membuat pengalaman booking Anda lebih mudah dan menyenangkan
055:               </p>
056:             </div>
057: 
058:             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
059:               <div className="text-center p-6 rounded-lg bg-gray-50 dark:bg-gray-700">
060:                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
061:                   <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
062:                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
063:                   </svg>
064:                 </div>
065:                 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Booking Cepat</h3>
# Exit Code: 0
```
```powershell
Show-FileWithLineNumbers -Path "booking-app\src\app\page.tsx" -StartLine 66 -EndLine 130
```
```text
Command completed with no output.
# Exit Code: 0
```