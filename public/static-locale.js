/* Exact UI labels only; recitations and member-authored text are excluded. */
(function(root){
"use strict";
const labels=Object.freeze({
  "روزانہ ہدف": {
    "ur": "روزانہ ہدف",
    "en": "Daily target",
    "id": "Target harian"
  },
  "ڈیلی ہدف": {
    "ur": "ڈیلی ہدف",
    "en": "Daily target",
    "id": "Target harian"
  },
  "روزانہ مطلوبہ تعداد": {
    "ur": "روزانہ مطلوبہ تعداد",
    "en": "Required daily count",
    "id": "Jumlah harian yang diperlukan"
  },
  "فکس وظیفے کی پیش رفت": {
    "ur": "فکس وظیفے کی پیش رفت",
    "en": "Fixed wirid progress",
    "id": "Kemajuan wirid tetap"
  },
  "اصل دن": {
    "ur": "اصل دن",
    "en": "Original days",
    "id": "Hari awal"
  },
  "موجودہ دن": {
    "ur": "موجودہ دن",
    "en": "Current day",
    "id": "Hari saat ini"
  },
  "مکمل دن": {
    "ur": "مکمل دن",
    "en": "Completed days",
    "id": "Hari selesai"
  },
  "اضافی دن": {
    "ur": "اضافی دن",
    "en": "Extra days",
    "id": "Hari tambahan"
  },
  "باقی دن": {
    "ur": "باقی دن",
    "en": "Remaining days",
    "id": "Sisa hari"
  },
  "آغاز کی تاریخ": {
    "ur": "آغاز کی تاریخ",
    "en": "Start date",
    "id": "Tanggal mulai"
  },
  "آغاز تاریخ": {
    "ur": "آغاز تاریخ",
    "en": "Start date",
    "id": "Tanggal mulai"
  },
  "اختتامی تاریخ": {
    "ur": "اختتامی تاریخ",
    "en": "End date",
    "id": "Tanggal selesai"
  },
  "جاری": {
    "ur": "جاری",
    "en": "Active",
    "id": "Aktif"
  },
  "کل پڑھے گئے": {
    "ur": "کل پڑھے گئے",
    "en": "Total recited",
    "id": "Total dibaca"
  },
  "کل پڑھی گئی تعداد": {
    "ur": "کل پڑھی گئی تعداد",
    "en": "Total recited",
    "id": "Total dibaca"
  },
  "کل ہدف": {
    "ur": "کل ہدف",
    "en": "Total target",
    "id": "Target total"
  },
  "مجموعی ہدف": {
    "ur": "مجموعی ہدف",
    "en": "Overall target",
    "id": "Target keseluruhan"
  },
  "مجموعی باقی": {
    "ur": "مجموعی باقی",
    "en": "Total remaining",
    "id": "Total tersisa"
  },
  "آج پڑھا": {
    "ur": "آج پڑھا",
    "en": "Read today",
    "id": "Dibaca hari ini"
  },
  "آج باقی": {
    "ur": "آج باقی",
    "en": "Remaining today",
    "id": "Sisa hari ini"
  },
  "فیصد تکمیل": {
    "ur": "فیصد تکمیل",
    "en": "Completion percent",
    "id": "Persentase selesai"
  },
  "تعداد کی پیش رفت": {
    "ur": "تعداد کی پیش رفت",
    "en": "Count progress",
    "id": "Kemajuan hitungan"
  },
  "وظیفے کی تعداد کی پیش رفت": {
    "ur": "وظیفے کی تعداد کی پیش رفت",
    "en": "Wirid count progress",
    "id": "Kemajuan hitungan wirid"
  },
  "دن مکمل": {
    "ur": "دن مکمل",
    "en": "Days completed",
    "id": "Hari selesai"
  },
  "دنوں کی پیش رفت": {
    "ur": "دنوں کی پیش رفت",
    "en": "Day progress",
    "id": "Kemajuan hari"
  },
  "اضافی": {
    "ur": "اضافی",
    "en": "Extra",
    "id": "Tambahan"
  },
  "مکمل شدہ دن": {
    "ur": "مکمل شدہ دن",
    "en": "Completed days",
    "id": "Hari selesai"
  },
  "باقی": {
    "ur": "باقی",
    "en": "Remaining",
    "id": "Tersisa"
  },
  "باقی تعداد": {
    "ur": "باقی تعداد",
    "en": "Remaining count",
    "id": "Jumlah tersisa"
  },
  "فل سکرین بند کریں": {
    "ur": "فل سکرین بند کریں",
    "en": "Exit full screen",
    "id": "Keluar dari layar penuh"
  },
  "فل سکرین": {
    "ur": "فل سکرین",
    "en": "Full screen",
    "id": "Layar penuh"
  },
  "وائبریشن بند": {
    "ur": "وائبریشن بند",
    "en": "Vibration off",
    "id": "Getaran nonaktif"
  },
  "وائبریشن": {
    "ur": "وائبریشن",
    "en": "Vibration",
    "id": "Getaran"
  },
  "فون کی وائبریشن موٹر دستیاب نہیں۔": {
    "ur": "فون کی وائبریشن موٹر دستیاب نہیں۔",
    "en": "Phone vibration motor unavailable.",
    "id": "Motor getar ponsel tidak tersedia."
  },
  "وائبریشن کی اجازت نہیں۔": {
    "ur": "وائبریشن کی اجازت نہیں۔",
    "en": "Vibration permission denied.",
    "id": "Izin getaran ditolak."
  },
  "رابطہ دستیاب نہیں": {
    "ur": "رابطہ دستیاب نہیں",
    "en": "Connection unavailable",
    "id": "Koneksi tidak tersedia"
  },
  "اصل": {
    "ur": "اصل",
    "en": "Original",
    "id": "Asli"
  },
  "تصویر کھولیں": {
    "ur": "تصویر کھولیں",
    "en": "Open image",
    "id": "Buka gambar"
  },
  "عربی اسکرول کھولیں": {
    "ur": "عربی اسکرول کھولیں",
    "en": "Open Arabic scrolling",
    "id": "Buka gulir teks Arab"
  },
  "مکمل عربی عبارت پڑھنے کے لیے اوپر اسکرول کھولیں دبائیں": {
    "ur": "مکمل عربی عبارت پڑھنے کے لیے اوپر اسکرول کھولیں دبائیں",
    "en": "Open scrolling above to read the full Arabic text.",
    "id": "Buka gulir di atas untuk membaca seluruh teks Arab."
  },
  "تسبیح": {
    "ur": "تسبیح",
    "en": "Tasbih",
    "id": "Tasbih"
  },
  "کھولیں": {
    "ur": "کھولیں",
    "en": "Open",
    "id": "Buka"
  },
  "گروپ وظیفہ": {
    "ur": "گروپ وظیفہ",
    "en": "Group wirid",
    "id": "Wirid grup"
  },
  "جاری ہے": {
    "ur": "جاری ہے",
    "en": "Active",
    "id": "Aktif"
  },
  "بند ہے": {
    "ur": "بند ہے",
    "en": "Inactive",
    "id": "Tidak aktif"
  },
  "مالک کی گروپ سیٹنگ": {
    "ur": "مالک کی گروپ سیٹنگ",
    "en": "Owner group settings",
    "id": "Pengaturan grup pemilik"
  },
  "گروپ کی سیٹنگ": {
    "ur": "گروپ کی سیٹنگ",
    "en": "Group settings",
    "id": "Pengaturan grup"
  },
  "موقوف": {
    "ur": "موقوف",
    "en": "Paused",
    "id": "Dijeda"
  },
  "شروع نہیں ہوا": {
    "ur": "شروع نہیں ہوا",
    "en": "Not started",
    "id": "Belum dimulai"
  },
  "فکس جاری": {
    "ur": "فکس جاری",
    "en": "Fixed plan active",
    "id": "Rencana tetap aktif"
  },
  "روزانہ جاری": {
    "ur": "روزانہ جاری",
    "en": "Daily plan active",
    "id": "Rencana harian aktif"
  },
  "مدت مکمل": {
    "ur": "مدت مکمل",
    "en": "Period complete",
    "id": "Periode selesai"
  },
  "وظیفے کی پیش رفت": {
    "ur": "وظیفے کی پیش رفت",
    "en": "Wirid progress",
    "id": "Kemajuan wirid"
  },
  "اصل مدت": {
    "ur": "اصل مدت",
    "en": "Original period",
    "id": "Periode awal"
  },
  "روزانہ": {
    "ur": "روزانہ",
    "en": "Daily",
    "id": "Harian"
  },
  "اوپن": {
    "ur": "اوپن",
    "en": "Open-ended",
    "id": "Tanpa batas waktu"
  },
  "کل دن": {
    "ur": "کل دن",
    "en": "Total days",
    "id": "Total hari"
  },
  "حالت": {
    "ur": "حالت",
    "en": "Status",
    "id": "Status"
  },
  "مقرر نہیں": {
    "ur": "مقرر نہیں",
    "en": "Not set",
    "id": "Belum ditetapkan"
  },
  "آج کا ہدف": {
    "ur": "آج کا ہدف",
    "en": "Today's target",
    "id": "Target hari ini"
  },
  "اب تک کا کل ہدف": {
    "ur": "اب تک کا کل ہدف",
    "en": "Target to date",
    "id": "Target hingga hari ini"
  },
  "آج کے ہدف کی پیش رفت": {
    "ur": "آج کے ہدف کی پیش رفت",
    "en": "Today's target progress",
    "id": "Kemajuan target hari ini"
  },
  "سال کے کل دن": {
    "ur": "سال کے کل دن",
    "en": "Total days in year",
    "id": "Total hari dalam tahun"
  },
  "گزرے دن": {
    "ur": "گزرے دن",
    "en": "Elapsed days",
    "id": "Hari berlalu"
  },
  "وظیفے کا آغاز": {
    "ur": "وظیفے کا آغاز",
    "en": "Wirid start",
    "id": "Awal wirid"
  },
  "سال کا اختتام": {
    "ur": "سال کا اختتام",
    "en": "Year end",
    "id": "Akhir tahun"
  },
  "میرا کل پڑھا": {
    "ur": "میرا کل پڑھا",
    "en": "My total recited",
    "id": "Total bacaan saya"
  },
  "میرا سالانہ ہدف": {
    "ur": "میرا سالانہ ہدف",
    "en": "My annual target",
    "id": "Target tahunan saya"
  },
  "سالانہ باقی": {
    "ur": "سالانہ باقی",
    "en": "Annual remaining",
    "id": "Sisa tahunan"
  },
  "سالانہ تعداد کی پیش رفت": {
    "ur": "سالانہ تعداد کی پیش رفت",
    "en": "Annual count progress",
    "id": "Kemajuan hitungan tahunan"
  },
  "ذاتی وظیفہ": {
    "ur": "ذاتی وظیفہ",
    "en": "Personal wirid",
    "id": "Wirid pribadi"
  },
  "ڈیلی": {
    "ur": "ڈیلی",
    "en": "Daily",
    "id": "Harian"
  },
  "فکس": {
    "ur": "فکس",
    "en": "Fixed",
    "id": "Tetap"
  },
  "سیٹنگ": {
    "ur": "سیٹنگ",
    "en": "Settings",
    "id": "Pengaturan"
  },
  "دوسرے یوزر کو شیئر کریں": {
    "ur": "دوسرے یوزر کو شیئر کریں",
    "en": "Share with another member",
    "id": "Bagikan kepada anggota lain"
  },
  "وصول کنندہ ممبر آئی ڈی": {
    "ur": "وصول کنندہ ممبر آئی ڈی",
    "en": "Recipient member ID",
    "id": "ID anggota penerima"
  },
  "وظیفہ بھیجیں": {
    "ur": "وظیفہ بھیجیں",
    "en": "Send wirid",
    "id": "Kirim wirid"
  },
  "شیئرڈ وظیفہ دستیاب نہیں۔": {
    "ur": "شیئرڈ وظیفہ دستیاب نہیں۔",
    "en": "Shared wirid unavailable.",
    "id": "Wirid yang dibagikan tidak tersedia."
  },
  "واپس": {
    "ur": "واپس",
    "en": "Back",
    "id": "Kembali"
  },
  "اپنی نئی سیٹنگ مقرر کریں۔ بھیجنے والے کا ہدف، تاریخ اور شمار آپ کے ریکارڈ میں شامل نہیں ہوگا۔": {
    "ur": "اپنی نئی سیٹنگ مقرر کریں۔ بھیجنے والے کا ہدف، تاریخ اور شمار آپ کے ریکارڈ میں شامل نہیں ہوگا۔",
    "en": "Set your own preferences. The sender's target, date and count will not be added to your record.",
    "id": "Tetapkan pengaturan Anda sendiri. Target, tanggal, dan hitungan pengirim tidak akan masuk ke catatan Anda."
  },
  "وظیفے کی قسم": {
    "ur": "وظیفے کی قسم",
    "en": "Wirid type",
    "id": "Jenis wirid"
  },
  "منتخب کریں": {
    "ur": "منتخب کریں",
    "en": "Select",
    "id": "Pilih"
  },
  "ہدف (ڈیلی میں روزانہ، فکس میں مجموعی)": {
    "ur": "ہدف (ڈیلی میں روزانہ، فکس میں مجموعی)",
    "en": "Target (daily for daily plans, total for fixed plans)",
    "id": "Target (harian untuk rencana harian, total untuk rencana tetap)"
  },
  "فکس وظیفے کے دن": {
    "ur": "فکس وظیفے کے دن",
    "en": "Fixed wirid days",
    "id": "Jumlah hari wirid tetap"
  },
  "اپنی سیٹنگ محفوظ کریں": {
    "ur": "اپنی سیٹنگ محفوظ کریں",
    "en": "Save your settings",
    "id": "Simpan pengaturan Anda"
  },
  "شیئرڈ وظیفہ": {
    "ur": "شیئرڈ وظیفہ",
    "en": "Shared wirid",
    "id": "Wirid bersama"
  },
  "پہلے زیر التوا گنتی محفوظ کریں۔": {
    "ur": "پہلے زیر التوا گنتی محفوظ کریں۔",
    "en": "Save the pending count first.",
    "id": "Simpan hitungan tertunda terlebih dahulu."
  },
  "وظیفہ دستیاب نہیں۔": {
    "ur": "وظیفہ دستیاب نہیں۔",
    "en": "Wirid unavailable.",
    "id": "Wirid tidak tersedia."
  },
  "صرف جاری ڈیلی وظیفہ روک سکتے ہیں۔": {
    "ur": "صرف جاری ڈیلی وظیفہ روک سکتے ہیں۔",
    "en": "Only an active daily wirid can be paused.",
    "id": "Hanya wirid harian aktif yang dapat dijeda."
  },
  "فون کی تاریخ درست کریں۔": {
    "ur": "فون کی تاریخ درست کریں۔",
    "en": "Correct your phone date.",
    "id": "Perbaiki tanggal ponsel."
  },
  "وقفے کی تاریخ درست نہیں۔": {
    "ur": "وقفے کی تاریخ درست نہیں۔",
    "en": "Invalid pause date.",
    "id": "Tanggal jeda tidak valid."
  },
  "▶ وظیفہ دوبارہ جاری کریں (Resume)": {
    "ur": "▶ وظیفہ دوبارہ جاری کریں",
    "en": "▶ Resume wirid",
    "id": "▶ Lanjutkan wirid"
  },
  "⏸ وظیفہ روکیں (Pause)": {
    "ur": "⏸ وظیفہ روکیں",
    "en": "⏸ Pause wirid",
    "id": "⏸ Jeda wirid"
  },
  "شیئرڈ وظائف": {
    "ur": "شیئرڈ وظائف",
    "en": "Shared wirid",
    "id": "Wirid yang dibagikan"
  },
  "بھیجنے والا": {
    "ur": "بھیجنے والا",
    "en": "Sender",
    "id": "Pengirim"
  },
  "اپنی سیٹنگ بنائیں": {
    "ur": "اپنی سیٹنگ بنائیں",
    "en": "Create your settings",
    "id": "Buat pengaturan Anda"
  },
  "حذف کریں": {
    "ur": "حذف کریں",
    "en": "Delete",
    "id": "Hapus"
  },
  "میرے وظائف": {
    "ur": "میرے وظائف",
    "en": "My wirid",
    "id": "Wirid saya"
  },
  "نیا وظیفہ": {
    "ur": "نیا وظیفہ",
    "en": "New wirid",
    "id": "Wirid baru"
  },
  "میرے ذاتی وظائف": {
    "ur": "میرے ذاتی وظائف",
    "en": "My personal wirid",
    "id": "Wirid pribadi saya"
  },
  "ابھی کوئی ذاتی وظیفہ شامل نہیں۔ اوپر نیا وظیفہ دبائیں۔": {
    "ur": "ابھی کوئی ذاتی وظیفہ شامل نہیں۔ اوپر نیا وظیفہ دبائیں۔",
    "en": "No personal wirid yet. Tap New wirid above.",
    "id": "Belum ada wirid pribadi. Ketuk Wirid baru di atas."
  },
  "ہفتہ وار ہدف": {
    "ur": "ہفتہ وار ہدف",
    "en": "Weekly target",
    "id": "Target mingguan"
  },
  "ماہانہ ہدف": {
    "ur": "ماہانہ ہدف",
    "en": "Monthly target",
    "id": "Target bulanan"
  },
  "سالانہ ہدف": {
    "ur": "سالانہ ہدف",
    "en": "Annual target",
    "id": "Target tahunan"
  },
  "تاریخ دستیاب نہیں": {
    "ur": "تاریخ دستیاب نہیں",
    "en": "Date unavailable",
    "id": "Tanggal tidak tersedia"
  },
  "لوڈ ہو رہا ہے": {
    "ur": "لوڈ ہو رہا ہے",
    "en": "Loading",
    "id": "Memuat"
  },
  "ڈیلی وظیفہ": {
    "ur": "ڈیلی وظیفہ",
    "en": "Daily wirid",
    "id": "Wirid harian"
  },
  "ہر روز پڑھنا ہے": {
    "ur": "ہر روز پڑھنا ہے",
    "en": "Recite every day",
    "id": "Baca setiap hari"
  },
  "فکس وظیفہ": {
    "ur": "فکس وظیفہ",
    "en": "Fixed wirid",
    "id": "Wirid tetap"
  },
  "مقررہ تاریخ تک": {
    "ur": "مقررہ تاریخ تک",
    "en": "Until a fixed date",
    "id": "Hingga tanggal tertentu"
  },
  "اوپن وظیفہ": {
    "ur": "اوپن وظیفہ",
    "en": "Open-ended wirid",
    "id": "Wirid tanpa batas waktu"
  },
  "اپنی مرضی سے": {
    "ur": "اپنی مرضی سے",
    "en": "At your own pace",
    "id": "Sesuai kemampuan Anda"
  },
  "تمام ممبرز کے لیے": {
    "ur": "تمام ممبرز کے لیے",
    "en": "For all members",
    "id": "Untuk semua anggota"
  },
  "گروپ وظیفے کی سیٹنگ": {
    "ur": "گروپ وظیفے کی سیٹنگ",
    "en": "Group wirid settings",
    "id": "Pengaturan wirid grup"
  },
  "ذاتی وظیفے میں ترمیم": {
    "ur": "ذاتی وظیفے میں ترمیم",
    "en": "Edit personal wirid",
    "id": "Edit wirid pribadi"
  },
  "بند کریں": {
    "ur": "بند کریں",
    "en": "Close",
    "id": "Tutup"
  },
  "وظیفے کا نام": {
    "ur": "وظیفے کا نام",
    "en": "Wirid name",
    "id": "Nama wirid"
  },
  "مثلاً آیت الکرسی": {
    "ur": "مثلاً آیت الکرسی",
    "en": "e.g. Ayat al-Kursi",
    "id": "Contoh: Ayat Kursi"
  },
  "عربی عبارت / درود": {
    "ur": "عربی عبارت / درود",
    "en": "Arabic text / salawat",
    "id": "Teks Arab / selawat"
  },
  "مکمل عربی عبارت یا پوری سورۃ یہاں پیسٹ کریں": {
    "ur": "مکمل عربی عبارت یا پوری سورۃ یہاں پیسٹ کریں",
    "en": "Paste the full Arabic text or surah here",
    "id": "Tempel teks Arab atau surah lengkap di sini"
  },
  "ہٹائیں / عبارت لکھیں": {
    "ur": "ہٹائیں / عبارت لکھیں",
    "en": "Remove / enter text",
    "id": "Hapus / tulis teks"
  },
  "طریقہ / ہدایات": {
    "ur": "طریقہ / ہدایات",
    "en": "Method / instructions",
    "id": "Cara / petunjuk"
  },
  "پڑھنے کا طریقہ": {
    "ur": "پڑھنے کا طریقہ",
    "en": "How to recite",
    "id": "Cara membaca"
  },
  "وظیفے کا مقصد": {
    "ur": "وظیفے کا مقصد",
    "en": "Purpose of wirid",
    "id": "Tujuan wirid"
  },
  "اس وظیفے کا مقصد": {
    "ur": "اس وظیفے کا مقصد",
    "en": "Purpose of this wirid",
    "id": "Tujuan wirid ini"
  },
  "وظیفے کی قسم منتخب کریں": {
    "ur": "وظیفے کی قسم منتخب کریں",
    "en": "Choose wirid type",
    "id": "Pilih jenis wirid"
  },
  "سالانہ کل ہدف": {
    "ur": "سالانہ کل ہدف",
    "en": "Total annual target",
    "id": "Total target tahunan"
  },
  "موجودہ اسلامی سال کا آغاز": {
    "ur": "موجودہ اسلامی سال کا آغاز",
    "en": "Start of current Islamic year",
    "id": "Awal tahun Hijriah saat ini"
  },
  "پاکستانی عیسوی تاریخ مقرر کریں": {
    "ur": "پاکستانی عیسوی تاریخ مقرر کریں",
    "en": "Set Gregorian date in Pakistan",
    "id": "Tetapkan tanggal Masehi di Pakistan"
  },
  "اختتامی تاریخ (خودکار)": {
    "ur": "اختتامی تاریخ (خودکار)",
    "en": "End date (automatic)",
    "id": "Tanggal selesai (otomatis)"
  },
  "کتنے دن کا وظیفہ؟": {
    "ur": "کتنے دن کا وظیفہ؟",
    "en": "How many days for this wirid?",
    "id": "Berapa hari wirid ini?"
  },
  "اگلا ہدف مقرر کریں": {
    "ur": "اگلا ہدف مقرر کریں",
    "en": "Set next target",
    "id": "Tetapkan target berikutnya"
  },
  "موجودہ ہدف اور تاریخ تبدیل کریں": {
    "ur": "موجودہ ہدف اور تاریخ تبدیل کریں",
    "en": "Change current target and date",
    "id": "Ubah target dan tanggal saat ini"
  },
  "گروپ وظیفہ فعال رکھیں": {
    "ur": "گروپ وظیفہ فعال رکھیں",
    "en": "Keep group wirid active",
    "id": "Pertahankan wirid grup aktif"
  },
  "یہ درود شریف ہے (مجموعی درود میں بھی شمار کریں)": {
    "ur": "یہ درود شریف ہے (مجموعی درود میں بھی شمار کریں)",
    "en": "This is salawat (include in total salawat)",
    "id": "Ini selawat (masukkan ke total selawat)"
  },
  "محفوظ کریں": {
    "ur": "محفوظ کریں",
    "en": "Save",
    "id": "Simpan"
  },
  "وظیفہ حذف کریں": {
    "ur": "وظیفہ حذف کریں",
    "en": "Delete wirid",
    "id": "Hapus wirid"
  },
  "منتخب تاریخ کی پڑھی گئی اور باقی گنتی": {
    "ur": "منتخب تاریخ کی پڑھی گئی اور باقی گنتی",
    "en": "Recited and remaining counts for selected date",
    "id": "Hitungan dibaca dan tersisa pada tanggal terpilih"
  },
  "آج کا باقی ہدف": {
    "ur": "آج کا باقی ہدف",
    "en": "Remaining target today",
    "id": "Sisa target hari ini"
  },
  "دستی": {
    "ur": "دستی",
    "en": "Manual",
    "id": "Manual"
  },
  "ہدف": {
    "ur": "ہدف",
    "en": "Target",
    "id": "Target"
  },
  "وظیفے کی مدت سے باہر": {
    "ur": "وظیفے کی مدت سے باہر",
    "en": "Outside wirid period",
    "id": "Di luar periode wirid"
  },
  "تسبیح کی تاریخ منتخب کریں": {
    "ur": "تسبیح کی تاریخ منتخب کریں",
    "en": "Select tasbih date",
    "id": "Pilih tanggal tasbih"
  },
  "پچھلا مہینہ": {
    "ur": "پچھلا مہینہ",
    "en": "Previous month",
    "id": "Bulan sebelumnya"
  },
  "اگلا مہینہ": {
    "ur": "اگلا مہینہ",
    "en": "Next month",
    "id": "Bulan berikutnya"
  },
  "اتوار": {
    "ur": "اتوار",
    "en": "Sunday",
    "id": "Minggu"
  },
  "پیر": {
    "ur": "پیر",
    "en": "Monday",
    "id": "Senin"
  },
  "منگل": {
    "ur": "منگل",
    "en": "Tuesday",
    "id": "Selasa"
  },
  "بدھ": {
    "ur": "بدھ",
    "en": "Wednesday",
    "id": "Rabu"
  },
  "جمعرات": {
    "ur": "جمعرات",
    "en": "Thursday",
    "id": "Kamis"
  },
  "جمعہ": {
    "ur": "جمعہ",
    "en": "Friday",
    "id": "Jumat"
  },
  "ہفتہ": {
    "ur": "ہفتہ",
    "en": "Saturday",
    "id": "Sabtu"
  },
  "یا تاریخ منتخب کریں": {
    "ur": "یا تاریخ منتخب کریں",
    "en": "Or choose a date",
    "id": "Atau pilih tanggal"
  },
  "منسوخ": {
    "ur": "منسوخ",
    "en": "Cancel",
    "id": "Batal"
  },
  "روزانہ گنتی میں تبدیلی": {
    "ur": "روزانہ گنتی میں تبدیلی",
    "en": "Edit daily count",
    "id": "Ubah hitungan harian"
  },
  "موجودہ محفوظ تعداد": {
    "ur": "موجودہ محفوظ تعداد",
    "en": "Current saved count",
    "id": "Jumlah tersimpan saat ini"
  },
  "مثلاً 100، +100 یا -20": {
    "ur": "مثلاً 100، +100 یا -20",
    "en": "e.g. 100, +100 or -20",
    "id": "Contoh: 100, +100 atau -20"
  },
  "بقایا مکمل، ہدف پورا": {
    "ur": "بقایا مکمل، ہدف پورا",
    "en": "Outstanding cleared, target met",
    "id": "Kekurangan lunas, target tercapai"
  },
  "آج کا باقی ہدف پورا کریں": {
    "ur": "آج کا باقی ہدف پورا کریں",
    "en": "Complete today's remaining target",
    "id": "Penuhi sisa target hari ini"
  },
  "بقایا": {
    "ur": "بقایا",
    "en": "Outstanding",
    "id": "Kekurangan"
  },
  "اس تاریخ میں زائد": {
    "ur": "اس تاریخ میں زائد",
    "en": "Extra on this date",
    "id": "Kelebihan pada tanggal ini"
  },
  "تبدیلی": {
    "ur": "تبدیلی",
    "en": "Edit",
    "id": "Ubah"
  },
  "تبدیلی کھولنے کے لیے تین بار ٹیپ کریں": {
    "ur": "تبدیلی کھولنے کے لیے تین بار ٹیپ کریں",
    "en": "Tap three times to unlock editing",
    "id": "Ketuk tiga kali untuk membuka pengeditan"
  },
  "تخمینی": {
    "ur": "تخمینی",
    "en": "Estimated",
    "id": "Perkiraan"
  },
  "وقت نامعلوم": {
    "ur": "وقت نامعلوم",
    "en": "Time unknown",
    "id": "Waktu tidak diketahui"
  },
  "مزید پرانا ریکارڈ دکھائیں": {
    "ur": "مزید پرانا ریکارڈ دکھائیں",
    "en": "Show older records",
    "id": "Tampilkan catatan lama"
  },
  "ابھی ریکارڈ نہیں۔": {
    "ur": "ابھی ریکارڈ نہیں۔",
    "en": "No records yet.",
    "id": "Belum ada catatan."
  },
  "ہدف مکمل": {
    "ur": "ہدف مکمل",
    "en": "Target met",
    "id": "Target tercapai"
  },
  "محفوظ": {
    "ur": "محفوظ",
    "en": "Saved",
    "id": "Tersimpan"
  },
  "سنک باقی": {
    "ur": "سنک باقی",
    "en": "Sync pending",
    "id": "Sinkronisasi tertunda"
  },
  "ریکارڈ لوڈ ہو رہا ہے": {
    "ur": "ریکارڈ لوڈ ہو رہا ہے",
    "en": "Loading records",
    "id": "Memuat catatan"
  },
  "مزید پرانا ریکارڈ": {
    "ur": "مزید پرانا ریکارڈ",
    "en": "Older records",
    "id": "Catatan lama"
  },
  "تاریخِ رکنیت": {
    "ur": "تاریخِ رکنیت",
    "en": "Membership date",
    "id": "Tanggal keanggotaan"
  },
  "پڑھے گئے دن": {
    "ur": "پڑھے گئے دن",
    "en": "Days recited",
    "id": "Hari membaca"
  },
  "گروپ کا مجموعی ورد": {
    "ur": "گروپ کا مجموعی ورد",
    "en": "Group total wirid",
    "id": "Total wirid grup"
  },
  "میرا مجموعی ورد": {
    "ur": "میرا مجموعی ورد",
    "en": "My total wirid",
    "id": "Total wirid saya"
  },
  "میرا سالانہ ورد": {
    "ur": "میرا سالانہ ورد",
    "en": "My annual wirid",
    "id": "Wirid tahunan saya"
  },
  "چلتی ہوئی عربی عبارت": {
    "ur": "چلتی ہوئی عربی عبارت",
    "en": "Scrolling Arabic text",
    "id": "Teks Arab bergulir"
  },
  "رفتار": {
    "ur": "رفتار",
    "en": "Speed",
    "id": "Kecepatan"
  },
  "رفتار کم کریں": {
    "ur": "رفتار کم کریں",
    "en": "Decrease speed",
    "id": "Kurangi kecepatan"
  },
  "رفتار بڑھائیں": {
    "ur": "رفتار بڑھائیں",
    "en": "Increase speed",
    "id": "Tambah kecepatan"
  },
  "فونٹ": {
    "ur": "فونٹ",
    "en": "Font",
    "id": "Huruf"
  },
  "فونٹ چھوٹا کریں": {
    "ur": "فونٹ چھوٹا کریں",
    "en": "Decrease font size",
    "id": "Perkecil huruf"
  },
  "فونٹ بڑا کریں": {
    "ur": "فونٹ بڑا کریں",
    "en": "Increase font size",
    "id": "Perbesar huruf"
  },
  "وظائف واپس": {
    "ur": "وظائف واپس",
    "en": "Back to wirid",
    "id": "Kembali ke wirid"
  },
  "وظیفے کی مکمل تفصیل": {
    "ur": "وظیفے کی مکمل تفصیل",
    "en": "Full wirid details",
    "id": "Rincian lengkap wirid"
  },
  "عربی عبارت": {
    "ur": "عربی عبارت",
    "en": "Arabic text",
    "id": "Teks Arab"
  },
  "پڑھنے کا طریقہ:": {
    "ur": "پڑھنے کا طریقہ:",
    "en": "How to recite:",
    "id": "Cara membaca:"
  },
  "ہر مرتبہ مکمل وظیفہ پڑھ کر تسبیح کو ایک بار دبائیں۔": {
    "ur": "ہر مرتبہ مکمل وظیفہ پڑھ کر تسبیح کو ایک بار دبائیں۔",
    "en": "Tap the tasbih once after each complete recitation.",
    "id": "Ketuk tasbih sekali setelah setiap bacaan selesai."
  },
  "ہر مرتبہ مکمل درودِ ابراہیمی پڑھنے کے بعد تسبیح کو ایک بار دبائیں۔": {
    "ur": "ہر مرتبہ مکمل درودِ ابراہیمی پڑھنے کے بعد تسبیح کو ایک بار دبائیں۔",
    "en": "Tap the tasbih once after each complete Durood Ibrahimi recitation.",
    "id": "Ketuk tasbih sekali setelah setiap bacaan Selawat Ibrahimiyah selesai."
  },
  "درودِ ابراہیمی کی مشترکہ روزانہ تلاوت": {
    "ur": "درودِ ابراہیمی کی مشترکہ روزانہ تلاوت",
    "en": "Daily shared recitation of Durood Ibrahimi",
    "id": "Bacaan harian bersama Selawat Ibrahimiyah"
  },
  "وظیفے کا مقصد:": {
    "ur": "وظیفے کا مقصد:",
    "en": "Purpose of wirid:",
    "id": "Tujuan wirid:"
  },
  "مقصد درج نہیں کیا گیا۔": {
    "ur": "مقصد درج نہیں کیا گیا۔",
    "en": "No purpose entered.",
    "id": "Tujuan belum diisi."
  },
  "تسبیح کاؤنٹر اور روزانہ کا حساب": {
    "ur": "تسبیح کاؤنٹر اور روزانہ کا حساب",
    "en": "Tasbih counter and daily totals",
    "id": "Penghitung tasbih dan total harian"
  },
  "میرا روزانہ ہدف": {
    "ur": "میرا روزانہ ہدف",
    "en": "My daily target",
    "id": "Target harian saya"
  },
  "میرا آج پڑھا": {
    "ur": "میرا آج پڑھا",
    "en": "My count today",
    "id": "Hitungan saya hari ini"
  },
  "مجموعی تکمیل، باقی اور روزانہ ہدف": {
    "ur": "مجموعی تکمیل، باقی اور روزانہ ہدف",
    "en": "Overall progress, remaining and daily target",
    "id": "Kemajuan keseluruhan, sisa dan target harian"
  },
  "مجموعی تکمیل": {
    "ur": "مجموعی تکمیل",
    "en": "Overall completion",
    "id": "Penyelesaian keseluruhan"
  },
  "مکمل شدہ مجموعی حصہ، ساتھ باقی فیصد": {
    "ur": "مکمل شدہ مجموعی حصہ، ساتھ باقی فیصد",
    "en": "Completed portion and remaining percentage",
    "id": "Bagian selesai dan persentase tersisa"
  },
  "منتخب تاریخ کے روزانہ ہدف کی پیش رفت": {
    "ur": "منتخب تاریخ کے روزانہ ہدف کی پیش رفت",
    "en": "Daily target progress for selected date",
    "id": "Kemajuan target harian pada tanggal terpilih"
  },
  "ساؤنڈ، وائبریشن اور فل سکرین": {
    "ur": "ساؤنڈ، وائبریشن اور فل سکرین",
    "en": "Sound, vibration and full screen",
    "id": "Suara, getaran dan layar penuh"
  },
  "ساؤنڈ": {
    "ur": "ساؤنڈ",
    "en": "Sound",
    "id": "Suara"
  },
  "ساؤنڈ کم کریں": {
    "ur": "ساؤنڈ کم کریں",
    "en": "Decrease sound",
    "id": "Kurangi suara"
  },
  "ساؤنڈ کی سطح": {
    "ur": "ساؤنڈ کی سطح",
    "en": "Sound level",
    "id": "Tingkat suara"
  },
  "ساؤنڈ بڑھائیں": {
    "ur": "ساؤنڈ بڑھائیں",
    "en": "Increase sound",
    "id": "Tambah suara"
  },
  "وائبریشن کم کریں": {
    "ur": "وائبریشن کم کریں",
    "en": "Decrease vibration",
    "id": "Kurangi getaran"
  },
  "وائبریشن کی طاقت": {
    "ur": "وائبریشن کی طاقت",
    "en": "Vibration strength",
    "id": "Kekuatan getaran"
  },
  "وائبریشن بڑھائیں": {
    "ur": "وائبریشن بڑھائیں",
    "en": "Increase vibration",
    "id": "Tambah getaran"
  },
  "تسبیح کی رفتار": {
    "ur": "تسبیح کی رفتار",
    "en": "Tasbih speed",
    "id": "Kecepatan tasbih"
  },
  "فی گھنٹہ": {
    "ur": "فی گھنٹہ",
    "en": "Per hour",
    "id": "Per jam"
  },
  "فی منٹ": {
    "ur": "فی منٹ",
    "en": "Per minute",
    "id": "Per menit"
  },
  "پچھلا دن": {
    "ur": "پچھلا دن",
    "en": "Previous day",
    "id": "Hari sebelumnya"
  },
  "اگلا دن": {
    "ur": "اگلا دن",
    "en": "Next day",
    "id": "Hari berikutnya"
  },
  "سیشن کا وقت": {
    "ur": "سیشن کا وقت",
    "en": "Session time",
    "id": "Waktu sesi"
  },
  "پڑھیں یا تسبیح کریں": {
    "ur": "پڑھیں یا تسبیح کریں",
    "en": "Recite or count tasbih",
    "id": "Baca atau hitung tasbih"
  },
  "روزانہ ہدف مقرر کریں": {
    "ur": "روزانہ ہدف مقرر کریں",
    "en": "Set daily target",
    "id": "Tetapkan target harian"
  },
  "روزانہ محفوظ ریکارڈ": {
    "ur": "روزانہ محفوظ ریکارڈ",
    "en": "Saved daily records",
    "id": "Catatan harian tersimpan"
  },
  "اگلا مرحلہ دستیاب نہیں۔": {
    "ur": "اگلا مرحلہ دستیاب نہیں۔",
    "en": "Next phase unavailable.",
    "id": "Fase berikutnya tidak tersedia."
  },
  "موجودہ ہدف میں ترمیم": {
    "ur": "موجودہ ہدف میں ترمیم",
    "en": "Edit current target",
    "id": "Ubah target saat ini"
  },
  "اگلا وظیفہ اور نیا ہدف": {
    "ur": "اگلا وظیفہ اور نیا ہدف",
    "en": "Next wirid and new target",
    "id": "Wirid dan target berikutnya"
  },
  "اس مرحلے کے آغاز کی تاریخ": {
    "ur": "اس مرحلے کے آغاز کی تاریخ",
    "en": "Start date of this phase",
    "id": "Tanggal mulai fase ini"
  },
  "موجودہ وظیفے کی قسم": {
    "ur": "موجودہ وظیفے کی قسم",
    "en": "Current wirid type",
    "id": "Jenis wirid saat ini"
  },
  "اگلے وظیفے کی قسم": {
    "ur": "اگلے وظیفے کی قسم",
    "en": "Next wirid type",
    "id": "Jenis wirid berikutnya"
  },
  "روزانہ بغیر آخری تاریخ کے": {
    "ur": "روزانہ بغیر آخری تاریخ کے",
    "en": "Daily without end date",
    "id": "Harian tanpa tanggal selesai"
  },
  "دوبارہ 41 دن یا اپنی مدت": {
    "ur": "دوبارہ 41 دن یا اپنی مدت",
    "en": "Another 41 days or custom duration",
    "id": "41 hari lagi atau durasi pilihan"
  },
  "فکس وظیفے کا مجموعی ہدف": {
    "ur": "فکس وظیفے کا مجموعی ہدف",
    "en": "Fixed wirid total target",
    "id": "Target total wirid tetap"
  },
  "تبدیلی محفوظ کریں": {
    "ur": "تبدیلی محفوظ کریں",
    "en": "Save changes",
    "id": "Simpan perubahan"
  },
  "نیا ہدف محفوظ کریں": {
    "ur": "نیا ہدف محفوظ کریں",
    "en": "Save new target",
    "id": "Simpan target baru"
  },
  "آغاز": {
    "ur": "آغاز",
    "en": "Start",
    "id": "Mulai"
  },
  "اختتام": {
    "ur": "اختتام",
    "en": "End",
    "id": "Selesai"
  },
  "اکاؤنٹ تبدیل ہو چکا ہے۔": {
    "ur": "اکاؤنٹ تبدیل ہو چکا ہے۔",
    "en": "Account has changed.",
    "id": "Akun telah berubah."
  },
  "دوبارہ لاگ اِن کریں۔": {
    "ur": "دوبارہ لاگ اِن کریں۔",
    "en": "Log in again.",
    "id": "Masuk kembali."
  },
  "وظیفہ موجود نہیں۔": {
    "ur": "وظیفہ موجود نہیں۔",
    "en": "Wirid not found.",
    "id": "Wirid tidak ditemukan."
  },
  "یہ مرحلہ تبدیل نہیں کیا جا سکتا۔": {
    "ur": "یہ مرحلہ تبدیل نہیں کیا جا سکتا۔",
    "en": "This phase cannot be changed.",
    "id": "Fase ini tidak dapat diubah."
  },
  "لاگ اِن ضروری ہے۔": {
    "ur": "لاگ اِن ضروری ہے۔",
    "en": "Login required.",
    "id": "Harus masuk."
  },
  "ریکارڈ تازہ کریں": {
    "ur": "ریکارڈ تازہ کریں",
    "en": "Refresh records",
    "id": "Muat ulang catatan"
  },
  "اسکرول بند کریں": {
    "ur": "اسکرول بند کریں",
    "en": "Close scrolling",
    "id": "Tutup gulir"
  },
  "عربی عبارت: اوپر نیچے سوائپ کرکے مکمل پڑھیں": {
    "ur": "عربی عبارت: اوپر نیچے سوائپ کرکے مکمل پڑھیں",
    "en": "Arabic text: swipe up and down to read fully",
    "id": "Teks Arab: geser ke atas dan bawah untuk membaca lengkap"
  },
  "عربی اسکرول کھولنے کے لیے اوپر والا بٹن دبائیں": {
    "ur": "عربی اسکرول کھولنے کے لیے اوپر والا بٹن دبائیں",
    "en": "Tap the button above to open Arabic scrolling",
    "id": "Ketuk tombol di atas untuk membuka gulir teks Arab"
  },
  "یہ ذاتی وظیفہ حذف کریں؟ اس کا ذاتی ریکارڈ بھی ختم ہوگا۔": {
    "ur": "یہ ذاتی وظیفہ حذف کریں؟ اس کا ذاتی ریکارڈ بھی ختم ہوگا۔",
    "en": "Delete this personal wirid? Its personal record will also be deleted.",
    "id": "Hapus wirid pribadi ini? Catatan pribadinya juga akan dihapus."
  },
  "وظیفہ دوبارہ کھولیں۔": {
    "ur": "وظیفہ دوبارہ کھولیں۔",
    "en": "Open the wirid again.",
    "id": "Buka kembali wirid."
  },
  "درست تعداد درج کریں۔ کمی صرف اسی دن کی محفوظ تعداد تک ہو سکتی ہے۔": {
    "ur": "درست تعداد درج کریں۔ کمی صرف اسی دن کی محفوظ تعداد تک ہو سکتی ہے۔",
    "en": "Enter a valid count. A reduction cannot exceed the saved count for that day.",
    "id": "Masukkan hitungan valid. Pengurangan tidak boleh melebihi hitungan tersimpan hari itu."
  },
  "کمی": {
    "ur": "کمی",
    "en": "Reduction",
    "id": "Pengurangan"
  },
  "اضافہ": {
    "ur": "اضافہ",
    "en": "Addition",
    "id": "Penambahan"
  },
  "درود شریف گلوبل": {
    "ur": "درود شریف گلوبل",
    "en": "Durood Sharif Global",
    "id": "Durood Sharif Global"
  },
  "Durood Sharif Global": {
    "ur": "درود شریف گلوبل",
    "en": "Durood Sharif Global",
    "id": "Durood Sharif Global"
  },
  "بے شک اللہ اور اس کے فرشتے نبی ﷺ پر درود بھیجتے ہیں۔ اے ایمان والو! تم بھی آپ ﷺ پر درود اور خوب سلام بھیجو۔": {
    "ur": "بے شک اللہ اور اس کے فرشتے نبی ﷺ پر درود بھیجتے ہیں۔ اے ایمان والو! تم بھی آپ ﷺ پر درود اور خوب سلام بھیجو۔",
    "en": "Indeed, Allah and His angels send blessings upon the Prophet ﷺ. O believers, send blessings upon him and greet him with peace.",
    "id": "Sesungguhnya Allah dan para malaikat-Nya berselawat untuk Nabi ﷺ. Wahai orang beriman, berselawatlah dan ucapkanlah salam kepadanya."
  },
  "اللہ تعالیٰ اپنے محبوب حضرت محمد ﷺ اور آپ ﷺ کی آل پر رحمت، برکت اور سلامتی نازل فرمائے۔": {
    "ur": "اللہ تعالیٰ اپنے محبوب حضرت محمد ﷺ اور آپ ﷺ کی آل پر رحمت، برکت اور سلامتی نازل فرمائے۔",
    "en": "May Allah send mercy, blessings and peace upon His beloved Muhammad ﷺ and his family.",
    "id": "Semoga Allah melimpahkan rahmat, berkah dan kedamaian kepada kekasih-Nya Muhammad ﷺ dan keluarganya."
  },
  "سورۃ الاحزاب: 56": {
    "ur": "سورۃ الاحزاب: 56",
    "en": "Surah Al-Ahzab: 56",
    "id": "Surah Al-Ahzab: 56"
  },
  "مقامِ مدینہ": {
    "ur": "مقامِ مدینہ",
    "en": "Madinah",
    "id": "Madinah"
  },
  "خانہ کعبہ": {
    "ur": "خانہ کعبہ",
    "en": "The Kaaba",
    "id": "Kakbah"
  },
  "اکاؤنٹ چیک کیا جا رہا ہے…": {
    "ur": "اکاؤنٹ چیک کیا جا رہا ہے…",
    "en": "Checking account…",
    "id": "Memeriksa akun…"
  },
  "دوبارہ لوڈ کریں / Retry": {
    "ur": "دوبارہ لوڈ کریں",
    "en": "Retry",
    "id": "Coba lagi"
  },
  "خوش آمدید": {
    "ur": "خوش آمدید",
    "en": "Welcome",
    "id": "Selamat datang"
  },
  "مالک اور تمام ممبرز اسی فارم سے لاگ اِن کرتے ہیں۔ ممبر نمبر اکاؤنٹ بننے کے بعد پروفائل میں نظر آتا ہے۔": {
    "ur": "مالک اور تمام ممبرز اسی فارم سے لاگ اِن کرتے ہیں۔ ممبر نمبر اکاؤنٹ بننے کے بعد پروفائل میں نظر آتا ہے۔",
    "en": "The owner and all members sign in here. Your member number appears in your profile after account creation.",
    "id": "Pemilik dan semua anggota masuk di sini. Nomor anggota muncul pada profil setelah akun dibuat."
  },
  "اکاؤنٹ کے ٹیب": {
    "ur": "اکاؤنٹ کے ٹیب",
    "en": "Account tabs",
    "id": "Tab akun"
  },
  "Login": {
    "ur": "لاگ اِن",
    "en": "Login",
    "id": "Masuk"
  },
  "New User": {
    "ur": "نیا ممبر",
    "en": "New user",
    "id": "Pengguna baru"
  },
  "ای میل / لاگ اِن آئی ڈی": {
    "ur": "ای میل / لاگ اِن آئی ڈی",
    "en": "Email / login ID",
    "id": "Email / ID masuk"
  },
  "Owner: full email / Member: email or username": {
    "ur": "مالک: مکمل ای میل / ممبر: ای میل یا یوزر نام",
    "en": "Owner: full email / Member: email or username",
    "id": "Pemilik: email lengkap / Anggota: email atau nama pengguna"
  },
  "Password": {
    "ur": "پاس ورڈ",
    "en": "Password",
    "id": "Kata sandi"
  },
  "Enter password": {
    "ur": "پاس ورڈ لکھیں",
    "en": "Enter password",
    "id": "Masukkan kata sandi"
  },
  "Show password": {
    "ur": "پاس ورڈ دکھائیں",
    "en": "Show password",
    "id": "Tampilkan kata sandi"
  },
  "Hide password": {
    "ur": "پاس ورڈ چھپائیں",
    "en": "Hide password",
    "id": "Sembunyikan kata sandi"
  },
  "مجھے لاگ اِن رکھیں — Keep me logged in": {
    "ur": "مجھے لاگ اِن رکھیں",
    "en": "Keep me logged in",
    "id": "Tetap masuk"
  },
  "Forgot password? / پاس ورڈ ری سیٹ کریں": {
    "ur": "پاس ورڈ بھول گئے؟",
    "en": "Forgot password?",
    "id": "Lupa kata sandi?"
  },
  "پورا نام — Full name": {
    "ur": "پورا نام",
    "en": "Full name",
    "id": "Nama lengkap"
  },
  "اپنا پورا نام": {
    "ur": "اپنا پورا نام",
    "en": "Your full name",
    "id": "Nama lengkap Anda"
  },
  "آپ کی لاگ اِن آئی ڈی": {
    "ur": "آپ کی لاگ اِن آئی ڈی",
    "en": "Your login ID",
    "id": "ID masuk Anda"
  },
  "کم از کم 8 حروف": {
    "ur": "کم از کم 8 حروف",
    "en": "At least 8 characters",
    "id": "Minimal 8 karakter"
  },
  "Gender — جنس منتخب کریں": {
    "ur": "جنس منتخب کریں",
    "en": "Select gender",
    "id": "Pilih jenis kelamin"
  },
  "Male — مرد": {
    "ur": "مرد",
    "en": "Male",
    "id": "Laki-laki"
  },
  "Female — عورت": {
    "ur": "عورت",
    "en": "Female",
    "id": "Perempuan"
  },
  "Invite Code": {
    "ur": "دعوتی کوڈ",
    "en": "Invite code",
    "id": "Kode undangan"
  },
  "ممبر کا دعوتی کوڈ": {
    "ur": "ممبر کا دعوتی کوڈ",
    "en": "Member invitation code",
    "id": "Kode undangan anggota"
  },
  "حلف نامہ — Pledge": {
    "ur": "حلف نامہ",
    "en": "Pledge",
    "id": "Ikrar"
  },
  "میں مسلمان ہوں": {
    "ur": "میں مسلمان ہوں",
    "en": "I am Muslim",
    "id": "Saya Muslim"
  },
  "میں مرد ہوں اور اس حلف کی تصدیق کرتا ہوں": {
    "ur": "میں مرد ہوں اور اس حلف کی تصدیق کرتا ہوں",
    "en": "I am male and confirm this pledge",
    "id": "Saya laki-laki dan mengonfirmasi ikrar ini"
  },
  "میں عورت ہوں اور اس حلف کی تصدیق کرتی ہوں": {
    "ur": "میں عورت ہوں اور اس حلف کی تصدیق کرتی ہوں",
    "en": "I am female and confirm this pledge",
    "id": "Saya perempuan dan mengonfirmasi ikrar ini"
  },
  "میں نے یہ حلف پڑھ کر قبول کیا ہے": {
    "ur": "میں نے یہ حلف پڑھ کر قبول کیا ہے",
    "en": "I have read and accept this pledge",
    "id": "Saya telah membaca dan menerima ikrar ini"
  },
  "Log in": {
    "ur": "لاگ اِن",
    "en": "Log in",
    "id": "Masuk"
  },
  "Create Account": {
    "ur": "اکاؤنٹ بنائیں",
    "en": "Create account",
    "id": "Buat akun"
  },
  "نئے ممبر کو دعوتی کوڈ کسی موجودہ ممبر سے لینا ہوگا۔ Owner کا پہلا اکاؤنٹ محفوظ انتظامی طریقے سے بنایا جاتا ہے، عام رجسٹریشن سے نہیں۔": {
    "ur": "نئے ممبر کو دعوتی کوڈ کسی موجودہ ممبر سے لینا ہوگا۔ Owner کا پہلا اکاؤنٹ محفوظ انتظامی طریقے سے بنایا جاتا ہے، عام رجسٹریشن سے نہیں۔",
    "en": "New members need an invitation code from an existing member. The first owner account is created through a secure administrative process, not normal registration.",
    "id": "Anggota baru memerlukan kode undangan dari anggota yang sudah terdaftar. Akun pemilik pertama dibuat melalui proses administratif yang aman, bukan pendaftaran biasa."
  },
  "Install App — ایپ انسٹال کریں": {
    "ur": "ایپ انسٹال کریں",
    "en": "Install app",
    "id": "Instal aplikasi"
  },
  "لوڈنگ میں دیر ہو رہی ہے۔ انٹرنیٹ چیک کریں اور دوبارہ کوشش کریں۔": {
    "ur": "لوڈنگ میں دیر ہو رہی ہے۔ انٹرنیٹ چیک کریں اور دوبارہ کوشش کریں۔",
    "en": "Loading is taking longer than expected. Check your internet connection and try again.",
    "id": "Pemuatan lebih lama dari perkiraan. Periksa koneksi internet dan coba lagi."
  },
  "ممبر ڈیش بورڈ": {
    "ur": "ممبر ڈیش بورڈ",
    "en": "Member dashboard",
    "id": "Dasbor anggota"
  },
  "مسجد نبوی کی آرائشی تصویر": {
    "ur": "مسجد نبوی کی آرائشی تصویر",
    "en": "Decorative image of the Prophet's Mosque",
    "id": "Gambar dekoratif Masjid Nabawi"
  },
  "خانہ کعبہ کی آرائشی تصویر": {
    "ur": "خانہ کعبہ کی آرائشی تصویر",
    "en": "Decorative image of the Kaaba",
    "id": "Gambar dekoratif Kakbah"
  },
  "میں پانچ وقت کی نماز پڑھنے کی کوشش کروں گا۔": {
    "ur": "میں پانچ وقت کی نماز پڑھنے کی کوشش کروں گا۔",
    "en": "I will try to perform the five daily prayers.",
    "id": "Saya akan berusaha melaksanakan salat lima waktu."
  },
  "میں پانچ وقت کی نماز پڑھنے کی کوشش کروں گی۔": {
    "ur": "میں پانچ وقت کی نماز پڑھنے کی کوشش کروں گی۔",
    "en": "I will try to perform the five daily prayers.",
    "id": "Saya akan berusaha melaksanakan salat lima waktu."
  },
  "میں دس ممبرز کو درود شریف پڑھنے کی دعوت دینے کی کوشش کروں گا اور انہیں اس گروپ کا حصہ بناؤں گا۔": {
    "ur": "میں دس ممبرز کو درود شریف پڑھنے کی دعوت دینے کی کوشش کروں گا اور انہیں اس گروپ کا حصہ بناؤں گا۔",
    "en": "I will try to invite ten members to recite salawat and join this group.",
    "id": "Saya akan berusaha mengajak sepuluh anggota membaca selawat dan bergabung dengan grup ini."
  },
  "میں دس ممبرز کو درود شریف پڑھنے کی دعوت دینے کی کوشش کروں گی اور انہیں اس گروپ کا حصہ بناؤں گی۔": {
    "ur": "میں دس ممبرز کو درود شریف پڑھنے کی دعوت دینے کی کوشش کروں گی اور انہیں اس گروپ کا حصہ بناؤں گی۔",
    "en": "I will try to invite ten members to recite salawat and join this group.",
    "id": "Saya akan berusaha mengajak sepuluh anggota membaca selawat dan bergabung dengan grup ini."
  },
  "میں مرد ہوں اور حلف دیتا ہوں کہ درود شریف اخلاص سے پڑھوں گا اور صرف اتنی تعداد درج کروں گا جتنی میں نے واقعی پڑھی ہے۔ تسبیح کاؤنٹر یا دستی اندراج کے ذریعے جان بوجھ کر کوئی جھوٹی تعداد شامل نہیں کروں گا۔": {
    "ur": "میں مرد ہوں اور حلف دیتا ہوں کہ درود شریف اخلاص سے پڑھوں گا اور صرف اتنی تعداد درج کروں گا جتنی میں نے واقعی پڑھی ہے۔ تسبیح کاؤنٹر یا دستی اندراج کے ذریعے جان بوجھ کر کوئی جھوٹی تعداد شامل نہیں کروں گا۔",
    "en": "I swear that I will recite salawat sincerely and record only what I actually recite. I will never knowingly add a false count through the tasbih counter or manual entry.",
    "id": "Saya bersumpah akan membaca selawat dengan ikhlas dan hanya mencatat jumlah yang benar-benar saya baca. Saya tidak akan sengaja menambah hitungan palsu melalui penghitung tasbih atau entri manual."
  },
  "میں عورت ہوں اور حلف دیتی ہوں کہ درود شریف اخلاص سے پڑھوں گی اور صرف اتنی تعداد درج کروں گی جتنی میں نے واقعی پڑھی ہے۔ تسبیح کاؤنٹر یا دستی اندراج کے ذریعے جان بوجھ کر کوئی جھوٹی تعداد شامل نہیں کروں گی۔": {
    "ur": "میں عورت ہوں اور حلف دیتی ہوں کہ درود شریف اخلاص سے پڑھوں گی اور صرف اتنی تعداد درج کروں گی جتنی میں نے واقعی پڑھی ہے۔ تسبیح کاؤنٹر یا دستی اندراج کے ذریعے جان بوجھ کر کوئی جھوٹی تعداد شامل نہیں کروں گی۔",
    "en": "I swear that I will recite salawat sincerely and record only what I actually recite. I will never knowingly add a false count through the tasbih counter or manual entry.",
    "id": "Saya bersumpah akan membaca selawat dengan ikhlas dan hanya mencatat jumlah yang benar-benar saya baca. Saya tidak akan sengaja menambah hitungan palsu melalui penghitung tasbih atau entri manual."
  }
});
const selection=()=>{try{const x=localStorage.getItem("durood-language");return root.duroodLocale.valid(x)?x:"ur";}catch{return "ur";}};
function textFor(value,lang=selection()){
 if(typeof value!=="string")return value;
 const key=value.trim(),row=Object.prototype.hasOwnProperty.call(labels,key)?labels[key]:null;
 if(!row)return value;
 return value.match(/^\s*/)[0]+row[lang]+value.match(/\s*$/)[0];
}
const originals=new WeakMap(),attributes=new WeakMap();
const excluded="script,style,textarea,[contenteditable],[lang=ar],.wz-arabic,.wz-ticker-text,.durood-copy,.about-arabic,[data-no-translate],#generated-username";
function updateText(node,lang){
 const p=node.parentElement;if(!p||p.closest(excluded))return;
 const old=originals.get(node),raw=old&&node.data===old.output?old.source:node.data;
 const output=textFor(raw,lang);originals.set(node,{source:raw,output});if(node.data!==output)node.data=output;
}
function updateAttributes(el,lang){
 if(el.closest(excluded))return;
 let old=attributes.get(el);if(!old){old={};attributes.set(el,old);}
 for(const key of ["aria-label","title","placeholder"]){if(!el.hasAttribute(key))continue;
 const current=el.getAttribute(key),prior=old[key],raw=prior&&current===prior.output?prior.source:current,output=textFor(raw,lang);
 old[key]={source:raw,output};if(output!==current)el.setAttribute(key,output);}
}
function scan(scope,lang){
 if(scope.nodeType===3){updateText(scope,lang);return;}
 if(scope.nodeType!==1||scope.closest(excluded))return;
 updateAttributes(scope,lang);
 const walker=document.createTreeWalker(scope,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){if(node.nodeType===3)updateText(node,lang);else updateAttributes(node,lang);}
}
function mount(scope){
 if(!scope)return ()=>{};
 const apply=()=>scan(scope,selection());
 const observer=new MutationObserver(records=>{const lang=selection();for(const m of records){
 if(m.type==="childList"){for(const node of m.addedNodes)scan(node,lang);}
 else if(m.type==="characterData")updateText(m.target,lang);
 else if(m.type==="attributes")updateAttributes(m.target,lang);
 }});
 observer.observe(scope,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-label","title","placeholder"]});
 apply();return apply;
}
root.duroodStaticLocale=Object.freeze({textFor,selection,mount});
})(globalThis);
