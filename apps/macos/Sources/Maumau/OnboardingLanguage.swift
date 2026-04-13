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

    var controlUILocaleID: String {
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
            "Setup is simpler than it looks: choose the brain, pick a Channel, then turn on any Mac access or extras you want."
        case (.id, .remote):
            "Pengaturannya lebih sederhana dari yang terlihat: siapkan Gateway, lalu pilih Channel untuk pesan."
        case (.id, _):
            "Pengaturannya lebih sederhana dari yang terlihat: pilih brain, pilih Channel, lalu nyalakan akses Mac atau tambahan apa pun yang Anda inginkan."
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

    var wizardSkippedTitle: String {
        switch self.language {
        case .en:
            "Brain setup skipped for now. You can finish it later in Settings."
        case .id:
            "Pengaturan brain dilewati dulu. Anda bisa menyelesaikannya nanti di Settings."
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

    var conversationAutomationTitle: String {
        switch self.language {
        case .en:
            "Voice calls"
        case .id:
            "Panggilan suara"
        }
    }

    var conversationAutomationIntro: String {
        switch self.language {
        case .en:
            "Choose the simple Vapi path or keep the advanced self-hosted path for real phone calls. Both options stay inside the built-in voice-call plugin."
        case .id:
            "Pilih jalur Vapi yang sederhana atau tetap gunakan jalur self-hosted lanjutan untuk panggilan telepon sungguhan. Keduanya tetap memakai plugin voice-call bawaan."
        }
    }

    var conversationAutomationTelephonyTitle: String {
        switch self.language {
        case .en:
            "Turn on phone calls"
        case .id:
            "Nyalakan panggilan telepon"
        }
    }

    var conversationAutomationTelephonySubtitle: String {
        switch self.language {
        case .en:
            "Maumau will only save voice-call settings when every required provider key and callback route is ready."
        case .id:
            "Maumau hanya akan menyimpan pengaturan voice call jika semua key provider dan rute callback yang dibutuhkan sudah siap."
        }
    }

    var conversationAutomationChecklistTitle: String {
        switch self.language {
        case .en:
            "What this step completes"
        case .id:
            "Yang diselesaikan langkah ini"
        }
    }

    var conversationAutomationChecklistSubtitle: String {
        switch self.language {
        case .en:
            "Simple with Vapi: Vapi API key, one assistant, one imported Twilio number, and Private Access ready. Advanced self-hosted: phone provider credentials, a public callback URL, realtime speech-to-text, and ElevenLabs."
        case .id:
            "Simple dengan Vapi: API key Vapi, satu assistant, satu nomor Twilio yang diimpor, dan Private Access yang siap. Self-hosted lanjutan: kredensial provider telepon, URL callback publik, speech-to-text realtime, dan ElevenLabs."
        }
    }

    var conversationAutomationModeTitle: String {
        switch self.language {
        case .en:
            "Setup mode"
        case .id:
            "Mode setup"
        }
    }

    var conversationAutomationModeSubtitle: String {
        switch self.language {
        case .en:
            "Simple with Vapi is the quick outbound calling path. Advanced self-hosted keeps the current direct-provider flow."
        case .id:
            "Simple dengan Vapi adalah jalur panggilan outbound yang paling cepat. Self-hosted lanjutan mempertahankan alur provider langsung yang sekarang."
        }
    }

    var conversationAutomationModeSimpleLabel: String {
        switch self.language {
        case .en:
            "Simple with Vapi"
        case .id:
            "Simple dengan Vapi"
        }
    }

    var conversationAutomationModeAdvancedLabel: String {
        switch self.language {
        case .en:
            "Advanced self-hosted"
        case .id:
            "Self-hosted lanjutan"
        }
    }

    var conversationAutomationVapiTitle: String {
        switch self.language {
        case .en:
            "Vapi setup"
        case .id:
            "Setup Vapi"
        }
    }

    var conversationAutomationVapiSubtitle: String {
        switch self.language {
        case .en:
            "Use Vapi for the live voice pipeline, import a Twilio number there, and let Maumau handle the conversation brain and memory."
        case .id:
            "Gunakan Vapi untuk pipeline voice langsung, impor nomor Twilio di sana, lalu biarkan Maumau menangani brain percakapan dan memori."
        }
    }

    var conversationAutomationVapiAPIKeyTitle: String {
        switch self.language {
        case .en:
            "Vapi API key"
        case .id:
            "API key Vapi"
        }
    }

    var conversationAutomationVapiAPIKeySubtitle: String {
        switch self.language {
        case .en:
            "Paste your Vapi private API key, then connect to load assistants and phone numbers from your Vapi account."
        case .id:
            "Tempel private API key Vapi Anda, lalu sambungkan untuk memuat assistant dan nomor telepon dari akun Vapi Anda."
        }
    }

    var conversationAutomationVapiAPIKeyPlaceholder: String {
        switch self.language {
        case .en:
            "vapi_..."
        case .id:
            "vapi_..."
        }
    }

    var conversationAutomationVapiRefreshButtonTitle: String {
        switch self.language {
        case .en:
            "Connect / Refresh"
        case .id:
            "Hubungkan / Segarkan"
        }
    }

    var conversationAutomationVapiRefreshingButtonTitle: String {
        switch self.language {
        case .en:
            "Refreshing…"
        case .id:
            "Menyegarkan…"
        }
    }

    var conversationAutomationOpenTwilioNumberGuideButtonTitle: String {
        switch self.language {
        case .en:
            "Buy or port in Twilio"
        case .id:
            "Beli atau port di Twilio"
        }
    }

    var conversationAutomationOpenVapiImportButtonTitle: String {
        switch self.language {
        case .en:
            "Import into Vapi"
        case .id:
            "Impor ke Vapi"
        }
    }

    var conversationAutomationOpenVapiAssistantsButtonTitle: String {
        switch self.language {
        case .en:
            "Open Vapi assistants"
        case .id:
            "Buka assistant Vapi"
        }
    }

    var conversationAutomationVapiAssistantTitle: String {
        switch self.language {
        case .en:
            "Assistant"
        case .id:
            "Assistant"
        }
    }

    var conversationAutomationVapiAssistantSubtitle: String {
        switch self.language {
        case .en:
            "Choose the Vapi assistant Maumau should use as the base for outbound calls."
        case .id:
            "Pilih assistant Vapi yang harus dipakai Maumau sebagai dasar untuk panggilan outbound."
        }
    }

    var conversationAutomationVapiAssistantEmptySubtitle: String {
        switch self.language {
        case .en:
            "Connect to Vapi first, then choose one assistant here."
        case .id:
            "Hubungkan ke Vapi dulu, lalu pilih satu assistant di sini."
        }
    }

    var conversationAutomationVapiPhoneNumberTitle: String {
        switch self.language {
        case .en:
            "Phone number"
        case .id:
            "Nomor telepon"
        }
    }

    var conversationAutomationVapiPhoneNumberSubtitle: String {
        switch self.language {
        case .en:
            "Choose the imported Twilio number Vapi should call from."
        case .id:
            "Pilih nomor Twilio yang diimpor dan harus dipakai Vapi untuk menelepon."
        }
    }

    var conversationAutomationVapiPhoneNumberEmptySubtitle: String {
        switch self.language {
        case .en:
            "Connect to Vapi after importing a Twilio number, then choose that number here."
        case .id:
            "Hubungkan ke Vapi setelah mengimpor nomor Twilio, lalu pilih nomor itu di sini."
        }
    }

    var conversationAutomationVapiPreferredLanguageTitle: String {
        switch self.language {
        case .en:
            "Preferred call language"
        case .id:
            "Bahasa panggilan pilihan"
        }
    }

    var conversationAutomationVapiPreferredLanguageSubtitle: String {
        switch self.language {
        case .en:
            "Default spoken replies to the language you want callers to hear first."
        case .id:
            "Jadikan bahasa ini sebagai default untuk balasan suara yang pertama kali didengar penelepon."
        }
    }

    var conversationAutomationVapiBridgeModeTitle: String {
        switch self.language {
        case .en:
            "Bridge mode"
        case .id:
            "Mode bridge"
        }
    }

    var conversationAutomationVapiBridgeModeSubtitle: String {
        switch self.language {
        case .en:
            "Auto bridge publishes a public callback for Vapi on a separate Tailscale Funnel port. Manual public URL lets you point Vapi at another public bridge."
        case .id:
            "Auto bridge memublikasikan callback publik untuk Vapi di port Tailscale Funnel terpisah. URL publik manual memungkinkan Anda mengarahkan Vapi ke bridge publik lain."
        }
    }

    var conversationAutomationVapiBridgeModeAutoLabel: String {
        switch self.language {
        case .en:
            "Auto bridge"
        case .id:
            "Auto bridge"
        }
    }

    var conversationAutomationVapiBridgeModeManualLabel: String {
        switch self.language {
        case .en:
            "Manual public URL"
        case .id:
            "URL publik manual"
        }
    }

    var conversationAutomationVapiBridgeTitle: String {
        switch self.language {
        case .en:
            "Maumau bridge URL"
        case .id:
            "URL bridge Maumau"
        }
    }

    func conversationAutomationVapiAutoBridgeSubtitle(bridgeURL: String) -> String {
        switch self.language {
        case .en:
            "Maumau will publish \(bridgeURL) through Tailscale Funnel so Vapi can reach the live tool-calls bridge without changing your normal private-access path."
        case .id:
            "Maumau akan memublikasikan \(bridgeURL) lewat Tailscale Funnel agar Vapi bisa mencapai bridge tool-calls langsung tanpa mengubah jalur private access normal Anda."
        }
    }

    var conversationAutomationVapiAutoBridgeWaitingSubtitle: String {
        switch self.language {
        case .en:
            "Auto bridge uses Tailscale Funnel on public port 8443. Finish Private Access first so Maumau can publish that bridge URL."
        case .id:
            "Auto bridge memakai Tailscale Funnel di port publik 8443. Selesaikan Private Access dulu agar Maumau bisa memublikasikan URL bridge itu."
        }
    }

    func conversationAutomationVapiBridgeSubtitle(bridgeURL: String) -> String {
        switch self.language {
        case .en:
            "Vapi will call \(bridgeURL) so Maumau can generate each spoken reply with tools and memory."
        case .id:
            "Vapi akan memanggil \(bridgeURL) agar Maumau bisa menghasilkan setiap balasan suara dengan tools dan memori."
        }
    }

    var conversationAutomationVapiBridgeWaitingSubtitle: String {
        switch self.language {
        case .en:
            "Finish Private Access first so Maumau has a public bridge URL for Vapi."
        case .id:
            "Selesaikan Private Access dulu agar Maumau punya URL bridge publik untuk Vapi."
        }
    }

    var conversationAutomationVapiManualBridgeTitle: String {
        switch self.language {
        case .en:
            "Manual bridge URL"
        case .id:
            "URL bridge manual"
        }
    }

    var conversationAutomationVapiManualBridgeSubtitle: String {
        switch self.language {
        case .en:
            "Paste a public HTTPS URL if you want Vapi to call Maumau through another bridge instead of the auto-managed Tailscale path."
        case .id:
            "Tempel URL HTTPS publik jika Anda ingin Vapi memanggil Maumau lewat bridge lain, bukan lewat jalur Tailscale yang dikelola otomatis."
        }
    }

    var conversationAutomationVapiManualBridgePlaceholder: String {
        switch self.language {
        case .en:
            "https://your.domain/plugins/voice-call/vapi"
        case .id:
            "https://domain-anda/plugins/voice-call/vapi"
        }
    }

    var conversationAutomationVapiOutboundOnlyTitle: String {
        switch self.language {
        case .en:
            "Outbound-first in this version"
        case .id:
            "Versi ini fokus outbound"
        }
    }

    var conversationAutomationVapiOutboundOnlySubtitle: String {
        switch self.language {
        case .en:
            "This simple path is for outbound calls first. Inbound routing and manual live call controls stay in Advanced self-hosted."
        case .id:
            "Jalur sederhana ini fokus untuk panggilan outbound dulu. Routing inbound dan kontrol live call manual tetap ada di Self-hosted lanjutan."
        }
    }

    var conversationAutomationVapiIndonesiaNoticeTitle: String {
        switch self.language {
        case .en:
            "Indonesia number availability"
        case .id:
            "Ketersediaan nomor Indonesia"
        }
    }

    var conversationAutomationVapiIndonesiaNoticeSubtitle: String {
        switch self.language {
        case .en:
            "Indonesia numbers depend on Twilio inventory and regulation. If +62 is not available right now, buy or port in Twilio first, then import that number into Vapi."
        case .id:
            "Nomor Indonesia bergantung pada inventaris dan regulasi Twilio. Jika +62 belum tersedia sekarang, beli atau port dulu di Twilio, lalu impor nomor itu ke Vapi."
        }
    }

    func conversationAutomationVapiSavedSelectionLabel(id: String) -> String {
        switch self.language {
        case .en:
            "Saved selection (\(id))"
        case .id:
            "Pilihan tersimpan (\(id))"
        }
    }

    func conversationAutomationVapiRefreshReady(assistantCount: Int, phoneNumberCount: Int) -> String {
        switch self.language {
        case .en:
            "Connected to Vapi. Found \(assistantCount) assistant(s) and \(phoneNumberCount) phone number(s)."
        case .id:
            "Berhasil terhubung ke Vapi. Ditemukan \(assistantCount) assistant dan \(phoneNumberCount) nomor telepon."
        }
    }

    func conversationAutomationVapiRefreshFailed(detail: String) -> String {
        switch self.language {
        case .en:
            "Could not load your Vapi assistants or phone numbers. \(detail)"
        case .id:
            "Tidak bisa memuat assistant atau nomor telepon Vapi Anda. \(detail)"
        }
    }

    var conversationAutomationPhoneProviderTitle: String {
        switch self.language {
        case .en:
            "1. Phone provider"
        case .id:
            "1. Provider telepon"
        }
    }

    var conversationAutomationPhoneProviderSubtitle: String {
        switch self.language {
        case .en:
            "Choose the built-in phone provider Maumau should use for live calls, then add that provider's number and credentials below."
        case .id:
            "Pilih provider telepon bawaan yang harus dipakai Maumau untuk panggilan langsung, lalu tambahkan nomor dan kredensial provider itu di bawah."
        }
    }

    var conversationAutomationPhoneProviderTwilioLabel: String {
        switch self.language {
        case .en:
            "Twilio"
        case .id:
            "Twilio"
        }
    }

    var conversationAutomationPhoneProviderTelnyxLabel: String {
        switch self.language {
        case .en:
            "Telnyx"
        case .id:
            "Telnyx"
        }
    }

    var conversationAutomationPhoneProviderPlivoLabel: String {
        switch self.language {
        case .en:
            "Plivo"
        case .id:
            "Plivo"
        }
    }

    var conversationAutomationPhoneNumberTitle: String {
        switch self.language {
        case .en:
            "Phone number"
        case .id:
            "Nomor telepon"
        }
    }

    var conversationAutomationPhoneNumberSubtitle: String {
        switch self.language {
        case .en:
            "Paste the E.164 number Maumau should call from, like +628123456789."
        case .id:
            "Tempel nomor E.164 yang harus dipakai Maumau untuk menelepon, misalnya +628123456789."
        }
    }

    var conversationAutomationPhoneNumberPlaceholder: String {
        switch self.language {
        case .en:
            "+628123456789"
        case .id:
            "+628123456789"
        }
    }

    var conversationAutomationTwilioSectionTitle: String {
        switch self.language {
        case .en:
            "Twilio setup"
        case .id:
            "Setup Twilio"
        }
    }

    var conversationAutomationTwilioSectionSubtitle: String {
        switch self.language {
        case .en:
            "Use the Twilio Console to get a voice-capable number and copy the account credentials Maumau needs for calls."
        case .id:
            "Gunakan Twilio Console untuk mendapatkan nomor yang mendukung voice dan salin kredensial akun yang dibutuhkan Maumau untuk panggilan."
        }
    }

    var conversationAutomationTwilioAccountSIDTitle: String {
        switch self.language {
        case .en:
            "Twilio Account SID"
        case .id:
            "Twilio Account SID"
        }
    }

    var conversationAutomationTwilioAccountSIDSubtitle: String {
        switch self.language {
        case .en:
            "Copy the Account SID from your Twilio Console project."
        case .id:
            "Salin Account SID dari project Twilio Console Anda."
        }
    }

    var conversationAutomationTwilioAccountSIDPlaceholder: String {
        switch self.language {
        case .en:
            "AC..."
        case .id:
            "AC..."
        }
    }

    var conversationAutomationTwilioAuthTokenTitle: String {
        switch self.language {
        case .en:
            "Twilio Auth Token"
        case .id:
            "Twilio Auth Token"
        }
    }

    var conversationAutomationTwilioAuthTokenSubtitle: String {
        switch self.language {
        case .en:
            "Reveal or create the Auth Token in Twilio Console, then paste it here."
        case .id:
            "Tampilkan atau buat Auth Token di Twilio Console, lalu tempel di sini."
        }
    }

    var conversationAutomationTwilioAuthTokenPlaceholder: String {
        switch self.language {
        case .en:
            "Twilio auth token"
        case .id:
            "Auth token Twilio"
        }
    }

    var conversationAutomationOpenPortalButtonTitle: String {
        switch self.language {
        case .en:
            "Open portal"
        case .id:
            "Buka portal"
        }
    }

    var conversationAutomationOpenGuideButtonTitle: String {
        switch self.language {
        case .en:
            "Open guide"
        case .id:
            "Buka panduan"
        }
    }

    var conversationAutomationOpenConsoleButtonTitle: String {
        switch self.language {
        case .en:
            "Open console"
        case .id:
            "Buka console"
        }
    }

    var conversationAutomationOpenAPIKeysButtonTitle: String {
        switch self.language {
        case .en:
            "Open API keys"
        case .id:
            "Buka API keys"
        }
    }

    var conversationAutomationOpenVoiceLibraryButtonTitle: String {
        switch self.language {
        case .en:
            "Open voice library"
        case .id:
            "Buka voice library"
        }
    }

    var conversationAutomationCopyURLButtonTitle: String {
        switch self.language {
        case .en:
            "Copy URL"
        case .id:
            "Salin URL"
        }
    }

    var conversationAutomationGoToPrivateAccessButtonTitle: String {
        switch self.language {
        case .en:
            "Go to Private access"
        case .id:
            "Buka Akses privat"
        }
    }

    var conversationAutomationOpenAdminButtonTitle: String {
        switch self.language {
        case .en:
            "Open admin page"
        case .id:
            "Buka halaman admin"
        }
    }

    var conversationAutomationTelnyxSectionTitle: String {
        switch self.language {
        case .en:
            "Telnyx setup"
        case .id:
            "Setup Telnyx"
        }
    }

    var conversationAutomationTelnyxSectionSubtitle: String {
        switch self.language {
        case .en:
            "Use Telnyx Mission Control to get a voice-capable number, create an API key, and open the Call Control connection or application you want Maumau to use."
        case .id:
            "Gunakan Telnyx Mission Control untuk mendapatkan nomor yang mendukung voice, membuat API key, dan membuka connection atau application Call Control yang ingin dipakai Maumau."
        }
    }

    var conversationAutomationPlivoSectionTitle: String {
        switch self.language {
        case .en:
            "Plivo setup"
        case .id:
            "Setup Plivo"
        }
    }

    var conversationAutomationPlivoSectionSubtitle: String {
        switch self.language {
        case .en:
            "Use the Plivo Console to buy or assign a voice-capable number, then copy the auth credentials Maumau needs."
        case .id:
            "Gunakan Plivo Console untuk membeli atau menetapkan nomor yang mendukung voice, lalu salin kredensial auth yang dibutuhkan Maumau."
        }
    }

    var conversationAutomationPlivoAuthIDTitle: String {
        switch self.language {
        case .en:
            "Plivo Auth ID"
        case .id:
            "Plivo Auth ID"
        }
    }

    var conversationAutomationPlivoAuthIDSubtitle: String {
        switch self.language {
        case .en:
            "Copy the Auth ID from your Plivo Console account."
        case .id:
            "Salin Auth ID dari akun Plivo Console Anda."
        }
    }

    var conversationAutomationPlivoAuthIDPlaceholder: String {
        switch self.language {
        case .en:
            "MA..."
        case .id:
            "MA..."
        }
    }

    var conversationAutomationPlivoAuthTokenTitle: String {
        switch self.language {
        case .en:
            "Plivo Auth Token"
        case .id:
            "Plivo Auth Token"
        }
    }

    var conversationAutomationPlivoAuthTokenSubtitle: String {
        switch self.language {
        case .en:
            "Copy the Auth Token from your Plivo Console account."
        case .id:
            "Salin Auth Token dari akun Plivo Console Anda."
        }
    }

    var conversationAutomationPlivoAuthTokenPlaceholder: String {
        switch self.language {
        case .en:
            "Plivo auth token"
        case .id:
            "Auth token Plivo"
        }
    }

    var conversationAutomationTelnyxAPIKeyTitle: String {
        switch self.language {
        case .en:
            "Telnyx API key"
        case .id:
            "API key Telnyx"
        }
    }

    var conversationAutomationTelnyxAPIKeySubtitle: String {
        switch self.language {
        case .en:
            "Create a Telnyx API v2 key and paste it here."
        case .id:
            "Buat API key Telnyx v2 lalu tempel di sini."
        }
    }

    var conversationAutomationTelnyxAPIKeyPlaceholder: String {
        switch self.language {
        case .en:
            "KEY..."
        case .id:
            "KEY..."
        }
    }

    var conversationAutomationTelnyxConnectionIDTitle: String {
        switch self.language {
        case .en:
            "Call Control connection ID"
        case .id:
            "Connection ID Call Control"
        }
    }

    var conversationAutomationTelnyxConnectionIDSubtitle: String {
        switch self.language {
        case .en:
            "Paste the connection or application ID from the Telnyx Call Control setup."
        case .id:
            "Tempel connection atau application ID dari setup Telnyx Call Control."
        }
    }

    var conversationAutomationTelnyxConnectionIDPlaceholder: String {
        switch self.language {
        case .en:
            "CONNxxxx"
        case .id:
            "CONNxxxx"
        }
    }

    var conversationAutomationTelnyxPublicKeyTitle: String {
        switch self.language {
        case .en:
            "Telnyx public key"
        case .id:
            "Public key Telnyx"
        }
    }

    var conversationAutomationTelnyxPublicKeySubtitle: String {
        switch self.language {
        case .en:
            "Maumau uses this to verify signed Telnyx webhooks."
        case .id:
            "Maumau memakai ini untuk memverifikasi webhook Telnyx yang ditandatangani."
        }
    }

    var conversationAutomationTelnyxPublicKeyPlaceholder: String {
        switch self.language {
        case .en:
            "Paste the public key from Telnyx"
        case .id:
            "Tempel public key dari Telnyx"
        }
    }

    var conversationAutomationWebhookTitle: String {
        switch self.language {
        case .en:
            "2. Callback URL"
        case .id:
            "2. URL callback"
        }
    }

    var conversationAutomationWebhookSubtitle: String {
        switch self.language {
        case .en:
            "Your chosen phone provider must be able to reach Maumau over HTTPS during live calls. Pick the public route Maumau should use."
        case .id:
            "Provider telepon yang Anda pilih harus bisa menjangkau Maumau lewat HTTPS saat panggilan berlangsung. Pilih rute publik yang harus dipakai Maumau."
        }
    }

    var conversationAutomationWebhookTailscaleLabel: String {
        switch self.language {
        case .en:
            "Automatic with Tailscale Funnel"
        case .id:
            "Otomatis dengan Tailscale Funnel"
        }
    }

    var conversationAutomationWebhookManualLabel: String {
        switch self.language {
        case .en:
            "I already have a public webhook URL"
        case .id:
            "Saya sudah punya URL webhook publik"
        }
    }

    func conversationAutomationWebhookTailscaleSubtitle(expectedURL: String?) -> String {
        switch self.language {
        case .en:
            if let expectedURL, !expectedURL.isEmpty {
                return "Maumau will publish \(expectedURL) and you should use that same URL in your phone provider's webhook setting."
            }
            return "Maumau will publish /voice/webhook over Tailscale Funnel and you should use that same URL in your phone provider's webhook setting."
        case .id:
            if let expectedURL, !expectedURL.isEmpty {
                return "Maumau akan memublikasikan \(expectedURL) dan URL yang sama itu harus dipakai di pengaturan webhook provider telepon Anda."
            }
            return "Maumau akan memublikasikan /voice/webhook lewat Tailscale Funnel dan URL yang sama itu harus dipakai di pengaturan webhook provider telepon Anda."
        }
    }

    var conversationAutomationWebhookPublicURLTitle: String {
        switch self.language {
        case .en:
            "Public webhook URL"
        case .id:
            "URL webhook publik"
        }
    }

    var conversationAutomationWebhookPublicURLSubtitle: String {
        switch self.language {
        case .en:
            "Paste the exact HTTPS webhook URL that your phone provider should call, for example https://your.domain/voice/webhook."
        case .id:
            "Tempel URL webhook HTTPS persis yang harus dipanggil provider telepon Anda, misalnya https://your.domain/voice/webhook."
        }
    }

    var conversationAutomationWebhookPublicURLPlaceholder: String {
        switch self.language {
        case .en:
            "https://your.domain/voice/webhook"
        case .id:
            "https://domain-anda/voice/webhook"
        }
    }

    var conversationAutomationWebhookPrivateAccessSubtitle: String {
        switch self.language {
        case .en:
            "Tailscale is not ready on this Mac yet. Finish that setup first, then come back here."
        case .id:
            "Tailscale belum siap di Mac ini. Selesaikan setup itu dulu, lalu kembali ke sini."
        }
    }

    var conversationAutomationWebhookAdminSubtitle: String {
        switch self.language {
        case .en:
            "Your tailnet still has Funnel disabled. Open the admin page to enable it, or switch to a manual public webhook URL instead."
        case .id:
            "Tailnet Anda masih menonaktifkan Funnel. Buka halaman admin untuk mengaktifkannya, atau ganti ke URL webhook publik manual."
        }
    }

    var conversationAutomationSttTitle: String {
        switch self.language {
        case .en:
            "3. Realtime speech-to-text"
        case .id:
            "3. Speech-to-text realtime"
        }
    }

    var conversationAutomationSttSubtitle: String {
        switch self.language {
        case .en:
            "Choose the engine Maumau should use while a phone call is live. Both options need their own API key."
        case .id:
            "Pilih engine yang harus dipakai Maumau saat panggilan telepon sedang berlangsung. Keduanya butuh API key masing-masing."
        }
    }

    var conversationAutomationSttDeepgramLabel: String {
        switch self.language {
        case .en:
            "Deepgram Nova-3"
        case .id:
            "Deepgram Nova-3"
        }
    }

    var conversationAutomationSttOpenAILabel: String {
        switch self.language {
        case .en:
            "OpenAI Realtime"
        case .id:
            "OpenAI Realtime"
        }
    }

    var conversationAutomationDeepgramAPIKeyTitle: String {
        switch self.language {
        case .en:
            "Deepgram API key"
        case .id:
            "API key Deepgram"
        }
    }

    var conversationAutomationDeepgramAPIKeySubtitle: String {
        switch self.language {
        case .en:
            "Open the Deepgram console, create or copy a project API key, then paste it here."
        case .id:
            "Buka console Deepgram, buat atau salin project API key, lalu tempel di sini."
        }
    }

    var conversationAutomationDeepgramAPIKeyPlaceholder: String {
        switch self.language {
        case .en:
            "dg..."
        case .id:
            "dg..."
        }
    }

    var conversationAutomationOpenAIAPIKeyTitle: String {
        switch self.language {
        case .en:
            "OpenAI API key"
        case .id:
            "API key OpenAI"
        }
    }

    var conversationAutomationOpenAIAPIKeySubtitle: String {
        switch self.language {
        case .en:
            "Open the OpenAI API keys page, create a key for the Realtime API, then paste it here."
        case .id:
            "Buka halaman API keys OpenAI, buat key untuk Realtime API, lalu tempel di sini."
        }
    }

    var conversationAutomationOpenAIAPIKeyPlaceholder: String {
        switch self.language {
        case .en:
            "sk-..."
        case .id:
            "sk-..."
        }
    }

    var conversationAutomationTtsTitle: String {
        switch self.language {
        case .en:
            "4. Spoken replies"
        case .id:
            "4. Balasan suara"
        }
    }

    var conversationAutomationTtsSubtitle: String {
        switch self.language {
        case .en:
            "Maumau uses ElevenLabs with eleven_multilingual_v2 for call replies. Add the API key here, and optionally override the default voice."
        case .id:
            "Maumau memakai ElevenLabs dengan eleven_multilingual_v2 untuk balasan panggilan. Tambahkan API key di sini, dan opsional ganti voice default-nya."
        }
    }

    var conversationAutomationElevenLabsAPIKeyTitle: String {
        switch self.language {
        case .en:
            "ElevenLabs API key"
        case .id:
            "API key ElevenLabs"
        }
    }

    var conversationAutomationElevenLabsAPIKeySubtitle: String {
        switch self.language {
        case .en:
            "Open ElevenLabs API authentication docs or your workspace settings, then paste the key here."
        case .id:
            "Buka dokumentasi autentikasi API ElevenLabs atau pengaturan workspace Anda, lalu tempel key-nya di sini."
        }
    }

    var conversationAutomationElevenLabsAPIKeyPlaceholder: String {
        switch self.language {
        case .en:
            "xi-..."
        case .id:
            "xi-..."
        }
    }

    var conversationAutomationElevenLabsVoiceIDTitle: String {
        switch self.language {
        case .en:
            "Optional ElevenLabs voice ID"
        case .id:
            "Voice ID ElevenLabs opsional"
        }
    }

    var conversationAutomationElevenLabsVoiceIDSubtitle: String {
        switch self.language {
        case .en:
            "Leave this blank to use Maumau’s multilingual default voice, or paste a voice ID from the ElevenLabs voice library."
        case .id:
            "Biarkan kosong untuk memakai voice multilingual default Maumau, atau tempel voice ID dari ElevenLabs voice library."
        }
    }

    var conversationAutomationElevenLabsVoiceIDPlaceholder: String {
        switch self.language {
        case .en:
            "Optional voice ID"
        case .id:
            "Voice ID opsional"
        }
    }

    var conversationAutomationReadyTitle: String {
        switch self.language {
        case .en:
            "Ready to finish"
        case .id:
            "Siap diselesaikan"
        }
    }

    var conversationAutomationReadySubtitle: String {
        switch self.language {
        case .en:
            "This voice-call setup now has the required configuration for the mode you chose."
        case .id:
            "Setup voice call ini sekarang sudah memiliki konfigurasi yang dibutuhkan untuk mode yang Anda pilih."
        }
    }

    var conversationAutomationBeforeFinishTitle: String {
        switch self.language {
        case .en:
            "Finish is blocked until these are added"
        case .id:
            "Finish akan diblokir sampai ini ditambahkan"
        }
    }

    var conversationAutomationValidationFromNumberMissing: String {
        switch self.language {
        case .en:
            "Add the phone number Maumau should call from."
        case .id:
            "Tambahkan nomor telepon yang harus dipakai Maumau untuk menelepon."
        }
    }

    var conversationAutomationValidationFromNumberInvalid: String {
        switch self.language {
        case .en:
            "Use E.164 format for the phone number, for example +628123456789."
        case .id:
            "Gunakan format E.164 untuk nomor telepon, misalnya +628123456789."
        }
    }

    var conversationAutomationValidationTwilioAccountSIDMissing: String {
        switch self.language {
        case .en:
            "Add the Twilio Account SID."
        case .id:
            "Tambahkan Twilio Account SID."
        }
    }

    var conversationAutomationValidationTwilioAuthTokenMissing: String {
        switch self.language {
        case .en:
            "Add the Twilio Auth Token."
        case .id:
            "Tambahkan Twilio Auth Token."
        }
    }

    var conversationAutomationValidationVapiAPIKeyMissing: String {
        switch self.language {
        case .en:
            "Add the Vapi API key, then connect to load assistants and phone numbers."
        case .id:
            "Tambahkan API key Vapi, lalu hubungkan untuk memuat assistant dan nomor telepon."
        }
    }

    var conversationAutomationValidationVapiAssistantMissing: String {
        switch self.language {
        case .en:
            "Choose one Vapi assistant."
        case .id:
            "Pilih satu assistant Vapi."
        }
    }

    var conversationAutomationValidationVapiPhoneNumberMissing: String {
        switch self.language {
        case .en:
            "Choose one imported Twilio phone number from Vapi."
        case .id:
            "Pilih satu nomor telepon Twilio yang diimpor dari Vapi."
        }
    }

    var conversationAutomationValidationVapiBridgeMissing: String {
        switch self.language {
        case .en:
            "Finish Private Access first so Maumau has a public bridge URL for Vapi."
        case .id:
            "Selesaikan Private Access dulu agar Maumau punya URL bridge publik untuk Vapi."
        }
    }

    var conversationAutomationValidationTelnyxAPIKeyMissing: String {
        switch self.language {
        case .en:
            "Add the Telnyx API key."
        case .id:
            "Tambahkan API key Telnyx."
        }
    }

    var conversationAutomationValidationTelnyxConnectionIDMissing: String {
        switch self.language {
        case .en:
            "Add the Telnyx Call Control connection or application ID."
        case .id:
            "Tambahkan connection atau application ID Telnyx Call Control."
        }
    }

    var conversationAutomationValidationTelnyxPublicKeyMissing: String {
        switch self.language {
        case .en:
            "Add the Telnyx public key for webhook verification."
        case .id:
            "Tambahkan public key Telnyx untuk verifikasi webhook."
        }
    }

    var conversationAutomationValidationPlivoAuthIDMissing: String {
        switch self.language {
        case .en:
            "Add the Plivo Auth ID."
        case .id:
            "Tambahkan Plivo Auth ID."
        }
    }

    var conversationAutomationValidationPlivoAuthTokenMissing: String {
        switch self.language {
        case .en:
            "Add the Plivo Auth Token."
        case .id:
            "Tambahkan Plivo Auth Token."
        }
    }

    var conversationAutomationValidationTailscaleInstallMissing: String {
        switch self.language {
        case .en:
            "Install Tailscale on this Mac or switch to a manual public webhook URL."
        case .id:
            "Pasang Tailscale di Mac ini atau ganti ke URL webhook publik manual."
        }
    }

    var conversationAutomationValidationTailscaleInstallMissingForVapi: String {
        switch self.language {
        case .en:
            "Install Tailscale on this Mac for Auto bridge, or switch the Vapi bridge to Manual public URL."
        case .id:
            "Pasang Tailscale di Mac ini untuk Auto bridge, atau ganti bridge Vapi ke URL publik manual."
        }
    }

    var conversationAutomationValidationTailscaleRunningMissing: String {
        switch self.language {
        case .en:
            "Sign in to Tailscale on this Mac or switch to a manual public webhook URL."
        case .id:
            "Masuk ke Tailscale di Mac ini atau ganti ke URL webhook publik manual."
        }
    }

    var conversationAutomationValidationTailscaleRunningMissingForVapi: String {
        switch self.language {
        case .en:
            "Sign in to Tailscale on this Mac for Auto bridge, or switch the Vapi bridge to Manual public URL."
        case .id:
            "Masuk ke Tailscale di Mac ini untuk Auto bridge, atau ganti bridge Vapi ke URL publik manual."
        }
    }

    var conversationAutomationValidationTailscaleFunnelMissing: String {
        switch self.language {
        case .en:
            "Enable Tailscale Funnel for this tailnet or switch to a manual public webhook URL."
        case .id:
            "Aktifkan Tailscale Funnel untuk tailnet ini atau ganti ke URL webhook publik manual."
        }
    }

    var conversationAutomationValidationTailscaleFunnelMissingForVapi: String {
        switch self.language {
        case .en:
            "Enable Tailscale Funnel for this tailnet for Auto bridge, or switch the Vapi bridge to Manual public URL."
        case .id:
            "Aktifkan Tailscale Funnel untuk tailnet ini untuk Auto bridge, atau ganti bridge Vapi ke URL publik manual."
        }
    }

    var conversationAutomationValidationVapiManualBridgeMissing: String {
        switch self.language {
        case .en:
            "Add the public HTTPS URL that Vapi should use for the Maumau bridge."
        case .id:
            "Tambahkan URL HTTPS publik yang harus dipakai Vapi untuk bridge Maumau."
        }
    }

    var conversationAutomationValidationVapiManualBridgeInvalid: String {
        switch self.language {
        case .en:
            "Use a valid HTTPS bridge URL, for example https://your.domain/plugins/voice-call/vapi."
        case .id:
            "Gunakan URL bridge HTTPS yang valid, misalnya https://domain-anda/plugins/voice-call/vapi."
        }
    }

    var conversationAutomationValidationPublicWebhookMissing: String {
        switch self.language {
        case .en:
            "Add the public HTTPS webhook URL that your phone provider should call."
        case .id:
            "Tambahkan URL webhook HTTPS publik yang harus dipanggil provider telepon Anda."
        }
    }

    var conversationAutomationValidationPublicWebhookInvalid: String {
        switch self.language {
        case .en:
            "Use a valid HTTPS webhook URL, for example https://your.domain/voice/webhook."
        case .id:
            "Gunakan URL webhook HTTPS yang valid, misalnya https://your.domain/voice/webhook."
        }
    }

    var conversationAutomationValidationDeepgramAPIKeyMissing: String {
        switch self.language {
        case .en:
            "Add the Deepgram API key or switch the speech engine to OpenAI Realtime."
        case .id:
            "Tambahkan API key Deepgram atau ganti engine speech ke OpenAI Realtime."
        }
    }

    var conversationAutomationValidationOpenAIAPIKeyMissing: String {
        switch self.language {
        case .en:
            "Add the OpenAI API key or switch the speech engine to Deepgram Nova-3."
        case .id:
            "Tambahkan API key OpenAI atau ganti engine speech ke Deepgram Nova-3."
        }
    }

    var conversationAutomationValidationElevenLabsAPIKeyMissing: String {
        switch self.language {
        case .en:
            "Add the ElevenLabs API key for spoken replies."
        case .id:
            "Tambahkan API key ElevenLabs untuk balasan suara."
        }
    }

    var conversationAutomationValidationListHeader: String {
        switch self.language {
        case .en:
            "Add the missing items below, then Finish will save a working voice-call config."
        case .id:
            "Tambahkan item yang masih kurang di bawah ini, lalu Finish akan menyimpan konfigurasi voice call yang bisa dipakai."
        }
    }

    var conversationAutomationTailscaleUnavailableTitle: String {
        switch self.language {
        case .en:
            "Tailscale Funnel is not ready yet"
        case .id:
            "Tailscale Funnel belum siap"
        }
    }

    var conversationAutomationTailscaleReadyTitle: String {
        switch self.language {
        case .en:
            "Use this callback URL in your phone provider"
        case .id:
            "Pakai URL callback ini di provider telepon Anda"
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
            "Maumau keeps long-term memory private for each user while also sharing approved context with the groups they belong to. Open Users later for details on people, groups, and sharing."
        case .id:
            "Maumau menyimpan memori jangka panjang secara privat untuk tiap pengguna, sambil membagikan konteks yang disetujui ke grup yang mereka ikuti. Buka Users nanti untuk detail tentang orang, grup, dan aturan berbagi."
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

    var managedBrowserSignInTitle: String {
        switch self.language {
        case .en:
            "Sign in once to Maumau's browser"
        case .id:
            "Masuk sekali ke browser Maumau"
        }
    }

    var managedBrowserSignInSubtitle: String {
        switch self.language {
        case .en:
            "This opens Maumau's separate browser profile on this Mac. Sign in there to any sites you want browser automation to reuse later. You can close it afterward."
        case .id:
            "Ini membuka profil browser Maumau yang terpisah di Mac ini. Masuklah di sana ke situs apa pun yang ingin Anda pakai lagi nanti oleh automasi browser. Setelah itu browsernya boleh ditutup."
        }
    }

    var managedBrowserSignInButtonTitle: String {
        switch self.language {
        case .en:
            "Open Maumau browser"
        case .id:
            "Buka browser Maumau"
        }
    }

    var managedBrowserSignInOpeningButtonTitle: String {
        switch self.language {
        case .en:
            "Opening…"
        case .id:
            "Membuka…"
        }
    }

    var managedBrowserSignInOpenedStatus: String {
        switch self.language {
        case .en:
            "Maumau's browser profile is open. Sign in there once, and Maumau can reopen that same profile later."
        case .id:
            "Profil browser Maumau sudah terbuka. Masuklah sekali di sana, lalu Maumau bisa membuka lagi profil yang sama nanti."
        }
    }

    var managedBrowserSignInFailedStatusPrefix: String {
        switch self.language {
        case .en:
            "Couldn’t open Maumau's browser profile yet."
        case .id:
            "Belum bisa membuka profil browser Maumau."
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
        case (.en, .automation):
            "Voice"
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
        case (.id, .automation):
            "Suara"
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
        case (.en, .automation):
            "Live phone setup"
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
        case (.id, .automation):
            "Setup telepon langsung"
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
        case (.en, .automation):
            "This optional step finishes the provider keys and public callback route that the built-in voice-call plugin needs before real phone calls can work."
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
        case (.id, .automation):
            "Langkah opsional ini menyelesaikan key provider dan rute callback publik yang dibutuhkan plugin voice-call bawaan sebelum panggilan telepon sungguhan bisa bekerja."
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
                    subtitle: "Fresh local setup installs the upstream clawdcursor helper for native desktop control across apps, then Maumau keeps checking readiness and permissions truthfully.",
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
                    subtitle: "Setup lokal baru memasang helper clawdcursor upstream untuk kontrol desktop native lintas aplikasi, lalu Maumau terus memeriksa kesiapan dan izin secara jujur.",
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
