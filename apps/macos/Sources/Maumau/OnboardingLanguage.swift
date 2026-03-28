import Foundation

enum OnboardingLanguage: String, CaseIterable, Codable, Sendable {
    case en
    case id

    static let fallback: Self = .en

    static func loadSelection(from rawValue: String?) -> Self? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        return Self(rawValue: trimmed)
    }

    var displayName: String {
        switch self {
        case .en:
            "English"
        case .id:
            "Bahasa Indonesia"
        }
    }

    var nativeName: String {
        switch self {
        case .en:
            "English"
        case .id:
            "Bahasa Indonesia"
        }
    }

    var replyLanguageID: String {
        self.rawValue
    }
}

struct OnboardingStrings: Sendable {
    let language: OnboardingLanguage

    var windowTitle: String {
        switch self.language {
        case .en:
            "Welcome to Maumau"
        case .id:
            "Selamat datang di Maumau"
        }
    }

    var nextButtonTitle: String {
        switch self.language {
        case .en:
            "Next"
        case .id:
            "Lanjut"
        }
    }

    var finishButtonTitle: String {
        switch self.language {
        case .en:
            "Finish"
        case .id:
            "Selesai"
        }
    }

    var backButtonTitle: String {
        switch self.language {
        case .en:
            "Back"
        case .id:
            "Kembali"
        }
    }

    var previousStepButtonTitle: String {
        switch self.language {
        case .en:
            "Previous step"
        case .id:
            "Langkah sebelumnya"
        }
    }

    var backToWorkspaceButtonTitle: String {
        switch self.language {
        case .en:
            "Back to workspace"
        case .id:
            "Kembali ke workspace"
        }
    }

    var setUpLaterButtonTitle: String {
        switch self.language {
        case .en:
            "Set up later"
        case .id:
            "Atur nanti"
        }
    }

    var languagePageTitle: String {
        switch self.language {
        case .en:
            "Choose your language"
        case .id:
            "Pilih bahasa Anda"
        }
    }

    var languagePageSubtitle: String {
        switch self.language {
        case .en:
            "Choose the language Maumau should use during onboarding and chat replies. Internal prompts and skills stay in English."
        case .id:
            "Pilih bahasa yang harus digunakan Maumau selama onboarding dan balasan chat. Prompt internal dan skill tetap menggunakan bahasa Inggris."
        }
    }

    var languagePageFootnote: String {
        switch self.language {
        case .en:
            "You can change this during onboarding by going back to this step."
        case .id:
            "Anda bisa mengubahnya selama onboarding dengan kembali ke langkah ini."
        }
    }

    func welcomeIntro(mode: AppState.ConnectionMode) -> String {
        switch (self.language, mode) {
        case (.en, .remote):
            "Setup is simpler than it looks: set up the Gateway, then pick a Channel for messages."
        case (.en, _):
            "Setup is simpler than it looks: set up the Gateway, choose the brain, pick a Channel, then review Mac access and the included tools."
        case (.id, .remote):
            "Pengaturannya lebih sederhana dari yang terlihat: siapkan Gateway, lalu pilih Channel untuk pesan."
        case (.id, _):
            "Pengaturannya lebih sederhana dari yang terlihat: siapkan Gateway, pilih brain, pilih Channel, lalu tinjau akses Mac dan tool bawaan."
        }
    }

    var nextStepsMeaningTitle: String {
        switch self.language {
        case .en:
            "Here’s what the next steps mean"
        case .id:
            "Arti langkah-langkah berikutnya"
        }
    }

    var setupLegend: String {
        switch self.language {
        case .en:
            "Required steps are marked Required. Optional steps can be done later. Needs prep means you may need another app, account, or device ready for that step."
        case .id:
            "Langkah wajib ditandai Required. Langkah Optional bisa dilakukan nanti. Needs prep berarti Anda mungkin perlu aplikasi, akun, atau perangkat lain yang siap untuk langkah itu."
        }
    }

    var securityNoticeTitle: String {
        switch self.language {
        case .en:
            "Security notice"
        case .id:
            "Catatan keamanan"
        }
    }

    var securityNoticeBody: String {
        switch self.language {
        case .en:
            "Maumau can do real things on your Mac if you turn them on, like run commands, read or change files, and take screenshots.\n\nOnly continue if that makes sense to you and you trust the AI and tools you connect."
        case .id:
            "Maumau bisa melakukan hal nyata di Mac Anda jika Anda menyalakannya, seperti menjalankan perintah, membaca atau mengubah file, dan mengambil tangkapan layar.\n\nLanjutkan hanya jika itu masuk akal bagi Anda dan Anda mempercayai AI serta tool yang Anda hubungkan."
        }
    }

    var connectionTitle: String {
        switch self.language {
        case .en:
            "Set up the Gateway"
        case .id:
            "Siapkan Gateway"
        }
    }

    var connectionIntro: String {
        switch self.language {
        case .en:
            "Gateway means Maumau's home. Most people choose This Mac, which means this computer keeps the tools and does the work here."
        case .id:
            "Gateway berarti rumah Maumau. Kebanyakan orang memilih This Mac, artinya komputer ini menyimpan tool dan mengerjakan tugasnya di sini."
        }
    }

    var preparingThisMacLabel: String {
        switch self.language {
        case .en:
            "Preparing this Mac…"
        case .id:
            "Menyiapkan Mac ini…"
        }
    }

    var checkingHelperToolsLabel: String {
        switch self.language {
        case .en:
            "Checking the helper tools this Mac needs…"
        case .id:
            "Memeriksa tool bantu yang dibutuhkan Mac ini…"
        }
    }

    var runtimeAlreadyAvailableHint: String {
        switch self.language {
        case .en:
            "If Node 22+ is already here, Maumau can keep going without reinstalling anything."
        case .id:
            "Jika Node 22+ sudah ada di sini, Maumau bisa lanjut tanpa memasang ulang apa pun."
        }
    }

    var localSetupRunningHint: String {
        switch self.language {
        case .en:
            "Maumau is getting this Mac ready before the next step."
        case .id:
            "Maumau sedang menyiapkan Mac ini sebelum langkah berikutnya."
        }
    }

    var retryLocalSetupButtonTitle: String {
        switch self.language {
        case .en:
            "Retry local setup"
        case .id:
            "Coba lagi pengaturan lokal"
        }
    }

    func localCliReadyLabel(location: String) -> String {
        switch self.language {
        case .en:
            "Local CLI ready at \(location)"
        case .id:
            "CLI lokal siap di \(location)"
        }
    }

    var localSetupReadyHint: String {
        switch self.language {
        case .en:
            "This Mac is ready. Continue to the brain setup."
        case .id:
            "Mac ini siap. Lanjutkan ke pengaturan brain."
        }
    }

    var nearbyGatewaysLabel: String {
        switch self.language {
        case .en:
            "Nearby gateways"
        case .id:
            "Gateway terdekat"
        }
    }

    var searchingNearbyGatewaysLabel: String {
        switch self.language {
        case .en:
            "Searching for nearby gateways…"
        case .id:
            "Mencari gateway terdekat…"
        }
    }

    var permissionsTitle: String {
        switch self.language {
        case .en:
            "Allow Mac access"
        case .id:
            "Izinkan akses Mac"
        }
    }

    var permissionsIntro: String {
        switch self.language {
        case .en:
            "These are the main Mac permissions Maumau uses when it helps with apps, windows, or screenshots. Turn on only the ones you want."
        case .id:
            "Ini adalah izin utama Mac yang digunakan Maumau saat membantu dengan aplikasi, jendela, atau tangkapan layar. Nyalakan hanya yang Anda inginkan."
        }
    }

    var refreshButtonTitle: String {
        switch self.language {
        case .en:
            "Refresh"
        case .id:
            "Segarkan"
        }
    }

    var openPermissionsSettingsButtonTitle: String {
        switch self.language {
        case .en:
            "Open full Permissions settings"
        case .id:
            "Buka pengaturan Izin lengkap"
        }
    }

    var optionalLaterTitle: String {
        switch self.language {
        case .en:
            "Optional later"
        case .id:
            "Opsional nanti"
        }
    }

    var optionalLaterBody: String {
        switch self.language {
        case .en:
            "Voice Wake, camera, and location stay out of the way here. If you want those later, you can turn them on in Settings."
        case .id:
            "Voice Wake, kamera, dan lokasi tidak mengganggu di sini. Jika nanti Anda menginginkannya, Anda bisa menyalakannya di Pengaturan."
        }
    }

    var wizardTitle: String {
        switch self.language {
        case .en:
            "Choose the brain"
        case .id:
            "Pilih brain"
        }
    }

    var wizardIntro: String {
        switch self.language {
        case .en:
            "Brain means the AI service Maumau uses for thinking and writing. Choose it once, sign in once, and Maumau will remember your default choice."
        case .id:
            "Brain berarti layanan AI yang digunakan Maumau untuk berpikir dan menulis. Pilih sekali, masuk sekali, dan Maumau akan mengingat pilihan default Anda."
        }
    }

    func localSetupPreparationTitle(isBusy: Bool) -> String {
        switch (self.language, isBusy) {
        case (.en, true):
            "Getting Maumau’s home ready before the brain step starts…"
        case (.en, false):
            "This Mac still needs a little setup first"
        case (.id, true):
            "Menyiapkan rumah Maumau sebelum langkah brain dimulai…"
        case (.id, false):
            "Mac ini masih perlu sedikit pengaturan dulu"
        }
    }

    func localSetupPreparationMessage(cliStatus: String?, installingCLI: Bool, isCheckingLocalGatewaySetup: Bool) -> String {
        if let cliStatus, !cliStatus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return cliStatus
        }
        switch (self.language, installingCLI, isCheckingLocalGatewaySetup) {
        case (_, true, _):
            return self.language == .en
                ? "Maumau is installing the helper pieces it needs on this Mac."
                : "Maumau sedang memasang bagian bantu yang dibutuhkannya di Mac ini."
        case (_, _, true):
            return self.language == .en
                ? "Maumau is checking whether this Mac already has what it needs."
                : "Maumau sedang memeriksa apakah Mac ini sudah memiliki yang dibutuhkannya."
        case (.en, false, false):
            return "Finish getting this Mac ready first. Once that is done, the brain setup continues automatically."
        case (.id, false, false):
            return "Selesaikan dulu persiapan Mac ini. Setelah itu, pengaturan brain akan lanjut otomatis."
        }
    }

    var wizardErrorTitle: String {
        switch self.language {
        case .en:
            "Wizard error"
        case .id:
            "Kesalahan wizard"
        }
    }

    var startingWizardTitle: String {
        switch self.language {
        case .en:
            "Starting wizard…"
        case .id:
            "Memulai wizard…"
        }
    }

    var wizardCompleteTitle: String {
        switch self.language {
        case .en:
            "Wizard complete. Continue to the next step."
        case .id:
            "Wizard selesai. Lanjut ke langkah berikutnya."
        }
    }

    var waitingForWizardTitle: String {
        switch self.language {
        case .en:
            "Waiting for wizard…"
        case .id:
            "Menunggu wizard…"
        }
    }

    var channelsTitle: String {
        switch self.language {
        case .en:
            "Pick a Channel"
        case .id:
            "Pilih Channel"
        }
    }

    var channelsIntro: String {
        switch self.language {
        case .en:
            "Channel means the app where people text Maumau. Think of it like giving Maumau a phone line or inbox. Pick one now, and you can add more later."
        case .id:
            "Channel berarti aplikasi tempat orang mengirim pesan ke Maumau. Anggap saja seperti memberi Maumau jalur telepon atau kotak masuk. Pilih satu sekarang, dan Anda bisa menambah yang lain nanti."
        }
    }

    var availableChatAppsTitle: String {
        switch self.language {
        case .en:
            "Available chat apps"
        case .id:
            "Aplikasi chat yang tersedia"
        }
    }

    var finishInSettingsTitle: String {
        switch self.language {
        case .en:
            "Finish in Settings"
        case .id:
            "Selesaikan di Pengaturan"
        }
    }

    var loadingChatAppsTitle: String {
        switch self.language {
        case .en:
            "Loading chat apps from the Gateway…"
        case .id:
            "Memuat aplikasi chat dari Gateway…"
        }
    }

    var loadingChatAppsHint: String {
        switch self.language {
        case .en:
            "If this stays empty, make sure the Gateway is running, then hit Refresh."
        case .id:
            "Jika ini tetap kosong, pastikan Gateway sedang berjalan, lalu tekan Segarkan."
        }
    }

    var privateAccessTitle: String {
        switch self.language {
        case .en:
            "Private access from your devices"
        case .id:
            "Akses privat dari perangkat Anda"
        }
    }

    var privateAccessIntro: String {
        switch self.language {
        case .en:
            "This gives Maumau's home a private driveway. It lets your phone, laptop, or browser reach Maumau privately without putting Maumau on the public internet."
        case .id:
            "Ini memberi rumah Maumau jalur privat. Dengan ini ponsel, laptop, atau browser Anda bisa menjangkau Maumau secara privat tanpa menaruh Maumau di internet publik."
        }
    }

    var privateAccessThisMacTitle: String {
        switch self.language {
        case .en:
            "This Mac, now"
        case .id:
            "Mac ini, sekarang"
        }
    }

    var privateAccessThisMacSubtitle: String {
        switch self.language {
        case .en:
            "Use Install on this Mac below. Maumau downloads the official Tailscale installer here, macOS asks for your administrator password, then you sign in here."
        case .id:
            "Gunakan Install on this Mac di bawah. Maumau akan mengunduh pemasang resmi Tailscale di sini, macOS akan meminta kata sandi administrator Anda, lalu Anda masuk di sini."
        }
    }

    var privateAccessOtherDevicesTitle: String {
        switch self.language {
        case .en:
            "Other devices, later"
        case .id:
            "Perangkat lain, nanti"
        }
    }

    var privateAccessOtherDevicesSubtitle: String {
        switch self.language {
        case .en:
            "When you want to open Maumau from your phone or another laptop, install Tailscale on that device later and sign in to the same private network there."
        case .id:
            "Saat Anda ingin membuka Maumau dari ponsel atau laptop lain, pasang Tailscale di perangkat itu nanti dan masuk ke jaringan privat yang sama di sana."
        }
    }

    var privateAccessDefaultPrivacyTitle: String {
        switch self.language {
        case .en:
            "Private by default"
        case .id:
            "Privat secara default"
        }
    }

    var privateAccessDefaultPrivacySubtitle: String {
        switch self.language {
        case .en:
            "Private mode keeps Maumau off the public internet. Only devices you add to the same private Tailscale network can open the private link."
        case .id:
            "Mode privat menjaga Maumau tetap di luar internet publik. Hanya perangkat yang Anda tambahkan ke jaringan privat Tailscale yang sama yang bisa membuka tautan privat itu."
        }
    }

    var privateAccessSafetyTitle: String {
        switch self.language {
        case .en:
            "How Maumau checks this safely"
        case .id:
            "Cara Maumau memeriksa ini dengan aman"
        }
    }

    var privateAccessSafetySubtitle: String {
        switch self.language {
        case .en:
            "In private mode, Maumau accepts only Tailscale's verified private-network identity for the dashboard and live connection. If you want an extra lock, require a Maumau password too."
        case .id:
            "Dalam mode privat, Maumau hanya menerima identitas jaringan privat Tailscale yang terverifikasi untuk dashboard dan koneksi langsung. Jika Anda ingin kunci tambahan, minta kata sandi Maumau juga."
        }
    }

    var privateAccessLaterTitle: String {
        switch self.language {
        case .en:
            "Come back to this later"
        case .id:
            "Kembali ke ini nanti"
        }
    }

    var privateAccessLaterSubtitle: String {
        switch self.language {
        case .en:
            "The same guide stays in Settings → General, so you can run the install here later, sign in later, or add password protection later if you skip this for now."
        case .id:
            "Panduan yang sama tetap ada di Pengaturan → Umum, jadi Anda bisa menjalankan instalasi nanti, masuk nanti, atau menambahkan perlindungan kata sandi nanti jika Anda melewati ini sekarang."
        }
    }

    var privateAccessLaterButtonTitle: String {
        switch self.language {
        case .en:
            "Open Settings → General"
        case .id:
            "Buka Pengaturan → Umum"
        }
    }

    var skillsTitle: String {
        switch self.language {
        case .en:
            "Review included tools"
        case .id:
            "Tinjau tool bawaan"
        }
    }

    var skillsIntro: String {
        switch self.language {
        case .en:
            "This is the short version of the core tools Maumau already comes with on this Mac. On first-time local setup, Maumau also installs nano-pdf, OpenAI Whisper, and summarize automatically when they are missing, while bundled setup guides like Clawd Cursor help you turn on extra capabilities later."
        case .id:
            "Ini adalah versi singkat dari tool inti yang sudah dimiliki Maumau di Mac ini. Pada pengaturan lokal pertama, Maumau juga memasang nano-pdf, OpenAI Whisper, dan summarize secara otomatis jika belum ada, sementara panduan bawaan seperti Clawd Cursor membantu Anda menyalakan kemampuan tambahan nanti."
        }
    }

    var dailyLifeHelpersTitle: String {
        switch self.language {
        case .en:
            "Daily-life helpers enabled by default"
        case .id:
            "Helper sehari-hari yang aktif secara default"
        }
    }

    var memoryTitle: String {
        switch self.language {
        case .en:
            "Long-term memory, when you want it"
        case .id:
            "Memori jangka panjang, saat Anda menginginkannya"
        }
    }

    var memorySubtitle: String {
        switch self.language {
        case .en:
            "Add a memory backend later if you want Maumau to retain preferences, facts, and past decisions across sessions instead of starting fresh each time."
        case .id:
            "Tambahkan backend memori nanti jika Anda ingin Maumau menyimpan preferensi, fakta, dan keputusan sebelumnya di berbagai sesi alih-alih mulai dari awal setiap kali."
        }
    }

    var openFullSkillsTitle: String {
        switch self.language {
        case .en:
            "Open the full Skills list"
        case .id:
            "Buka daftar Skills lengkap"
        }
    }

    var openFullSkillsSubtitle: String {
        switch self.language {
        case .en:
            "See everything that is available, including the bundled Clawd Cursor setup guide, Cursor-compatible bundles, and extra tools you can turn on or off later."
        case .id:
            "Lihat semua yang tersedia, termasuk panduan pengaturan Clawd Cursor bawaan, bundle yang kompatibel dengan Cursor, dan tool tambahan yang bisa Anda nyalakan atau matikan nanti."
        }
    }

    var openFullSkillsButtonTitle: String {
        switch self.language {
        case .en:
            "Open Settings → Skills"
        case .id:
            "Buka Pengaturan → Skill"
        }
    }

    var includedSkillsTitle: String {
        switch self.language {
        case .en:
            "Included skills on this Mac"
        case .id:
            "Skill bawaan di Mac ini"
        }
    }

    var checkingIncludedSkillsTitle: String {
        switch self.language {
        case .en:
            "Checking which included skills are available here…"
        case .id:
            "Memeriksa skill bawaan mana yang tersedia di sini…"
        }
    }

    var readyTitle: String {
        switch self.language {
        case .en:
            "All set"
        case .id:
            "Semua siap"
        }
    }

    var readyHeadline: String {
        switch self.language {
        case .en:
            "Maumau now has a home, a brain, and a place people can reach it."
        case .id:
            "Maumau sekarang punya rumah, brain, dan tempat agar orang bisa menjangkaunya."
        }
    }

    var readyBody: String {
        switch self.language {
        case .en:
            "You can keep things simple for now and fine-tune the rest later in Settings."
        case .id:
            "Anda bisa membuatnya tetap sederhana dulu dan menyempurnakan sisanya nanti di Pengaturan."
        }
    }

    var configureLaterTitle: String {
        switch self.language {
        case .en:
            "Configure later"
        case .id:
            "Atur nanti"
        }
    }

    var configureLaterSubtitle: String {
        switch self.language {
        case .en:
            "Pick Local or Remote in Settings → General whenever you’re ready."
        case .id:
            "Pilih Lokal atau Remote di Pengaturan → Umum kapan pun Anda siap."
        }
    }

    var menuBarPanelTitle: String {
        switch self.language {
        case .en:
            "Open the menu bar panel"
        case .id:
            "Buka panel menu bar"
        }
    }

    var menuBarPanelSubtitle: String {
        switch self.language {
        case .en:
            "Click the Maumau menu bar icon for quick chat and status."
        case .id:
            "Klik ikon menu bar Maumau untuk chat cepat dan status."
        }
    }

    var voiceWakeTitle: String {
        switch self.language {
        case .en:
            "Try Voice Wake"
        case .id:
            "Coba Voice Wake"
        }
    }

    var voiceWakeSubtitle: String {
        switch self.language {
        case .en:
            "Enable Voice Wake in Settings for hands-free commands with a live transcript overlay."
        case .id:
            "Aktifkan Voice Wake di Pengaturan untuk perintah hands-free dengan overlay transkrip langsung."
        }
    }

    var panelCanvasTitle: String {
        switch self.language {
        case .en:
            "Use the panel + Canvas"
        case .id:
            "Gunakan panel + Canvas"
        }
    }

    var panelCanvasSubtitle: String {
        switch self.language {
        case .en:
            "Open the menu bar panel for quick chat; the agent can show previews and richer visuals in Canvas."
        case .id:
            "Buka panel menu bar untuk chat cepat; agen bisa menampilkan pratinjau dan visual yang lebih kaya di Canvas."
        }
    }

    var launchAtLoginTitle: String {
        switch self.language {
        case .en:
            "Launch at login"
        case .id:
            "Jalankan saat login"
        }
    }

    func badgeTitle(_ badge: OnboardingStepBadge, compact: Bool = false) -> String {
        switch (self.language, badge, compact) {
        case (.en, .required, _):
            "Required"
        case (.en, .optional, _):
            "Optional"
        case (.en, .needsPrep, false):
            "Needs prep elsewhere"
        case (.en, .needsPrep, true):
            "Needs prep"
        case (.id, .required, _):
            "Wajib"
        case (.id, .optional, _):
            "Opsional"
        case (.id, .needsPrep, false):
            "Perlu persiapan di tempat lain"
        case (.id, .needsPrep, true):
            "Perlu persiapan"
        }
    }

    func stageTitle(_ stage: OnboardingHeaderStage) -> String {
        switch (self.language, stage) {
        case (.en, .home):
            "Gateway"
        case (.en, .brain):
            "Brain"
        case (.en, .chat):
            "Channel"
        case (.en, .access):
            "Private access"
        case (.en, .permissions):
            "Permissions"
        case (.en, .tools):
            "Tools"
        case (.id, .home):
            "Gateway"
        case (.id, .brain):
            "Brain"
        case (.id, .chat):
            "Channel"
        case (.id, .access):
            "Akses privat"
        case (.id, .permissions):
            "Izin"
        case (.id, .tools):
            "Tool"
        }
    }

    func stageHeaderSubtitle(_ stage: OnboardingHeaderStage) -> String {
        switch (self.language, stage) {
        case (.en, .home):
            "Maumau's home"
        case (.en, .brain):
            "AI service"
        case (.en, .chat):
            "Where people text it"
        case (.en, .access):
            "Private driveway"
        case (.en, .permissions):
            "What Maumau can do on this Mac"
        case (.en, .tools):
            "Included tools"
        case (.id, .home):
            "Rumah Maumau"
        case (.id, .brain):
            "Layanan AI"
        case (.id, .chat):
            "Tempat orang mengirim pesan"
        case (.id, .access):
            "Jalur privat"
        case (.id, .permissions):
            "Yang bisa dilakukan Maumau di Mac ini"
        case (.id, .tools):
            "Tool bawaan"
        }
    }

    func stageExplainerTitle(_ stage: OnboardingHeaderStage) -> String {
        switch (self.language, stage) {
        case (.en, .permissions):
            "Mac access"
        case (.id, .permissions):
            "Akses Mac"
        default:
            self.stageTitle(stage)
        }
    }

    func stageExplainerBody(_ stage: OnboardingHeaderStage) -> String {
        switch (self.language, stage) {
        case (.en, .home):
            "Gateway means Maumau's home. It keeps its tools here and does its work from here."
        case (.en, .brain):
            "Brain means the AI service. You are choosing what does the thinking and writing."
        case (.en, .chat):
            "Channel means where people can reach Maumau. Think of it like giving it a phone line or inbox."
        case (.en, .access):
            "This gives Maumau's home a private driveway. It lets your phone, laptop, or browser reach Maumau privately without putting it on the public internet."
        case (.en, .permissions):
            "This is where you decide what Maumau can do on this Mac, like work with apps or see the screen."
        case (.en, .tools):
            "This is a quick look at the main tools Maumau already has, so you know what comes with it."
        case (.id, .home):
            "Gateway berarti rumah Maumau. Di sinilah tool disimpan dan pekerjaannya dijalankan."
        case (.id, .brain):
            "Brain berarti layanan AI. Anda sedang memilih apa yang akan berpikir dan menulis."
        case (.id, .chat):
            "Channel berarti tempat orang bisa menghubungi Maumau. Anggap saja seperti memberinya jalur telepon atau kotak masuk."
        case (.id, .access):
            "Ini memberi rumah Maumau jalur privat. Dengan ini ponsel, laptop, atau browser Anda bisa menjangkau Maumau secara privat tanpa menaruhnya di internet publik."
        case (.id, .permissions):
            "Di sinilah Anda memutuskan apa yang boleh dilakukan Maumau di Mac ini, seperti bekerja dengan aplikasi atau melihat layar."
        case (.id, .tools):
            "Ini adalah ringkasan cepat tentang tool utama yang sudah dimiliki Maumau, supaya Anda tahu apa saja yang sudah tersedia."
        }
    }

    func includedToolHighlights() -> [OnboardingToolHighlight] {
        switch self.language {
        case .en:
            [
                OnboardingToolHighlight(
                    title: "Files and folders",
                    subtitle: "Read, organize, and change things on this Mac when you allow it.",
                    systemImage: "folder"),
                OnboardingToolHighlight(
                    title: "Apps and screen context",
                    subtitle: "Work with Mac apps and screenshots when the matching permissions are on.",
                    systemImage: "macwindow.on.rectangle"),
                OnboardingToolHighlight(
                    title: "Browser control",
                    subtitle: "Open websites, follow links, and work through everyday web tasks in a browser.",
                    systemImage: "globe"),
                OnboardingToolHighlight(
                    title: "Commands",
                    subtitle: "Run Terminal commands when you approve them or allow them.",
                    systemImage: "terminal"),
                OnboardingToolHighlight(
                    title: "Messages and connected services",
                    subtitle: "Reply in the Channel you picked and use any extra services you connect later.",
                    systemImage: "bubble.left.and.bubble.right"),
            ]
        case .id:
            [
                OnboardingToolHighlight(
                    title: "File dan folder",
                    subtitle: "Baca, rapikan, dan ubah hal-hal di Mac ini saat Anda mengizinkannya.",
                    systemImage: "folder"),
                OnboardingToolHighlight(
                    title: "Aplikasi dan konteks layar",
                    subtitle: "Bekerja dengan aplikasi Mac dan tangkapan layar saat izin yang sesuai dinyalakan.",
                    systemImage: "macwindow.on.rectangle"),
                OnboardingToolHighlight(
                    title: "Kontrol browser",
                    subtitle: "Buka situs web, ikuti tautan, dan kerjakan tugas web sehari-hari di browser.",
                    systemImage: "globe"),
                OnboardingToolHighlight(
                    title: "Perintah",
                    subtitle: "Jalankan perintah Terminal saat Anda menyetujuinya atau mengizinkannya.",
                    systemImage: "terminal"),
                OnboardingToolHighlight(
                    title: "Pesan dan layanan terhubung",
                    subtitle: "Balas di Channel yang Anda pilih dan gunakan layanan tambahan yang Anda hubungkan nanti.",
                    systemImage: "bubble.left.and.bubble.right"),
            ]
        }
    }

    func includedHelperHighlights() -> [OnboardingToolHighlight] {
        switch self.language {
        case .en:
            [
                OnboardingToolHighlight(
                    title: "Clawd Cursor",
                    subtitle: "Includes a bundled Skill that helps you set up the upstream clawdcursor helper for native desktop control across apps. The helper itself is installed separately.",
                    systemImage: "desktopcomputer"),
                OnboardingToolHighlight(
                    title: "Maumau Guardrails",
                    subtitle: "Keeps prompts, tool calls, and outgoing replies inside your policy once you connect a guardrails sidecar.",
                    systemImage: "checkmark.shield"),
                OnboardingToolHighlight(
                    title: "Lobster workflows",
                    subtitle: "Automates repeatable, multi-step tasks with resumable approvals instead of making the agent improvise every step.",
                    systemImage: "point.3.connected.trianglepath.dotted"),
                OnboardingToolHighlight(
                    title: "Structured AI tasks",
                    subtitle: "Uses LLM Task for clean JSON output, which helps with forms, extraction, handoffs, and workflow steps.",
                    systemImage: "curlybraces.square"),
            ]
        case .id:
            [
                OnboardingToolHighlight(
                    title: "Clawd Cursor",
                    subtitle: "Menyertakan Skill bawaan yang membantu Anda menyiapkan helper clawdcursor upstream untuk kontrol desktop native lintas aplikasi. Helper itu sendiri dipasang terpisah.",
                    systemImage: "desktopcomputer"),
                OnboardingToolHighlight(
                    title: "Maumau Guardrails",
                    subtitle: "Menjaga prompt, panggilan tool, dan balasan keluar tetap sesuai kebijakan Anda setelah Anda menghubungkan sidecar guardrails.",
                    systemImage: "checkmark.shield"),
                OnboardingToolHighlight(
                    title: "Workflow Lobster",
                    subtitle: "Mengotomatiskan tugas berulang dan multi-langkah dengan persetujuan yang bisa dilanjutkan, alih-alih membuat agen mengimprovisasi setiap langkah.",
                    systemImage: "point.3.connected.trianglepath.dotted"),
                OnboardingToolHighlight(
                    title: "Tugas AI terstruktur",
                    subtitle: "Menggunakan LLM Task untuk keluaran JSON yang rapi, yang membantu untuk formulir, ekstraksi, handoff, dan langkah workflow.",
                    systemImage: "curlybraces.square"),
            ]
        }
    }
}
