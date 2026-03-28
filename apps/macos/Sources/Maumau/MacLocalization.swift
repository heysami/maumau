import Foundation

private let indonesianMacStrings: [String: String] = [
    "General": "Umum",
    "Models": "Model",
    "Channels": "Channel",
    "Voice Wake": "Voice Wake",
    "Config": "Konfigurasi",
    "State": "State",
    "Instances": "Instans",
    "Sessions": "Sesi",
    "Cron": "Cron",
    "Skills": "Skill",
    "Plugins": "Plugin",
    "Permissions": "Izin",
    "Debug": "Debug",
    "About": "Tentang",
    "Model Defaults": "Default model",
    "Fallback Order": "Urutan fallback",
    "Provider": "Provider",
    "Not set": "Belum diatur",
    "Model reference": "Referensi model",
    "Model ID": "ID model",
    "Fallback model": "Model fallback",
    "Add fallback": "Tambah fallback",
    "Add custom fallback": "Tambah fallback kustom",
    "Use custom model reference": "Gunakan referensi model kustom",
    "Use custom model ID": "Gunakan ID model kustom",
    "Choose from catalog": "Pilih dari katalog",
    "Add or connect model": "Tambah atau hubungkan model",
    "Model setup": "Setup model",
    "Connect model provider": "Hubungkan provider model",
    "Connect another provider": "Hubungkan provider lain",
    "Choose the AI service you want to add here. Maumau will guide you through sign-in or API key setup without sending you to Config.":
        "Pilih layanan AI yang ingin Anda tambahkan di sini. Maumau akan memandu login atau setup API key tanpa mengirim Anda ke Konfigurasi.",
    "Loading provider choices…": "Memuat pilihan provider…",
    "No provider choices are available right now.":
        "Belum ada pilihan provider yang tersedia saat ini.",
    "Already connected": "Sudah terhubung",
    "Connection problem": "Masalah koneksi",
    "Starting connection…": "Memulai koneksi…",
    "Saving provider connection…": "Menyimpan koneksi provider…",
    "Waiting for the next setup step…": "Menunggu langkah setup berikutnya…",
    "Provider connected. Choose a model below, then save when you're ready.":
        "Provider terhubung. Pilih model di bawah, lalu simpan saat Anda siap.",
    "Model setup complete. Reloading models…": "Setup model selesai. Memuat ulang model…",
    "Waiting for model setup…": "Menunggu setup model…",
    "No fallback models yet.": "Belum ada model fallback.",
    "No models available for this provider.":
        "Belum ada model yang tersedia untuk provider ini.",
    "No catalog models are available yet. Type a provider/model reference manually.":
        "Belum ada model katalog yang tersedia. Ketik referensi provider/model secara manual.",
    "Enter provider/model manually when the list is unavailable.":
        "Masukkan provider/model secara manual saat daftar tidak tersedia.",
    "Use the catalog picker or type a provider/model ref directly.":
        "Gunakan pemilih katalog atau ketik referensi provider/model langsung.",
    "Pick the model Maumau should use by default.":
        "Pilih model default yang harus dipakai Maumau.",
    "This only changes the model ID for the selected provider.":
        "Ini hanya mengubah ID model untuk provider yang dipilih.",
    "Current primary": "Model utama saat ini",
    "Choosing a model here will replace the current primary.":
        "Memilih model di sini akan menggantikan model utama saat ini.",
    "Connect a provider before choosing a model.":
        "Hubungkan provider terlebih dahulu sebelum memilih model.",
    "Connect a provider before adding fallbacks.":
        "Hubungkan provider terlebih dahulu sebelum menambahkan fallback.",
    "If the primary model fails, Maumau tries these next.":
        "Jika model utama gagal, Maumau akan mencoba yang berikutnya.",
    "Fallbacks use the providers you already connected.":
        "Fallback memakai provider yang sudah Anda hubungkan.",
    "Use model setup to connect another provider or auth method without leaving Settings.":
        "Gunakan setup model untuk menghubungkan provider atau metode auth lain tanpa keluar dari Pengaturan.",
    "Need another model before you can add a fallback. Connect another provider first.":
        "Anda memerlukan model lain sebelum bisa menambahkan fallback. Hubungkan provider lain terlebih dahulu.",
    "Connect another provider or auth method so you can add new models and fallbacks from Settings.":
        "Hubungkan provider atau metode auth lain agar Anda bisa menambahkan model dan fallback baru dari Pengaturan.",
    "This popup only handles model setup. It does not restart full onboarding.":
        "Popup ini hanya menangani setup model. Ini tidak memulai ulang seluruh onboarding.",
    "Add another provider or auth method so you can choose more models and fallbacks here.":
        "Tambahkan provider atau metode auth lain agar Anda bisa memilih lebih banyak model dan fallback di sini.",
    "This window only changes model connections for Settings.":
        "Jendela ini hanya mengubah koneksi model untuk Pengaturan.",
    "Loading models…": "Memuat model…",
    "This tab is read-only in Nix mode. Edit model defaults via Nix and rebuild.":
        "Tab ini hanya baca dalam mode Nix. Edit default model lewat Nix lalu build ulang.",
    "These defaults start with what you chose during onboarding. Update the primary model and fallback order here.":
        "Default ini dimulai dari yang Anda pilih saat onboarding. Perbarui model utama dan urutan fallback di sini.",
    "Switch providers only if that provider is already connected.":
        "Ganti provider hanya jika provider itu sudah terhubung.",
    "Fallback models are tried in order if the primary model fails.":
        "Model fallback dicoba berurutan jika model utama gagal.",
    "Could not load models. You can still change them in the Config tab.":
        "Tidak bisa memuat model. Anda masih bisa mengubahnya di tab Konfigurasi.",
    "Managed by Nix": "Dikelola oleh Nix",
    "Maumau active": "Maumau aktif",
    "Pause to stop the Maumau gateway; no messages will be processed.":
        "Jeda untuk menghentikan gateway Maumau; tidak ada pesan yang akan diproses.",
    "Launch at login": "Jalankan saat login",
    "Automatically start Maumau after you sign in.":
        "Mulai Maumau secara otomatis setelah Anda masuk.",
    "Show Dock icon": "Tampilkan ikon Dock",
    "Keep Maumau visible in the Dock instead of menu-bar-only mode.":
        "Tampilkan Maumau di Dock alih-alih hanya di menu bar.",
    "Play menu bar icon animations": "Putar animasi ikon menu bar",
    "Enable idle blinks and wiggles on the status icon.":
        "Aktifkan kedipan dan gerakan kecil saat ikon status sedang diam.",
    "Allow Canvas": "Izinkan Canvas",
    "Allow the agent to show and control the Canvas panel.":
        "Izinkan agen menampilkan dan mengendalikan panel Canvas.",
    "Allow Camera": "Izinkan Kamera",
    "Allow the agent to capture a photo or short video via the built-in camera.":
        "Izinkan agen mengambil foto atau video singkat lewat kamera bawaan.",
    "Enable Peekaboo Bridge": "Aktifkan Peekaboo Bridge",
    "Allow signed tools (e.g. `peekaboo`) to drive UI automation via PeekabooBridge.":
        "Izinkan tool bertanda tangan (mis. `peekaboo`) menjalankan otomasi UI lewat PeekabooBridge.",
    "Enable debug tools": "Aktifkan tool debug",
    "Show the Debug tab with development utilities.":
        "Tampilkan tab Debug dengan utilitas pengembangan.",
    "Use the same language for the Maumau app and chat replies.":
        "Gunakan bahasa yang sama untuk aplikasi Maumau dan balasan chat.",
    "Quit Maumau": "Keluar dari Maumau",
    "Maumau runs": "Maumau berjalan",
    "Not configured": "Belum dikonfigurasi",
    "Local (this Mac)": "Lokal (Mac ini)",
    "Remote (another host)": "Remote (host lain)",
    "Pick Local or Remote to start the Gateway.":
        "Pilih Lokal atau Remote untuk memulai Gateway.",
    "Transport": "Transport",
    "SSH tunnel": "SSH tunnel",
    "Direct (ws/wss)": "Langsung (ws/wss)",
    "Identity file": "File identitas",
    "Project root": "Root proyek",
    "CLI path": "Path CLI",
    "Advanced": "Lanjutan",
    "Control channel": "Channel kontrol",
    "Last heartbeat": "Heartbeat terakhir",
    "Tip: enable Tailscale for stable remote access.":
        "Tip: aktifkan Tailscale untuk akses remote yang stabil.",
    "Tip: use Tailscale Serve so the gateway has a valid HTTPS cert.":
        "Tip: gunakan Tailscale Serve agar gateway punya sertifikat HTTPS yang valid.",
    "Gateway": "Gateway",
    "Gateway token": "Token Gateway",
    "Used when the remote gateway requires token auth.":
        "Dipakai saat gateway remote memerlukan autentikasi token.",
    "The current gateway.remote.token value is not plain text. Maumau for macOS cannot use it directly; enter a plaintext token here to replace it.":
        "Nilai `gateway.remote.token` saat ini bukan teks biasa. Maumau untuk macOS tidak bisa memakainya langsung; masukkan token teks biasa di sini untuk menggantinya.",
    "Test remote": "Uji remote",
    "Connected": "Terhubung",
    "Connecting…": "Menghubungkan…",
    "Disconnected": "Terputus",
    "Testing…": "Menguji…",
    "Install CLI": "Pasang CLI",
    "Reinstall CLI": "Pasang ulang CLI",
    "Recheck": "Periksa lagi",
    "Health check pending…": "Pemeriksaan kesehatan masih menunggu…",
    "Run Health Check": "Jalankan pemeriksaan kesehatan",
    "Reveal Logs": "Buka log",
    "Checks that the Gateway responds and that your linked channel still looks signed in.":
        "Memeriksa apakah Gateway merespons dan apakah channel yang terhubung masih terlihat sudah login.",
    "Check now": "Periksa sekarang",
    "Open logs": "Buka log",
    "Log file not found": "File log tidak ditemukan",
    """
    Looked for maumau logs in /tmp/maumau/.
    Run a health check or send a message to generate activity, then try again.
    """:
        """
        Sudah mencari log maumau di /tmp/maumau/.
        Jalankan pemeriksaan kesehatan atau kirim pesan untuk menghasilkan aktivitas, lalu coba lagi.
        """,
    "OK": "OK",
    "Private access": "Akses privat",
    "Install Tailscale here to turn on private access for this Gateway.":
        "Pasang Tailscale di sini untuk menyalakan akses privat untuk Gateway ini.",
    "Finish Tailscale sign-in on this Mac, then choose how this Gateway is shared.":
        "Selesaikan login Tailscale di Mac ini, lalu pilih bagaimana Gateway ini dibagikan.",
    "Manage how this Gateway is shared through Tailscale.":
        "Kelola bagaimana Gateway ini dibagikan lewat Tailscale.",
    "Powered by Tailscale. Use the install button here on this Mac first, then add your phone or other devices later when you want them.":
        "Didukung oleh Tailscale. Gunakan tombol instal di Mac ini terlebih dahulu, lalu tambahkan ponsel atau perangkat lain nanti saat Anda menginginkannya.",
    "Need help adding another device later?": "Butuh bantuan menambahkan perangkat lain nanti?",
    "Install Tailscale on that phone or laptop later.":
        "Pasang Tailscale di ponsel atau laptop itu nanti.",
    "Sign in there with the same Tailscale account or private network.":
        "Masuk di sana dengan akun Tailscale atau jaringan privat yang sama.",
    "Then open the private link shown here.":
        "Lalu buka tautan privat yang ditampilkan di sini.",
    "Tailscale is not installed on this Mac yet":
        "Tailscale belum terpasang di Mac ini",
    "Tailscale is installed and signed in on this Mac":
        "Tailscale sudah terpasang dan sudah login di Mac ini",
    "Tailscale is installed, but this Mac is not signed in yet":
        "Tailscale sudah terpasang, tetapi Mac ini belum login",
    "Refresh": "Segarkan",
    "Install on this Mac": "Pasang di Mac ini",
    "Maumau downloads the official Tailscale macOS package and runs the installer command here. macOS will ask for your administrator password.":
        "Maumau mengunduh paket macOS resmi Tailscale dan menjalankan perintah pemasangnya di sini. macOS akan meminta kata sandi administrator Anda.",
    "Open Tailscale guide": "Buka panduan Tailscale",
    "Access mode": "Mode akses",
    "Off": "Mati",
    "Private (Serve)": "Privat (Serve)",
    "Public (Funnel)": "Publik (Funnel)",
    "No private Tailscale access.": "Tidak ada akses privat Tailscale.",
    "Private HTTPS for devices in your Tailscale network.":
        "HTTPS privat untuk perangkat di jaringan Tailscale Anda.",
    "Public HTTPS link. Maumau requires its own password.":
        "Tautan HTTPS publik. Maumau memerlukan kata sandinya sendiri.",
    "Sign in on this Mac first. Tailscale can open your browser, and then you can come back here for the private link.":
        "Masuk di Mac ini terlebih dahulu. Tailscale bisa membuka browser Anda, lalu Anda bisa kembali ke sini untuk tautan privat.",
    "Open browser sign-in": "Buka login lewat browser",
    "Require credentials": "Wajibkan kredensial",
    "Private mode trusts Tailscale's verified identity, so Maumau does not need its own password here.":
        "Mode privat mempercayai identitas Tailscale yang terverifikasi, jadi Maumau tidak memerlukan kata sandinya sendiri di sini.",
    "Public mode requires a Maumau password.":
        "Mode publik memerlukan kata sandi Maumau.",
    "Password": "Kata sandi",
    "Stored in ~/.maumau/maumau.json. Prefer MAUMAU_GATEWAY_PASSWORD if you want to manage it outside the app.":
        "Disimpan di ~/.maumau/maumau.json. Lebih baik gunakan MAUMAU_GATEWAY_PASSWORD jika Anda ingin mengelolanya di luar aplikasi.",
    "Update password": "Perbarui kata sandi",
    "Password required for this mode.": "Kata sandi wajib untuk mode ini.",
    "Saved private access settings. Restarting gateway…":
        "Pengaturan akses privat disimpan. Gateway sedang dimulai ulang…",
    "Saved private access settings. Restart the gateway to apply.":
        "Pengaturan akses privat disimpan. Mulai ulang gateway untuk menerapkan.",
    "Downloading the official Tailscale installer…":
        "Mengunduh pemasang Tailscale resmi…",
    "Preparing browser sign-in…": "Menyiapkan login lewat browser…",
    "Installing on this Mac…": "Memasang di Mac ini…",
    "Opening browser sign-in…": "Membuka login lewat browser…",
    "Local mode required. Update settings on the gateway host.":
        "Mode lokal diperlukan. Perbarui pengaturan di host gateway.",
    "Allow these so Maumau can notify and capture when needed.":
        "Izinkan hal-hal ini agar Maumau bisa memberi notifikasi dan mengambil data saat diperlukan.",
    "Restart onboarding": "Mulai ulang onboarding",
    "Location Access": "Akses lokasi",
    "While Using": "Saat digunakan",
    "Always": "Selalu",
    "Precise Location": "Lokasi presisi",
    "Always may require System Settings to approve background location.":
        "Mode Selalu mungkin memerlukan persetujuan Lokasi latar belakang dari Pengaturan Sistem.",
    "Granted": "Diizinkan",
    "Grant": "Izinkan",
    "Checking…": "Memeriksa…",
    "Request access": "Minta akses",
    "Automation (AppleScript)": "Otomasi (AppleScript)",
    "Notifications": "Notifikasi",
    "Accessibility": "Aksesibilitas",
    "Screen Recording": "Perekaman layar",
    "Microphone": "Mikrofon",
    "Speech Recognition": "Pengenalan suara",
    "Camera": "Kamera",
    "Location": "Lokasi",
    "Control other apps (e.g. Terminal) for automation actions":
        "Mengendalikan aplikasi lain (mis. Terminal) untuk aksi otomasi",
    "Show desktop alerts for agent activity":
        "Tampilkan peringatan desktop untuk aktivitas agen",
    "Control UI elements when an action requires it":
        "Kendalikan elemen UI saat sebuah aksi memerlukannya",
    "Capture the screen for context or screenshots":
        "Tangkap layar untuk konteks atau tangkapan layar",
    "Allow Voice Wake and audio capture":
        "Izinkan Voice Wake dan pengambilan audio",
    "Transcribe Voice Wake trigger phrases on-device":
        "Transkripsikan frasa pemicu Voice Wake di perangkat",
    "Capture photos and video from the camera":
        "Ambil foto dan video dari kamera",
    "Share location when requested by the agent":
        "Bagikan lokasi saat diminta oleh agen",
    "Refresh status": "Segarkan status",
    "Context": "Konteks",
    "No active sessions": "Tidak ada sesi aktif",
    "Loading sessions…": "Memuat sesi…",
    "Connect the gateway to see sessions":
        "Hubungkan gateway untuk melihat sesi",
    "Gateway disconnected": "Gateway terputus",
    "Loading devices...": "Memuat perangkat...",
    "No devices yet": "Belum ada perangkat",
    "More Devices...": "Perangkat lainnya...",
    "Usage cost (30 days)": "Biaya penggunaan (30 hari)",
    "Send Heartbeats": "Kirim heartbeat",
    "Browser Control": "Kontrol browser",
    "Exec Approvals": "Persetujuan eksekusi",
    "Open Dashboard": "Buka dashboard",
    "Open Chat": "Buka chat",
    "Open Canvas": "Buka Canvas",
    "Close Canvas": "Tutup Canvas",
    "Talk Mode": "Mode bicara",
    "Stop Talk Mode": "Hentikan mode bicara",
    "Settings…": "Pengaturan…",
    "About Maumau": "Tentang Maumau",
    "Quit": "Keluar",
    "Update ready, restart now?": "Pembaruan siap, mulai ulang sekarang?",
    "Maumau Not Configured": "Maumau belum dikonfigurasi",
    "Remote Maumau Active": "Maumau remote aktif",
    "Maumau Active": "Maumau aktif",
    "Pairing approval pending": "Persetujuan pairing tertunda",
    "Device pairing pending": "Pairing perangkat tertunda",
    "Health check running…": "Pemeriksaan kesehatan sedang berjalan…",
    "Health: login required": "Kesehatan: login diperlukan",
    "Health pending": "Kesehatan menunggu",
    "Control channel disconnected": "Channel kontrol terputus",
    "Last heartbeat sent": "Heartbeat terakhir terkirim",
    "Heartbeat ok": "Heartbeat baik",
    "Heartbeat skipped": "Heartbeat dilewati",
    "Heartbeat failed": "Heartbeat gagal",
    "Heartbeat": "Heartbeat",
    "No heartbeat yet": "Belum ada heartbeat",
    "Refreshing microphones…": "Menyegarkan mikrofon…",
    "Unavailable": "Tidak tersedia",
    "Disconnected (using System default)":
        "Terputus (menggunakan default sistem)",
    "System default": "Default sistem",
    "Dashboard unavailable": "Dashboard tidak tersedia",
    "Configured": "Terkonfigurasi",
    "Available": "Tersedia",
    "Running": "Berjalan",
    "Not linked": "Belum tertaut",
    "Waiting for scan": "Menunggu pemindaian",
    "No number linked yet": "Belum ada nomor yang tertaut",
    "Select a channel to view status and settings.":
        "Pilih channel untuk melihat status dan pengaturan.",
    "Last check": "Pemeriksaan terakhir",
    "Error": "Kesalahan",
    "Logout": "Keluar",
    "Bot identity": "Identitas bot",
    "Agent identity": "Identitas agen",
    "App identity": "Identitas aplikasi",
    "Setup for now": "Setup untuk sekarang",
    "What you need first": "Apa yang perlu Anda siapkan dulu",
    "What we need from you": "Apa yang kami butuhkan dari Anda",
    "How to get it": "Cara mendapatkannya",
    "Bring this back to Maumau": "Bawa ini kembali ke Maumau",
    "What you will paste or link here": "Apa yang akan Anda tempel atau tautkan di sini",
    "After setup": "Setelah setup",
    "Official guides": "Panduan resmi",
    "Configuration": "Konfigurasi",
    "Save changes": "Simpan perubahan",
    "Reload config": "Muat ulang konfigurasi",
    "Unsupported step type": "Tipe langkah tidak didukung",
    "Back": "Kembali",
    "AI service": "Layanan AI",
    "Retry": "Coba lagi",
    "Run": "Jalankan",
    "Continue": "Lanjutkan",
    "just now": "baru saja",
    "1 minute ago": "1 menit lalu",
    "1 hour ago": "1 jam lalu",
    "yesterday": "kemarin",
    "unknown": "tidak diketahui",
    "system sent": "dikirim sistem",
    "aborted": "dibatalkan",
    "Direct": "Langsung",
    "Group": "Grup",
    "Global": "Global",
    "Unknown": "Tidak diketahui",
    "Peek at the stored conversation buckets the CLI reuses for context and rate limits.":
        "Lihat sekilas bucket percakapan tersimpan yang dipakai ulang oleh CLI untuk konteks dan batas laju.",
    "No sessions yet. They appear after the first inbound message or heartbeat.":
        "Belum ada sesi. Sesi akan muncul setelah pesan masuk pertama atau heartbeat pertama.",
    "Skills are enabled when requirements are met (binaries, env, config). This is not a full plugin list.":
        "Skill diaktifkan saat persyaratannya terpenuhi (biner, env, konfigurasi). Ini bukan daftar plugin lengkap.",
    "No skills reported yet.": "Belum ada skill yang dilaporkan.",
    "No skills match this filter.": "Tidak ada skill yang cocok dengan filter ini.",
    "Filter": "Filter",
    "All": "Semua",
    "Ready": "Siap",
    "Needs Setup": "Perlu setup",
    "Disabled": "Nonaktif",
    "Bundled": "Bundel",
    "Managed": "Dikelola",
    "Extra": "Tambahan",
    "Website": "Situs web",
    "Missing binaries:": "Biner yang belum ada:",
    "Missing env:": "Env yang belum ada:",
    "Requires config:": "Perlu konfigurasi:",
    "Set": "Atur",
    "Set API Key": "Atur API key",
    "Set Environment Variable": "Atur variabel lingkungan",
    "Skill": "Skill",
    "Get your key →": "Ambil key Anda →",
    "Saved to maumau.json under skills.entries.":
        "Disimpan ke maumau.json di skills.entries.",
    "Install on Gateway": "Pasang di Gateway",
    "Switches to Local mode to install on this Mac.":
        "Akan beralih ke mode Lokal untuk memasang di Mac ini.",
    "No instances reported yet.": "Belum ada instans yang dilaporkan.",
    "Connected Instances": "Instans yang terhubung",
    "Latest presence beacons from Maumau nodes. Updated periodically.":
        "Beacon kehadiran terbaru dari node Maumau. Diperbarui secara berkala.",
    "unknown host": "host tidak diketahui",
    "Copy Debug Summary": "Salin ringkasan debug",
    "Presence updated": "Kehadiran diperbarui",
    "presence": "kehadiran",
    "Active": "Aktif",
    "Idle": "Diam",
    "Stale": "Kedaluwarsa",
    "Local": "Lokal",
    "Device": "Perangkat",
    "Self": "Diri sendiri",
    "Connect": "Hubungkan",
    "Disconnect": "Putuskan",
    "Node connect": "Node terhubung",
    "Node disconnect": "Node terputus",
    "Launch": "Mulai",
    "Resync": "Sinkron ulang",
    "Why this presence entry was last updated (debug marker).":
        "Mengapa entri kehadiran ini terakhir diperbarui (penanda debug).",
    "Why this presence entry was last updated (debug marker). Raw:":
        "Mengapa entri kehadiran ini terakhir diperbarui (penanda debug). Mentah:",
    "Loaded": "Dimuat",
    "Installed": "Terpasang",
    "Enabled in config": "Diaktifkan di konfigurasi",
    "Needs Attention": "Perlu perhatian",
    "All discovered plugins, including ones that do not ship any Skills.":
        "Semua plugin yang ditemukan, termasuk yang tidak menyertakan Skill apa pun.",
    "No plugins discovered yet.": "Belum ada plugin yang ditemukan.",
    "Package": "Paket",
    "Version": "Versi",
    "Source": "Sumber",
    "Adds": "Menambahkan",
    "No plugin capabilities or routes are registered.":
        "Belum ada kemampuan atau rute plugin yang terdaftar.",
    "Runtime": "Runtime",
    "Tools": "Tool",
    "Hooks": "Hook",
    "CLI Commands": "Perintah CLI",
    "Services": "Layanan",
    "Gateway Methods": "Metode Gateway",
    "HTTP Routes": "Rute HTTP",
    "Config Schema": "Skema konfigurasi",
    "Yes": "Ya",
    "No": "Tidak",
    "Load Error": "Kesalahan muat",
    "Diagnostics": "Diagnostik",
    "Text Providers": "Penyedia teks",
    "Speech Providers": "Penyedia ucapan",
    "Media Understanding": "Pemahaman media",
    "Image Generation": "Pembuatan gambar",
    "Web Search": "Pencarian web",
    "Bundle Capabilities": "Kemampuan bundel",
    "Notice": "Pemberitahuan",
    "Menu bar companion for notifications, screenshots, and privileged agent actions.":
        "Pendamping menu bar untuk notifikasi, tangkapan layar, dan aksi agen yang memiliki izin khusus.",
    "Built": "Dibuat",
    "Check for updates automatically": "Periksa pembaruan secara otomatis",
    "Check for Updates…": "Periksa pembaruan…",
    "Updates unavailable in this build.": "Pembaruan tidak tersedia di build ini.",
    "Open Config Folder": "Buka folder konfigurasi",
    "Run Health Check Now": "Jalankan pemeriksaan kesehatan sekarang",
    "Send Test Heartbeat": "Kirim heartbeat uji",
    "Remote Tunnel": "Tunnel remote",
    "Reset Remote Tunnel": "Setel ulang tunnel remote",
    "Verbose Logging (Main): On": "Logging verbose (utama): aktif",
    "Verbose Logging (Main): Off": "Logging verbose (utama): mati",
    "Verbosity": "Verbositas",
    "File Logging: On": "Logging file: aktif",
    "File Logging: Off": "Logging file: mati",
    "App Logging": "Logging aplikasi",
    "Open Session Store": "Buka penyimpanan sesi",
    "Open Agent Events…": "Buka peristiwa agen…",
    "Open Log": "Buka log",
    "Send Debug Voice Text": "Kirim teks suara debug",
    "Send Test Notification": "Kirim notifikasi uji",
    "Restart Gateway": "Mulai ulang Gateway",
    "Restart App": "Mulai ulang aplikasi",
    "Main": "Utama",
    "Other": "Lainnya",
    "checked": "diperiksa",
    "Trace": "Trace",
    "Info": "Info",
    "Warning": "Peringatan",
    "Critical": "Kritis",
    "Deny": "Tolak",
    "Allowlist": "Daftar izin",
    "Always Allow": "Selalu izinkan",
    "Always Ask": "Selalu tanya",
    "Never Ask": "Jangan pernah tanya",
    "Ask on Allowlist Miss": "Tanya saat tidak ada di daftar izin",
    "Pattern cannot be empty.": "Pola tidak boleh kosong.",
    "Path patterns only. Include '/', '~', or '\\\\'.":
        "Hanya pola path. Sertakan '/', '~', atau '\\\\'.",
    "Delete cron job?": "Hapus pekerjaan cron?",
    "Delete": "Hapus",
    "Cron scheduler is disabled": "Penjadwal cron dinonaktifkan",
    "Jobs are saved, but they will not run automatically until `cron.enabled` is set to `true` and the Gateway restarts.":
        "Pekerjaan sudah disimpan, tetapi tidak akan berjalan otomatis sampai `cron.enabled` disetel ke `true` dan Gateway dimulai ulang.",
    "Manage Gateway cron jobs (main session vs isolated runs) and inspect run history.":
        "Kelola pekerjaan cron Gateway (sesi utama vs run terisolasi) dan periksa riwayat run.",
    "New Job": "Pekerjaan baru",
    "Select a job to inspect details and run history.":
        "Pilih pekerjaan untuk memeriksa detail dan riwayat run.",
    "Tip: use ‘New Job’ to add one, or enable cron in your gateway config.":
        "Tip: gunakan ‘Pekerjaan baru’ untuk menambahkannya, atau aktifkan cron di konfigurasi gateway Anda.",
    "disabled": "nonaktif",
    "no next run": "belum ada run berikutnya",
    "agent": "agen",
    "Run now": "Jalankan sekarang",
    "Open transcript": "Buka transkrip",
    "Disable": "Nonaktifkan",
    "Enable": "Aktifkan",
    "Edit…": "Edit…",
    "Edit": "Edit",
    "Delete…": "Hapus…",
    "Transcript": "Transkrip",
    "Cancel": "Batal",
    "Save": "Simpan",
    "Schedule": "Jadwal",
    "Kind": "Jenis",
    "Auto-delete": "Hapus otomatis",
    "after success": "setelah berhasil",
    "Description": "Deskripsi",
    "Agent": "Agen",
    "Session": "Sesi",
    "Wake": "Bangunkan",
    "Next run": "Run berikutnya",
    "Last run": "Run terakhir",
    "Last status": "Status terakhir",
    "Run history": "Riwayat run",
    "No run log entries yet.": "Belum ada entri log run.",
    "Payload": "Payload",
    "announce": "umumkan",
    "no delivery": "tanpa pengiriman",
    "now": "sekarang",
    "next-heartbeat": "heartbeat berikutnya",
    "ok": "ok",
    "error": "kesalahan",
    "skipped": "dilewati",
    "due": "jatuh tempo",
    "in <1m": "dalam <1m",
    "main": "utama",
    "isolated": "terisolasi",
    "current": "saat ini",
    "New cron job": "Pekerjaan cron baru",
    "Edit cron job": "Edit pekerjaan cron",
    "Basics": "Dasar",
    "Name": "Nama",
    "Required (e.g. “Daily summary”)": "Wajib (mis. “Ringkasan harian”)",
    "Optional notes": "Catatan opsional",
    "Agent ID": "ID agen",
    "Optional (default agent)": "Opsional (agen default)",
    "Enabled": "Aktif",
    "Session target": "Target sesi",
    "Wake mode": "Mode bangun",
    "Create a schedule that wakes Maumau via the Gateway. Use an isolated session for agent turns so your main chat stays clean.":
        "Buat jadwal yang membangunkan Maumau lewat Gateway. Gunakan sesi terisolasi untuk giliran agen agar chat utama tetap bersih.",
    "Main jobs post a system event into the current main session. Current and isolated-style jobs run agent turns and can announce results to a channel.":
        "Pekerjaan utama memposting peristiwa sistem ke sesi utama saat ini. Pekerjaan bergaya current dan isolated menjalankan giliran agen dan bisa mengumumkan hasil ke channel.",
    "“At” runs once, “Every” repeats with a duration, “Cron” uses a 5-field Unix expression.":
        "“At” berjalan sekali, “Every” mengulang dengan durasi, “Cron” memakai ekspresi Unix 5 kolom.",
    "At": "Pada",
    "Delete after successful run": "Hapus setelah run berhasil",
    "Every": "Setiap",
    "Expression": "Ekspresi",
    "e.g. 0 9 * * 3": "mis. 0 9 * * 3",
    "Timezone": "Zona waktu",
    "Optional (e.g. America/Los_Angeles)":
        "Opsional (mis. America/Los_Angeles)",
    "systemEvent": "peristiwa sistem",
    "agentTurn": "giliran agen",
    "Isolated jobs always run an agent turn. Announce sends a short summary to a channel.":
        "Pekerjaan terisolasi selalu menjalankan giliran agen. Umumkan mengirim ringkasan singkat ke channel.",
    "System events are injected into the current main session. Agent turns require an isolated session target.":
        "Peristiwa sistem disuntikkan ke sesi utama saat ini. Giliran agen memerlukan target sesi terisolasi.",
    "System event text": "Teks peristiwa sistem",
    "Message": "Pesan",
    "What should Maumau do?": "Apa yang harus dilakukan Maumau?",
    "Thinking": "Thinking",
    "Optional (e.g. low)": "Opsional (mis. low)",
    "Timeout": "Batas waktu",
    "Seconds (optional)": "Detik (opsional)",
    "Delivery": "Pengiriman",
    "Announce summary": "Umumkan ringkasan",
    "None": "Tidak ada",
    "Channel": "Channel",
    "To": "Ke",
    "Optional override (phone number / chat id / Discord channel)":
        "Override opsional (nomor telepon / chat id / channel Discord)",
    "Best-effort": "Best-effort",
    "Do not fail the job if announce fails":
        "Jangan gagal jika pengumuman gagal",
    "last": "terakhir",
    "Untitled job": "Pekerjaan tanpa judul",
    "Allow this command?": "Izinkan perintah ini?",
    "Review the command details before allowing.":
        "Periksa detail perintah sebelum mengizinkannya.",
    "Allow Once": "Izinkan sekali",
    "Don't Allow": "Jangan izinkan",
    "Command": "Perintah",
    "Working directory": "Direktori kerja",
    "Executable": "Eksekutabel",
    "Host": "Host",
    "Security": "Keamanan",
    "Ask mode": "Mode tanya",
    "No additional context provided.":
        "Tidak ada konteks tambahan yang diberikan.",
    "This runs on this machine.": "Ini berjalan di mesin ini.",
    "Wizard returned a step the app could not read. Retry setup.":
        "Wizard mengembalikan langkah yang tidak bisa dibaca aplikasi. Coba setup lagi.",
    "Wizard session lost. Restarting…":
        "Sesi wizard hilang. Memulai ulang…",
    "Wizard did not advance to the next step. Please retry setup.":
        "Wizard tidak maju ke langkah berikutnya. Silakan coba setup lagi.",
    "Setup mode": "Mode setup",
    "QuickStart": "QuickStart",
    "QuickStart only supports local gateways. Switching to Manual mode.":
        "QuickStart hanya mendukung gateway lokal. Beralih ke mode Manual.",
    "Existing config detected": "Konfigurasi yang ada terdeteksi",
    "Maumau found existing setup on this Mac. What should setup do with your current settings?":
        "Maumau menemukan pengaturan yang sudah ada di Mac ini. Apa yang harus dilakukan setup terhadap pengaturan Anda saat ini?",
    "Keep my current settings": "Pertahankan pengaturan saya saat ini",
    "Use your saved gateway, model, provider, and channel settings as-is.":
        "Gunakan pengaturan gateway, model, provider, dan channel yang tersimpan apa adanya.",
    "Review and update settings": "Tinjau dan perbarui pengaturan",
    "Start from your current setup, then change anything you want in the next steps.":
        "Mulai dari setup Anda saat ini, lalu ubah apa pun yang Anda inginkan di langkah berikutnya.",
    "Start fresh": "Mulai dari awal",
    "Clear saved setup before continuing. You can choose how much to erase next.":
        "Hapus setup yang tersimpan sebelum melanjutkan. Anda bisa memilih seberapa banyak yang ingin dihapus setelah ini.",
    "How much of the existing Maumau setup should be erased?":
        "Seberapa banyak setup Maumau yang sudah ada harus dihapus?",
    "Settings only": "Hanya pengaturan",
    "Remove saved config, but keep API keys, channel logins, chat sessions, and workspace files.":
        "Hapus konfigurasi yang tersimpan, tetapi pertahankan API key, login channel, sesi chat, dan file workspace.",
    "Settings, logins, and chat sessions":
        "Pengaturan, login, dan sesi chat",
    "Remove config, saved credentials, and session history, but keep workspace files.":
        "Hapus konfigurasi, kredensial yang tersimpan, dan riwayat sesi, tetapi pertahankan file workspace.",
    "Everything, including workspace files":
        "Semuanya, termasuk file workspace",
    "Remove config, saved credentials, sessions, and the workspace used by the agent.":
        "Hapus konfigurasi, kredensial yang tersimpan, sesi, dan workspace yang digunakan agen.",
    "Clean local reset": "Reset lokal bersih",
    "Remove the local gateway service, app-managed CLI, saved setup, chats, and workspace files on this Mac.":
        "Hapus layanan gateway lokal, CLI yang dikelola aplikasi, setup yang tersimpan, chat, dan file workspace di Mac ini.",
    "How do you want to hatch your bot?": "Bagaimana Anda ingin memulai bot Anda?",
    "Do this later": "Lakukan nanti",
    "Choose optional automations": "Pilih otomasi opsional",
    "Skip for now": "Lewati dulu",
    "Optional automations": "Otomasi opsional",
    "No Optional Automations": "Tidak ada otomasi opsional",
    "Automations enabled": "Otomasi diaktifkan",
    "OpenAI Codex OAuth": "OpenAI Codex OAuth",
    """
    Browser will open for OpenAI authentication.
    If the callback doesn't auto-complete, paste the redirect URL.
    OpenAI OAuth uses localhost:1455 for the callback.
    """:
        """
        Browser akan terbuka untuk autentikasi OpenAI.
        Jika callback tidak selesai otomatis, tempel URL redirect.
        OpenAI OAuth memakai localhost:1455 untuk callback.
        """,
    "OAuth prerequisites": "Prasyarat OAuth",
    "OAuth help": "Bantuan OAuth",
    "Paste the authorization code (or full redirect URL):":
        "Tempel kode otorisasi (atau URL redirect lengkap):",
    "Model/auth choice": "Pilihan model/auth",
    "Model configured": "Model dikonfigurasi",
    "Provider notes": "Catatan provider",
    "No auth methods available for that provider.":
        "Tidak ada metode auth yang tersedia untuk provider itu.",
    "Review what you need before continuing.":
        "Tinjau apa yang Anda butuhkan sebelum melanjutkan.",
    "Read what you need below each option before continuing.":
        "Baca apa yang Anda butuhkan di bawah setiap opsi sebelum melanjutkan.",
    "Browser sign-in": "Login lewat browser",
    "ChatGPT sign-in or API key": "Login ChatGPT atau API key",
    "API key or Claude setup-token": "API key atau setup-token Claude",
    "Gemini API key or CLI sign-in": "Gemini API key atau login CLI",
    "Run local models on this Mac": "Jalankan model lokal di Mac ini",
    "One API for many model brands": "Satu API untuk banyak merek model",
    "Custom Provider": "Provider kustom",
    "Any OpenAI or Anthropic compatible endpoint":
        "Endpoint apa pun yang kompatibel dengan OpenAI atau Anthropic",
    "GitHub + local proxy": "GitHub + proxy lokal",
    "Account ID + Gateway ID + API key": "ID Akun + ID Gateway + API key",
    "Open-source models including Llama, DeepSeek, and more":
        "Model open-source termasuk Llama, DeepSeek, dan lainnya",
    "Google OAuth with project-aware token payload":
        "Google OAuth dengan payload token yang mengetahui project",
    "Inference API (HF token)": "Inference API (token HF)",
    "Anthropic token (paste setup-token)":
        "Token Anthropic (tempel setup-token)",
    "Run `claude setup-token` elsewhere, then paste the token here":
        "Jalankan `claude setup-token` di tempat lain, lalu tempel tokennya di sini",
    "The easiest OpenAI setup if you already use ChatGPT.":
        "Pengaturan OpenAI termudah jika Anda sudah menggunakan ChatGPT.",
    "A ChatGPT account and a browser sign-in. No API key.":
        "Akun ChatGPT dan login lewat browser. Tidak perlu API key.",
    "Create or sign in to ChatGPT, then come back here and approve the browser sign-in flow.":
        "Buat akun atau masuk ke ChatGPT, lalu kembali ke sini dan setujui alur login lewat browser.",
    "API billing, automation, and project-scoped usage.":
        "Billing API, otomasi, dan penggunaan per proyek.",
    "An OpenAI Platform account with billing enabled.":
        "Akun OpenAI Platform dengan billing yang sudah diaktifkan.",
    "Open the OpenAI Platform, add a payment method if needed, then create a secret key from the API keys page.":
        "Buka OpenAI Platform, tambahkan metode pembayaran jika perlu, lalu buat secret key dari halaman API keys.",
    "Standard Claude API usage and the smoothest Anthropic setup in Maumau.":
        "Penggunaan Claude API standar dan setup Anthropic yang paling mulus di Maumau.",
    "An Anthropic Console account and API billing access.":
        "Akun Anthropic Console dan akses billing API.",
    "Sign in to the Anthropic Console, add billing if your workspace needs it, then create an API key.":
        "Masuk ke Anthropic Console, tambahkan billing jika workspace Anda memerlukannya, lalu buat API key.",
    "Using a Claude subscription instead of API billing.":
        "Menggunakan langganan Claude alih-alih billing API.",
    "A Claude account and access to the Claude Code CLI on any machine.":
        "Akun Claude dan akses ke Claude Code CLI di perangkat mana pun.",
    "Sign in to Claude, run `claude setup-token` on any machine where Claude Code is installed, then paste that token here.":
        "Masuk ke Claude, jalankan `claude setup-token` di perangkat mana pun yang sudah memasang Claude Code, lalu tempel token itu di sini.",
    "The recommended Google setup for most people.":
        "Setup Google yang direkomendasikan untuk kebanyakan orang.",
    "A Google account with Google AI Studio access.":
        "Akun Google dengan akses ke Google AI Studio.",
    "Open Google AI Studio, create an API key, and paste that key into Maumau.":
        "Buka Google AI Studio, buat API key, lalu tempel key itu ke Maumau.",
    "Gemini CLI users who specifically want OAuth instead of an API key.":
        "Pengguna Gemini CLI yang secara khusus ingin OAuth alih-alih API key.",
    "A Google account plus Gemini CLI OAuth client setup.":
        "Akun Google plus setup klien OAuth Gemini CLI.",
    "Install or configure Gemini CLI first, make sure its OAuth client settings are ready, then sign in from the browser when prompted.":
        "Pasang atau konfigurasikan Gemini CLI terlebih dahulu, pastikan pengaturan klien OAuth-nya sudah siap, lalu masuk lewat browser saat diminta.",
    "Running open models locally without a cloud API key.":
        "Menjalankan model open-source secara lokal tanpa API key cloud.",
    "Ollama installed on this Mac and at least one model pulled locally.":
        "Ollama terpasang di Mac ini dan setidaknya satu model sudah di-pull secara lokal.",
    "Install Ollama, start the app or daemon, then run `ollama pull <model>` before returning to Maumau.":
        "Pasang Ollama, jalankan aplikasinya atau daemon-nya, lalu jalankan `ollama pull <model>` sebelum kembali ke Maumau.",
    "Trying many model providers behind one API key.":
        "Mencoba banyak penyedia model di balik satu API key.",
    "An OpenRouter account and API credits.":
        "Akun OpenRouter dan kredit API.",
    "Sign in to OpenRouter, add credits if needed, then create an API key from the Keys page.":
        "Masuk ke OpenRouter, tambahkan kredit jika perlu, lalu buat API key dari halaman Keys.",
    "Popular search API with strong filters":
        "API pencarian populer dengan filter yang kuat",
    "No signup, no key, experimental":
        "Tanpa daftar, tanpa key, eksperimental",
    "Gemini grounding with Google Search":
        "Grounding Gemini dengan Google Search",
    "Structured search with answer-style responses":
        "Pencarian terstruktur dengan respons bergaya jawaban",
    "A strong default search API with good filters and broad coverage.":
        "API pencarian default yang kuat dengan filter bagus dan cakupan luas.",
    "A Brave Search API subscription or trial key.":
        "Langganan Brave Search API atau trial key.",
    "Open Brave Search API, create a key, and paste it into Maumau.":
        "Buka Brave Search API, buat key, lalu tempelkan ke Maumau.",
    "Good general web search with structured metadata and region/language controls.":
        "Pencarian web umum yang bagus dengan metadata terstruktur serta kontrol wilayah/bahasa.",
    "The fastest zero-friction option when you want to skip account setup.":
        "Opsi tanpa hambatan tercepat saat Anda ingin melewati setup akun.",
    "Nothing extra. No signup, no key.":
        "Tidak perlu apa pun. Tidak perlu daftar, tidak perlu key.",
    "Just choose it here. Maumau enables it immediately.":
        "Cukup pilih di sini. Maumau akan langsung mengaktifkannya.",
    "Experimental key-free fallback. Convenient, but usually less controllable than paid APIs.":
        "Cadangan eksperimental tanpa key. Praktis, tetapi biasanya kontrolnya lebih sedikit daripada API berbayar.",
    "Google-grounded search when you already use Gemini.":
        "Pencarian yang berlandaskan Google saat Anda sudah menggunakan Gemini.",
    "A Gemini API key from Google AI Studio.":
        "Gemini API key dari Google AI Studio.",
    "Open Google AI Studio, create an API key, and paste it into Maumau.":
        "Buka Google AI Studio, buat API key, lalu tempelkan ke Maumau.",
    "Strong grounding for Google ecosystem users and pairs well with the Google model provider.":
        "Grounding yang kuat untuk pengguna ekosistem Google dan cocok dipasangkan dengan provider model Google.",
    "Search that already leans toward answer synthesis.":
        "Pencarian yang sudah condong ke sintesis jawaban.",
    "A Perplexity API key or compatible OpenRouter setup.":
        "Perplexity API key atau setup OpenRouter yang kompatibel.",
    "Open Perplexity API settings, create a key, and paste it into Maumau.":
        "Buka pengaturan API Perplexity, buat key, lalu tempelkan ke Maumau.",
    "Great for quick answer-style search results with citations.":
        "Bagus untuk hasil pencarian bergaya jawaban cepat dengan sitasi.",
    "Copilot Proxy": "Proxy Copilot",
    "Gateway did not become ready. Check that it is running.":
        "Gateway tidak menjadi siap. Periksa apakah gateway sedang berjalan.",
    "Change Mac access or tools later": "Ubah akses Mac atau tool nanti",
    "Permissions and the full Skills list stay available in Settings whenever you want to fine-tune things.":
        "Izin dan daftar Skill lengkap tetap tersedia di Pengaturan kapan pun Anda ingin menyesuaikan lebih rinci.",
    "Open Settings → Permissions": "Buka Pengaturan → Izin",
    "Manage private access later": "Kelola akses privat nanti",
    "Open Settings → General any time to install Tailscale on this Mac, sign this Mac in, turn private access on, or revisit the steps for adding your phone later.":
        "Buka Pengaturan → Umum kapan saja untuk memasang Tailscale di Mac ini, masuk di Mac ini, menyalakan akses privat, atau meninjau lagi langkah untuk menambahkan ponsel Anda nanti.",
    "Open Settings → General": "Buka Pengaturan → Umum",
    "Install the CLI": "Pasang CLI",
    "This is the small helper app Maumau uses behind the scenes when it lives on this Mac.":
        "Ini adalah aplikasi bantu kecil yang dipakai Maumau di belakang layar saat ia tinggal di Mac ini.",
    "Copied": "Tersalin",
    "Copy install command": "Salin perintah instalasi",
    """
    Maumau normally does this for you the first time you choose This Mac.
    It installs the helper pieces it needs in your user account.
    Use Install CLI if you want to retry or reinstall.
    """:
        """
        Maumau biasanya melakukan ini untuk Anda saat pertama kali memilih Mac ini.
        Maumau memasang bagian bantu yang dibutuhkannya di akun pengguna Anda.
        Gunakan Pasang CLI jika Anda ingin mencoba lagi atau memasang ulang.
        """,
    "Agent workspace": "Workspace agen",
    "Think of this as Maumau’s room. It is the folder where it keeps notes, reads instructions, and makes files.":
        "Anggap ini sebagai ruang Maumau. Ini adalah folder tempat ia menyimpan catatan, membaca instruksi, dan membuat file.",
    "Remote gateway detected": "Gateway remote terdeteksi",
    "Choose the remote workspace path now. The gateway wizard will use it, and you can copy a bootstrap command if you want to seed files manually.":
        "Pilih path workspace remote sekarang. Wizard gateway akan memakainya, dan Anda bisa menyalin perintah bootstrap jika ingin menyiapkan file secara manual.",
    "Workspace folder": "Folder workspace",
    "Save in config": "Simpan di konfigurasi",
    "Saved workspace path to the remote gateway config.":
        "Path workspace disimpan ke konfigurasi gateway remote.",
    "Copy setup command": "Salin perintah setup",
    "Create workspace": "Buat workspace",
    "Open folder": "Buka folder",
    "Saved to ~/.maumau/maumau.json (agents.defaults.workspace)":
        "Disimpan ke ~/.maumau/maumau.json (agents.defaults.workspace)",
    "Maumau will use this folder during setup. If it doesn’t exist yet, the setup wizard can create it and seed the bootstrap files.":
        "Maumau akan memakai folder ini selama setup. Jika belum ada, wizard setup bisa membuatnya dan menyiapkan file bootstrap.",
    "Tip: edit AGENTS.md in this folder to shape the assistant’s behavior. For backup, make the workspace a private git repo so your agent’s “memory” is versioned.":
        "Tip: edit AGENTS.md di folder ini untuk membentuk perilaku asisten. Untuk cadangan, jadikan workspace ini repo git privat agar “memori” agen Anda terversi.",
    "Meet your agent": "Temui agen Anda",
    "This is a dedicated onboarding chat. Your agent will introduce itself, learn who you are, and help you connect WhatsApp or Telegram if you want.":
        "Ini adalah chat onboarding khusus. Agen Anda akan memperkenalkan diri, mengenal siapa Anda, dan membantu menghubungkan WhatsApp atau Telegram jika Anda mau.",
    "Couldn’t check the included skills yet.":
        "Belum bisa memeriksa skill bawaan.",
    "Gateway URL": "URL Gateway",
    "Retry remote discovery (Tailscale DNS-SD + Serve probe).":
        "Coba lagi penemuan remote (Tailscale DNS-SD + probe Serve).",
    "Hide advanced remote fields": "Sembunyikan kolom remote lanjutan",
    "Advanced remote fields": "Kolom remote lanjutan",
    "Connect to an existing gateway instead": "Hubungkan ke gateway yang sudah ada",
    "Tip: keep Tailscale enabled so your gateway stays reachable.":
        "Tip: biarkan Tailscale tetap aktif agar gateway Anda tetap bisa dijangkau.",
    "Select a nearby gateway or open Advanced to enter a gateway URL.":
        "Pilih gateway terdekat atau buka Lanjutan untuk memasukkan URL gateway.",
    "Gateway URL must use wss:// for remote hosts (ws:// only for localhost).":
        "URL Gateway harus memakai wss:// untuk host remote (ws:// hanya untuk localhost).",
    "Select a nearby gateway or open Advanced to enter an SSH target.":
        "Pilih gateway terdekat atau buka Lanjutan untuk memasukkan target SSH.",
    "Remote connection": "Koneksi remote",
    "Checks the real remote websocket and auth handshake.":
        "Memeriksa websocket remote yang sebenarnya dan handshake autentikasi.",
    "Check connection": "Periksa koneksi",
    "Checking remote gateway…": "Memeriksa gateway remote…",
    "Remote gateway checklist": "Daftar periksa gateway remote",
    "Make sure the Gateway is running and connected, then hit Refresh or open Settings → Skills.":
        "Pastikan Gateway sedang berjalan dan terhubung, lalu tekan Segarkan atau buka Pengaturan → Skill.",
    "Details: ": "Detail: ",
    "1 included skill is ready on this Mac right now.":
        "1 skill bawaan siap di Mac ini sekarang.",
    "First-time local setup auto-installs nano-pdf, OpenAI Whisper, and summarize when they are missing. Skill Creator is already bundled and ready.":
        "Pengaturan lokal pertama akan memasang nano-pdf, OpenAI Whisper, dan summarize secara otomatis jika belum ada. Skill Creator sudah dibundel dan siap.",
    "Browser control, the core Mac tools above, and the default daily-life helpers stay separate from the longer Skills list, so the detailed inventory stays in Settings → Skills.":
        "Kontrol browser, tool inti Mac di atas, dan helper harian default tetap terpisah dari daftar Skill yang lebih panjang, jadi inventaris detailnya tetap ada di Pengaturan → Skill.",
    "This channel is already connected. Maumau is using the recommended defaults unless you change them later in full Settings → Channels.":
        "Channel ini sudah terhubung. Maumau memakai default yang direkomendasikan kecuali Anda mengubahnya nanti di Pengaturan lengkap → Channel.",
    "Onboarding only shows the key setup information for this app. When you connect it later, Maumau will use the recommended defaults automatically unless you change them in full Settings → Channels.":
        "Onboarding hanya menampilkan informasi setup utama untuk aplikasi ini. Saat Anda menghubungkannya nanti, Maumau akan memakai default yang direkomendasikan secara otomatis kecuali Anda mengubahnya di Pengaturan lengkap → Channel.",
    "Scan this QR with the WhatsApp number the bot will use":
        "Pindai QR ini dengan nomor WhatsApp yang akan dipakai bot",
    "The WhatsApp number or linked device that scans this QR becomes the bot identity. When people message that number, they are talking to the agent.":
        "Nomor WhatsApp atau perangkat tertaut yang memindai QR ini menjadi identitas bot. Saat orang mengirim pesan ke nomor itu, mereka sedang berbicara dengan agen.",
    "Scan the QR with the WhatsApp number or linked device the bot will use. Maumau cannot create a WhatsApp number for you.":
        "Pindai QR dengan nomor WhatsApp atau perangkat tertaut yang akan dipakai bot. Maumau tidak bisa membuat nomor WhatsApp untuk Anda.",
    "Link the WhatsApp number or linked device the bot will use. Maumau cannot create a WhatsApp number for you.":
        "Tautkan nomor WhatsApp atau perangkat tertaut yang akan dipakai bot. Maumau tidak bisa membuat nomor WhatsApp untuk Anda.",
    "Relink WhatsApp": "Tautkan ulang WhatsApp",
    "Link WhatsApp": "Tautkan WhatsApp",
    "Refresh QR": "Segarkan QR",
    "Bot token saved": "Token bot tersimpan",
    "No bot token saved yet": "Belum ada token bot tersimpan",
    "Ready to message": "Siap untuk menerima pesan",
    "Needs token": "Perlu token",
    "This Telegram bot is the agent identity. People message that bot handle to talk to the agent.":
        "Bot Telegram ini adalah identitas agen. Orang mengirim pesan ke handle bot itu untuk berbicara dengan agen.",
    "Maumau already has a Telegram bot token saved. Refresh after the bot is live to show the handle here.":
        "Maumau sudah memiliki token bot Telegram yang tersimpan. Segarkan setelah bot aktif untuk menampilkan handlenya di sini.",
    "Paste the bot token from BotFather. Maumau will open Telegram DMs so the bot can reply right away, while still requiring mentions in groups.":
        "Tempel token bot dari BotFather. Maumau akan membuka DM Telegram agar bot bisa langsung membalas, sambil tetap mewajibkan mention di grup.",
    "Telegram Agent": "Agen Telegram",
    "Telegram bot token": "Token bot Telegram",
    "A Telegram bot token is already saved. Paste a new one only if you want to replace it.":
        "Token bot Telegram sudah tersimpan. Tempel yang baru hanya jika Anda ingin menggantinya.",
    "Save Telegram bot": "Simpan bot Telegram",
    "Telegram bot saved. Direct messages are open so it replies right away.":
        "Bot Telegram tersimpan. Pesan langsung terbuka sehingga bot bisa langsung membalas.",
    "Onboarding opens Telegram DMs so you can message the bot immediately, and keeps group mention gating on. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.":
        "Onboarding membuka DM Telegram agar Anda bisa langsung mengirim pesan ke bot, dan tetap menyalakan pembatasan mention di grup. Perketat akses DM nanti di Pengaturan lengkap → Channel jika Anda ingin pairing atau allowlist.",
    "This Discord bot is the agent identity. People DM it or talk to it in the servers where you install it.":
        "Bot Discord ini adalah identitas agen. Orang bisa mengirim DM kepadanya atau berbicara dengannya di server tempat Anda memasangnya.",
    "Maumau already has a Discord bot token saved. Refresh after the bot is installed to show the bot name here.":
        "Maumau sudah memiliki token bot Discord yang tersimpan. Segarkan setelah bot terpasang untuk menampilkan nama bot di sini.",
    "Paste the Discord bot token from the Developer Portal. Maumau will open direct messages so the bot can reply right away after you install it.":
        "Tempel token bot Discord dari Developer Portal. Maumau akan membuka pesan langsung agar bot bisa langsung membalas setelah Anda memasangnya.",
    "Ready in Discord": "Siap di Discord",
    "Discord Agent": "Agen Discord",
    "Discord bot token": "Token bot Discord",
    "A Discord bot token is already saved. Paste a new one only if you want to replace it.":
        "Token bot Discord sudah tersimpan. Tempel yang baru hanya jika Anda ingin menggantinya.",
    "Save Discord bot": "Simpan bot Discord",
    "Discord bot saved. Direct messages are open so it replies right away after install.":
        "Bot Discord tersimpan. Pesan langsung terbuka sehingga bot bisa langsung membalas setelah dipasang.",
    "Onboarding opens Discord DMs so people can message the bot immediately after you invite or install it. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.":
        "Onboarding membuka DM Discord agar orang bisa langsung mengirim pesan ke bot setelah Anda mengundang atau memasangnya. Perketat akses DM nanti di Pengaturan lengkap → Channel jika Anda ingin pairing atau allowlist.",
    "Slack app tokens saved": "Token aplikasi Slack tersimpan",
    "No Slack app tokens saved yet": "Belum ada token aplikasi Slack tersimpan",
    "This Slack app becomes the agent identity inside the workspace. People DM it or mention it where the app is installed.":
        "Aplikasi Slack ini menjadi identitas agen di dalam workspace. Orang bisa mengirim DM kepadanya atau me-mention-nya di tempat aplikasi dipasang.",
    "Paste the bot token and app token from your Slack app. Maumau uses Socket Mode and opens direct messages so the app can reply right away after install.":
        "Tempel bot token dan app token dari aplikasi Slack Anda. Maumau memakai Socket Mode dan membuka pesan langsung agar aplikasi bisa langsung membalas setelah dipasang.",
    "Tokens saved": "Token tersimpan",
    "Slack Agent": "Agen Slack",
    "Slack bot token": "Token bot Slack",
    "Slack app token": "Token aplikasi Slack",
    "Slack bot and app tokens are already saved. Paste new ones only if you want to replace them.":
        "Token bot dan aplikasi Slack sudah tersimpan. Tempel yang baru hanya jika Anda ingin menggantinya.",
    "Save Slack app": "Simpan aplikasi Slack",
    "Slack app saved. Direct messages are open so it replies right away after install.":
        "Aplikasi Slack tersimpan. Pesan langsung terbuka sehingga bisa langsung membalas setelah dipasang.",
    "Onboarding opens Slack DMs so people can message the app immediately after install. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.":
        "Onboarding membuka DM Slack agar orang bisa langsung mengirim pesan ke aplikasi setelah dipasang. Perketat akses DM nanti di Pengaturan lengkap → Channel jika Anda ingin pairing atau allowlist.",
    "LINE channel credentials saved": "Kredensial channel LINE tersimpan",
    "No LINE channel linked yet": "Belum ada channel LINE yang tertaut",
    "This LINE Official Account is the agent identity. People message that account, and the agent replies there.":
        "Akun Resmi LINE ini adalah identitas agen. Orang mengirim pesan ke akun itu, dan agen membalas di sana.",
    "Paste the Channel access token and Channel secret from the LINE Developers Console. Maumau will open direct messages so the account can reply right away once the webhook is live.":
        "Tempel Channel access token dan Channel secret dari LINE Developers Console. Maumau akan membuka pesan langsung agar akun bisa langsung membalas setelah webhook aktif.",
    "Credentials saved": "Kredensial tersimpan",
    "LINE Agent": "Agen LINE",
    "LINE Channel access token": "Channel access token LINE",
    "Paste the Channel access token": "Tempel Channel access token",
    "LINE Channel secret": "Channel secret LINE",
    "Paste the Channel secret": "Tempel Channel secret",
    "LINE credentials are already saved. Paste new ones only if you want to replace them.":
        "Kredensial LINE sudah tersimpan. Tempel yang baru hanya jika Anda ingin menggantinya.",
    "Save LINE bot": "Simpan bot LINE",
    "LINE bot saved. Direct messages are open so it replies right away once the webhook is live.":
        "Bot LINE tersimpan. Pesan langsung terbuka sehingga bisa langsung membalas setelah webhook aktif.",
    "Onboarding opens LINE DMs so people can message the account immediately once the webhook is live. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.":
        "Onboarding membuka DM LINE agar orang bisa langsung mengirim pesan ke akun setelah webhook aktif. Perketat akses DM nanti di Pengaturan lengkap → Channel jika Anda ingin pairing atau allowlist.",
    "No Messages bridge saved yet": "Belum ada bridge Messages yang tersimpan",
    "Ready on this Mac": "Siap di Mac ini",
    "Needs bridge": "Perlu bridge",
    "Messages Agent": "Agen Messages",
    "Messages on this Mac saved. Direct messages are open so it replies right away.":
        "Messages di Mac ini tersimpan. Pesan langsung terbuka sehingga bisa langsung membalas.",
    "Use the Messages identity already signed into this Mac. If you installed imsg somewhere custom, change the CLI path before saving.":
        "Gunakan identitas Messages yang sudah login di Mac ini. Jika Anda memasang imsg di lokasi khusus, ubah path CLI sebelum menyimpan.",
    "imsg CLI path": "Path CLI imsg",
    "Use the default path if imsg is installed on this Mac normally. Only change it if you installed imsg somewhere custom or through a wrapper script.":
        "Gunakan path default jika imsg terpasang secara normal di Mac ini. Ubah hanya jika Anda memasang imsg di lokasi khusus atau lewat skrip pembungkus.",
    "Use Messages on this Mac": "Gunakan Messages di Mac ini",
    "Onboarding points Maumau at imsg on this Mac and opens direct messages so it replies right away. Tighten DM access later in full Settings → Channels if you want pairing or an allowlist.":
        "Onboarding mengarahkan Maumau ke imsg di Mac ini dan membuka pesan langsung agar bisa langsung membalas. Perketat akses DM nanti di Pengaturan lengkap → Channel jika Anda ingin pairing atau allowlist.",
    "A WhatsApp number or linked device becomes the agent identity.":
        "Nomor WhatsApp atau perangkat tertaut menjadi identitas agen.",
    "A phone number or WhatsApp account that will belong to the agent.":
        "Nomor telepon atau akun WhatsApp yang akan menjadi milik agen.",
    "WhatsApp or WhatsApp Business installed and fully signed in on that phone.":
        "WhatsApp atau WhatsApp Business terpasang dan sudah login sepenuhnya di ponsel itu.",
    "For a separate agent identity, use a dedicated number or dedicated linked device. Maumau cannot create or buy the number for you.":
        "Untuk identitas agen yang terpisah, gunakan nomor khusus atau perangkat tertaut khusus. Maumau tidak bisa membuat atau membeli nomor itu untuk Anda.",
    "On the phone the agent will use, finish WhatsApp setup first and wait until it can send and receive messages normally.":
        "Di ponsel yang akan dipakai agen, selesaikan dulu setup WhatsApp dan tunggu sampai bisa mengirim dan menerima pesan secara normal.",
    "Open WhatsApp on that phone and go to Settings > Linked Devices > Link a device.":
        "Buka WhatsApp di ponsel itu dan masuk ke Settings > Linked Devices > Link a device.",
    "Back in Maumau, press Link WhatsApp to show the QR code, then scan it with that phone.":
        "Kembali ke Maumau, tekan Tautkan WhatsApp untuk menampilkan kode QR, lalu pindai dengan ponsel itu.",
    "Wait for the link to finish. The number shown in Maumau becomes the number people message to reach the agent.":
        "Tunggu sampai penautan selesai. Nomor yang ditampilkan di Maumau menjadi nomor yang akan dikirimi pesan oleh orang untuk menghubungi agen.",
    "What gets linked here: the agent's WhatsApp number, for example +1 555 123 4567.":
        "Yang ditautkan di sini: nomor WhatsApp agen, misalnya +1 555 123 4567.",
    "You do not paste a token for WhatsApp. You link the real WhatsApp account by scanning the QR.":
        "Anda tidak menempelkan token untuk WhatsApp. Anda menautkan akun WhatsApp yang asli dengan memindai QR.",
    "People message that WhatsApp number from their normal WhatsApp accounts, and the agent replies in the same chat.":
        "Orang mengirim pesan ke nomor WhatsApp itu dari akun WhatsApp mereka seperti biasa, dan agen membalas di chat yang sama.",
    "Download WhatsApp": "Unduh WhatsApp",
    "WhatsApp linked devices help": "Bantuan perangkat tertaut WhatsApp",
    "No config sections available.": "Belum ada bagian konfigurasi yang tersedia.",
    "Schema unavailable.": "Skema tidak tersedia.",
    "Select a config section to view settings.":
        "Pilih bagian konfigurasi untuk melihat pengaturan.",
    "Unsaved changes": "Perubahan belum disimpan",
    "This tab is read-only in Nix mode. Edit config via Nix and rebuild.":
        "Tab ini hanya-baca dalam mode Nix. Edit konfigurasi lewat Nix lalu build ulang.",
    "Edit ~/.maumau/maumau.json using the schema-driven form.":
        "Edit ~/.maumau/maumau.json menggunakan formulir berbasis skema.",
    "Reload": "Muat ulang",
    "Saving…": "Menyimpan…",
    "Extra entries": "Entri tambahan",
    "No extra entries yet.": "Belum ada entri tambahan.",
    "Add": "Tambah",
    "Advanced settings": "Pengaturan lanjutan",
    "Select…": "Pilih…",
    "Unsupported field type.": "Tipe field tidak didukung.",
    "Remove": "Hapus",
    "Key": "Kunci",
    "Schema unavailable for this channel.":
        "Skema tidak tersedia untuk channel ini.",
    "Directory": "Direktori",
    "Account": "Akun",
    "Accounts": "Akun",
    "Enable Voice Wake": "Aktifkan Voice Wake",
    "Listen for a wake phrase (e.g. \"Claude\") before running voice commands. Voice recognition runs fully on-device.":
        "Dengarkan frasa pemicu (mis. \"Claude\") sebelum menjalankan perintah suara. Pengenalan suara sepenuhnya berjalan di perangkat.",
    "Hold Right Option to talk": "Tahan Option kanan untuk bicara",
    "Push-to-talk mode that starts listening while you hold the key and shows the preview overlay.":
        "Mode push-to-talk yang mulai mendengarkan saat Anda menahan tombol dan menampilkan overlay pratinjau.",
    "Voice Wake requires macOS 26 or newer.":
        "Voice Wake memerlukan macOS 26 atau yang lebih baru.",
    "Trigger words": "Kata pemicu",
    "Add word": "Tambah kata",
    "Reset defaults": "Reset default",
    "Wake word": "Kata pemicu",
    "Remove trigger word": "Hapus kata pemicu",
    "Maumau reacts when any trigger appears in a transcription. Keep them short to avoid false positives.":
        "Maumau bereaksi saat salah satu pemicu muncul dalam transkripsi. Jaga tetap singkat agar tidak terlalu sering salah deteksi.",
    "Sounds": "Suara",
    "Trigger sound": "Suara pemicu",
    "Send sound": "Suara kirim",
    "No Sound": "Tanpa suara",
    "Choose file…": "Pilih file…",
    "Play": "Putar",
    "Recognition language": "Bahasa pengenalan",
    "Language": "Bahasa",
    "Additional languages": "Bahasa tambahan",
    "Remove language": "Hapus bahasa",
    "Add language": "Tambah bahasa",
    "Add additional language": "Tambah bahasa tambahan",
    "Languages are tried in order. Models may need a first-use download on macOS 26.":
        "Bahasa dicoba sesuai urutan. Model mungkin perlu diunduh saat pertama kali dipakai di macOS 26.",
    "Live level": "Level langsung",
    "Test Voice Wake": "Uji Voice Wake",
    "Stop": "Berhenti",
    "Start test": "Mulai uji",
    "Press start, say a trigger word, and wait for detection.":
        "Tekan mulai, ucapkan kata pemicu, lalu tunggu sampai terdeteksi.",
    "Requesting mic & speech permission…":
        "Meminta izin mikrofon dan pengenalan suara…",
    "Listening… say your trigger word.":
        "Mendengarkan… ucapkan kata pemicu Anda.",
    "Finalizing…": "Menyelesaikan…",
    "Voice wake detected!": "Voice wake terdeteksi!",
    "Speech recognition unavailable": "Pengenalan suara tidak tersedia",
    """
    Missing mic/speech privacy strings. Rebuild the mac app (scripts/restart-mac.sh) to include usage descriptions.
    """:
        """
        String privasi mikrofon/pengenalan suara belum ada. Build ulang aplikasi Mac (scripts/restart-mac.sh) agar deskripsi penggunaan ikut dimasukkan.
        """,
    "Microphone or speech permission denied":
        "Izin mikrofon atau pengenalan suara ditolak",
    "No usable audio input device available":
        "Tidak ada perangkat input audio yang bisa dipakai",
    "No audio input available": "Tidak ada input audio yang tersedia",
    "No speech detected": "Tidak ada ucapan yang terdeteksi",
    "Timeout: no trigger heard": "Batas waktu: tidak ada pemicu yang terdengar",
    "Stopped": "Dihentikan",
    "No input": "Tidak ada input",
    "Built-in": "Bawaan",
    "Install Maumau CLI?": "Pasang CLI Maumau?",
    "Local mode needs the CLI so launchd can run the gateway.":
        "Mode lokal memerlukan CLI agar launchd bisa menjalankan gateway.",
    "Not now": "Jangan sekarang",
    "Open Settings": "Buka Pengaturan",
    "CLI install finished": "Instalasi CLI selesai",
    "Session log not found": "Log sesi tidak ditemukan",
    "Reset session?": "Reset sesi?",
    "Reset": "Reset",
    "Compact session log?": "Ringkas log sesi?",
    "Compact": "Ringkas",
    "Delete session?": "Hapus sesi?",
    "Update thinking failed": "Gagal memperbarui thinking",
    "Update verbose failed": "Gagal memperbarui verbose",
    "Reset failed": "Reset gagal",
    "Compact failed": "Ringkas gagal",
    "Delete failed": "Hapus gagal",
    "Maumau is paused": "Maumau sedang dijeda",
    "Unpause Maumau to run agent actions.":
        "Lanjutkan Maumau untuk menjalankan aksi agen.",
    "Deep link too large": "Deep link terlalu besar",
    "Message exceeds 20,000 characters.":
        "Pesan melebihi 20.000 karakter.",
    "Deep link blocked": "Deep link diblokir",
    "Run Maumau agent?": "Jalankan agen Maumau?",
    "agent request failed": "permintaan agen gagal",
    "Agent request failed": "Permintaan agen gagal",
    "Later": "Nanti",
    "Approve": "Setujui",
    "Reject": "Tolak",
    "Allow device to connect?": "Izinkan perangkat terhubung?",
    "Allow node to connect?": "Izinkan node terhubung?",
    "Platform": "Platform",
    "Client": "Klien",
    "Mode": "Mode",
    "Role": "Peran",
    "Scopes": "Scope",
    "IP": "IP",
    "Repair": "Perbaikan",
    "yes": "ya",
    "Node ID": "ID node",
    "App": "Aplikasi",
    "Note: Repair request (token will rotate).":
        "Catatan: permintaan perbaikan (token akan diputar ulang).",
    "Node pairing approved": "Pairing node disetujui",
    "Node pairing rejected": "Pairing node ditolak",
    "No gateways found yet.": "Belum ada gateway yang ditemukan.",
    "Click a discovered gateway to fill the gateway URL.":
        "Klik gateway yang ditemukan untuk mengisi URL gateway.",
    "Click a discovered gateway to fill the SSH target.":
        "Klik gateway yang ditemukan untuk mengisi target SSH.",
    "Gateway pairing only": "Hanya pairing gateway",
    "Discover Maumau gateways on your LAN":
        "Temukan gateway Maumau di LAN Anda",
]

func macLocalized(_ english: String, language: OnboardingLanguage) -> String {
    guard language == .id else { return english }
    return macLocalizedIndonesian(english)
}

func macCurrentLanguage() -> OnboardingLanguage {
    OnboardingLanguage.loadSelection(
        from: UserDefaults.standard.string(forKey: onboardingLanguageKey)) ?? .fallback
}

func macLocalized(_ english: String) -> String {
    macLocalized(english, language: macCurrentLanguage())
}

func macWizardText(_ raw: String?, language: OnboardingLanguage) -> String? {
    raw.map { macLocalized($0, language: language) }
}

func macSessionSubtitle(count: Int, language: OnboardingLanguage) -> String {
    guard language == .id else {
        return count == 1 ? "1 session · 24h" : "\(count) sessions · 24h"
    }
    return count == 1 ? "1 sesi · 24 jam" : "\(count) sesi · 24 jam"
}

func macPairingPendingText(count: Int, repairCount: Int, device: Bool, language: OnboardingLanguage) -> String {
    let repairSuffix: String
    if repairCount > 0 {
        repairSuffix = language == .id ? " · \(repairCount) perbaikan" : " · \(repairCount) repair"
    } else {
        repairSuffix = ""
    }
    if language == .id {
        return device
            ? "Pairing perangkat tertunda (\(count))\(repairSuffix)"
            : "Persetujuan pairing tertunda (\(count))\(repairSuffix)"
    }
    return device
        ? "Device pairing pending (\(count))\(repairSuffix)"
        : "Pairing approval pending (\(count))\(repairSuffix)"
}

func macInstalledRequired(installed: String, required: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Terpasang: \(installed) · Diperlukan: \(required)"
    }
    return "Installed: \(installed) · Required: \(required)"
}

func macGatewayDetected(version: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Gateway \(version) terdeteksi"
    }
    return "Gateway \(version) detected"
}

func macCliInstalledAt(_ path: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "CLI terpasang di \(path)"
    }
    return "CLI installed at \(path)"
}

func macLastFailure(_ failure: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Kegagalan terakhir: \(failure)"
    }
    return "Last failure: \(failure)"
}

func macLaunchdAutostart(_ label: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Gateway otomatis mulai dalam mode lokal lewat launchd (\(label))."
    }
    return "Gateway auto-starts in local mode via launchd (\(label))."
}

func macHealthAuthAge(label: String, age: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Usia auth \(label): \(age)"
    }
    return "\(label) auth age: \(age)"
}

func macSessionStoreStatus(path: String, count: Int, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Penyimpanan sesi: \(path) (\(count) entri)"
    }
    return "Session store: \(path) (\(count) entries)"
}

func macLastActivity(key: String, age: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Aktivitas terakhir: \(key) \(age)"
    }
    return "Last activity: \(key) \(age)"
}

func macPrivateLinkLabel(isPublic: Bool, language: OnboardingLanguage) -> String {
    if language == .id {
        return isPublic ? "Tautan publik:" : "Tautan privat:"
    }
    return isPublic ? "Public link:" : "Private link:"
}

func macGatewayStatusTitle(_ status: String, language: OnboardingLanguage) -> String {
    if language == .id {
        switch status {
        case "Connected via paired device":
            return "Terhubung lewat perangkat yang sudah dipasangkan"
        case "Connected with setup code":
            return "Terhubung dengan kode setup"
        case "Connected with gateway token":
            return "Terhubung dengan token gateway"
        case "Connected with password":
            return "Terhubung dengan kata sandi"
        case "Remote gateway ready":
            return "Gateway remote siap"
        default:
            return status
        }
    }
    return status
}

func macGatewayStatusDetail(_ detail: String?, language: OnboardingLanguage) -> String? {
    guard let detail else { return nil }
    guard language == .id else { return detail }
    switch detail {
    case "This Mac used a stored device token. New or unpaired devices may still need the gateway token.":
        return "Mac ini memakai token perangkat yang tersimpan. Perangkat baru atau yang belum dipasangkan mungkin masih memerlukan token gateway."
    case "This Mac is still using the temporary setup code. Approve pairing to finish provisioning device-scoped auth.":
        return "Mac ini masih memakai kode setup sementara. Setujui pairing untuk menyelesaikan penyediaan autentikasi khusus perangkat."
    default:
        return detail
    }
}

func macAuthIssueText(_ english: String, language: OnboardingLanguage) -> String {
    macLocalized(english, language: language)
}

func macDefaultSkillsReady(_ names: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Skill default sudah siap: \(names)"
    }
    return "Default skills already ready: \(names)"
}

func macInstallingDefaultSkills(language: OnboardingLanguage) -> String {
    if language == .id {
        return "Memasang skill default di Mac ini..."
    }
    return "Installing default skills on this Mac..."
}

func macInstalledDefaultSkills(_ names: String, retry: String?, language: OnboardingLanguage) -> String {
    if language == .id {
        if let retry, !retry.isEmpty {
            return "Skill default terpasang: \(names); coba lagi nanti untuk \(retry)"
        }
        return "Skill default terpasang: \(names)"
    }
    if let retry, !retry.isEmpty {
        return "Installed default skills: \(names); retry later for \(retry)"
    }
    return "Installed default skills: \(names)"
}

func macAutoInstallDefaultSkillsFailed(_ names: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Belum bisa memasang skill default secara otomatis: \(names)"
    }
    return "Couldn’t auto-install default skills yet: \(names)"
}

func macSwitchedToLocalModeForInstall(language: OnboardingLanguage) -> String {
    if language == .id {
        return "Beralih ke mode Lokal untuk memasang di Mac ini"
    }
    return "Switched to Local mode to install on this Mac"
}

func macSkillEnabledChanged(enabled: Bool, language: OnboardingLanguage) -> String {
    if language == .id {
        return enabled ? "Skill diaktifkan" : "Skill dinonaktifkan"
    }
    return enabled ? "Skill enabled" : "Skill disabled"
}

func macSavedApiKeyStatus(skillKey: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "API key disimpan — tersimpan di maumau.json (skills.entries.\(skillKey))"
    }
    return "Saved API key — stored in maumau.json (skills.entries.\(skillKey))"
}

func macSavedEnvStatus(envKey: String, skillKey: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "\(envKey) disimpan — tersimpan di maumau.json (skills.entries.\(skillKey).env)"
    }
    return "Saved \(envKey) — stored in maumau.json (skills.entries.\(skillKey).env)"
}

func macPluginsLoadedSummary(loaded: Int, total: Int, language: OnboardingLanguage) -> String {
    if language == .id {
        return "\(loaded)/\(total) dimuat"
    }
    return "\(loaded)/\(total) loaded"
}

func macGlobalDiagnosticsSummary(count: Int, language: OnboardingLanguage) -> String {
    if language == .id {
        return count == 1 ? "1 diagnostik global" : "\(count) diagnostik global"
    }
    return count == 1 ? "1 global diagnostic" : "\(count) global diagnostics"
}

func macVoiceWakeHeard(_ text: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Terdengar: \(text)"
    }
    return "Heard: \(text)"
}

func macVoiceWakeFailureText(_ reason: String, language: OnboardingLanguage) -> String {
    guard language == .id else { return reason }
    if let heard = reason.stripPrefix("Heard: ") {
        return macVoiceWakeHeard(heard, language: language)
    }
    if let command = reason.stripPrefix("No trigger heard: “")?.stripSuffix("”") {
        return "Tidak ada pemicu yang terdengar: “\(command)”"
    }
    return macLocalized(reason, language: language)
}

func macVoiceWakeLocaleLabel(_ name: String, isSystem: Bool, language: OnboardingLanguage) -> String {
    guard isSystem else { return name }
    if language == .id {
        return "\(name) (Sistem)"
    }
    return "\(name) (System)"
}

func macDiscoveryStatus(_ status: String, language: OnboardingLanguage) -> String {
    guard language == .id else { return status }
    if status == "Searching..." || status == "Searching…" {
        return "Mencari…"
    }
    if let count = Int(status.stripPrefix("Found ") ?? "") {
        return "Ditemukan \(count)"
    }
    return macLocalized(status, language: language)
}

func macDeepLinkMessageTooLong(max: Int, actual: Int, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Pesan terlalu panjang untuk dikonfirmasi dengan aman (\(actual) karakter; maks \(max) tanpa key)."
    }
    return "Message is too long to confirm safely (\(actual) chars; max \(max) without key)."
}

func macDeepLinkRunBody(messagePreview: String, urlPreview: String, language: OnboardingLanguage) -> String {
    if language == .id {
        return "Jalankan agen dengan pesan ini?\n\n\(messagePreview)\n\nURL:\n\(urlPreview)"
    }
    return "Run the agent with this message?\n\n\(messagePreview)\n\nURL:\n\(urlPreview)"
}

private extension String {
    func stripPrefix(_ prefix: String) -> String? {
        guard self.hasPrefix(prefix) else { return nil }
        return String(self.dropFirst(prefix.count))
    }

    func stripSuffix(_ suffix: String) -> String? {
        guard self.hasSuffix(suffix) else { return nil }
        return String(self.dropLast(suffix.count))
    }
}

private func macLocalizedIndonesian(_ english: String) -> String {
    if let exact = indonesianMacStrings[english] {
        return exact
    }

    if let payload = macLocalizedTypedErrorPayload(english) {
        return macLocalizedIndonesian(payload)
    }

    if english.contains("\n") {
        return english
            .components(separatedBy: "\n")
            .map(macLocalizedIndonesian)
            .joined(separator: "\n")
    }

    if let provider = english.stripPrefix("How do you want to connect ")?.stripSuffix("?") {
        return "Bagaimana Anda ingin menghubungkan \(macLocalizedIndonesian(provider))?"
    }

    if let provider = english.stripPrefix("Before you choose ") {
        return "Sebelum memilih \(macLocalizedIndonesian(provider))"
    }

    if let detail = english.stripPrefix("Best for: ") {
        return "Cocok untuk: \(macLocalizedIndonesian(detail))"
    }

    if let detail = english.stripPrefix("What you need: ") {
        return "Yang Anda butuhkan: \(macLocalizedIndonesian(detail))"
    }

    if let detail = english.stripPrefix("How to get it: ") {
        return "Cara mendapatkannya: \(macLocalizedIndonesian(detail))"
    }

    if let detail = english.stripPrefix("Quality / caveat: ") {
        return "Kualitas / catatan: \(macLocalizedIndonesian(detail))"
    }

    if let url = english.stripPrefix("Official: ") {
        return "Resmi: \(url)"
    }

    if let url = english.stripPrefix("Docs: ") {
        return "Dokumentasi: \(url)"
    }

    if let model = english.stripPrefix("Default model set to ") {
        return "Model default diatur ke \(model)"
    }

    if let model = english.stripPrefix("Default model available: ")?
        .stripSuffix(" (use --set-default to apply)")
    {
        return "Model default tersedia: \(model) (gunakan --set-default untuk menerapkan)"
    }

    if let envVar = english.stripPrefix("Environment variable \"")?
        .stripSuffix("\" is missing or empty.")
    {
        return "Variabel lingkungan \"\(envVar)\" tidak ada atau kosong."
    }

    if let detail = english.stripPrefix("Config was written to "),
       let separator = detail.range(of: ", but runtime snapshot refresh failed: ")
    {
        let path = String(detail[..<separator.lowerBound])
        let reason = String(detail[separator.upperBound...])
        return "Konfigurasi ditulis ke \(path), tetapi refresh snapshot runtime gagal: \(macLocalizedIndonesian(reason))"
    }

    if let provider = english.stripSuffix(" API key") {
        return "API key \(provider)"
    }

    return english
}

private func macLocalizedTypedErrorPayload(_ english: String) -> String? {
    if let payload = english.stripPrefix("ConfigRuntimeRefreshError: ") {
        return payload
    }

    guard let separator = english.range(of: ": ") else { return nil }
    let prefix = String(english[..<separator.lowerBound])
    guard prefix.hasSuffix("Error"), !prefix.contains(" ") else { return nil }
    return String(english[separator.upperBound...])
}
