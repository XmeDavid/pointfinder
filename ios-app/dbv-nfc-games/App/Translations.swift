import Foundation

// MARK: - Translation Dictionaries

/// All app translations, keyed by dot-notation namespace.
/// Use `Translations.string(_:language:)` for non-view code,
/// or `locale.t(_:)` via LocaleManager in SwiftUI views.
enum Translations {

    /// Non-isolated lookup safe to call from any context.
    /// Falls back to English, then returns the key itself.
    static func string(_ key: String, language: String? = nil) -> String {
        let lang = language ?? (UserDefaults.standard.string(forKey: "com.prayer.pointfinder.preferredLanguage") ?? "en")
        return all[lang]?[key] ?? all["en"]?[key] ?? key
    }

    /// Non-isolated lookup with format arguments.
    static func string(_ key: String, language: String? = nil, _ args: CVarArg...) -> String {
        let template = string(key, language: language)
        return String(format: template, arguments: args)
    }

    static let all: [String: [String: String]] = ["en": en, "pt": pt, "de": de]

    // MARK: - English

    static let en: [String: String] = [
        // Welcome
        "welcome.title": "PointFinder",
        "welcome.subtitle": "Explore, discover, and complete challenges with your team",
        "welcome.joinGame": "Join a Game",
        "welcome.operatorLogin": "Operator Login",

        // Auth (Operator Login)
        "auth.operatorLogin": "Operator Login",
        "auth.signInSubtitle": "Sign in with your operator account",
        "auth.email": "Email",
        "auth.password": "Password",
        "auth.signIn": "Sign In",

        // Join (Player Join)
        "join.title": "Join Your Team",
        "join.subtitle": "Enter the code your team leader gave you",
        "join.joinCode": "Join Code",
        "join.yourName": "Your Name",
        "join.joinGame": "Join Game",
        "join.orEnterCode": "Or enter the code manually",
        "join.next": "Continue",
        "join.enterYourName": "Enter Your Name",
        "join.cameraDisabled": "Camera access is needed to scan QR codes",

        // Common
        "common.error": "Error",
        "common.ok": "OK",
        "common.cancel": "Cancel",
        "common.unknownError": "An unknown error occurred",
        "common.done": "Done",
        "common.all": "All",
        "common.saving": "Saving...",
        "common.pts": "pts",

        // Tabs
        "tabs.map": "Map",
        "tabs.checkIn": "Check In",
        "tabs.settings": "Settings",

        // Offline
        "offline.banner": "You're offline. Changes will sync when connected.",
        "offline.checkInSync": "You're offline. Check-in will sync when connected.",
        "offline.photoRequired": "You're offline. Photo submissions require an internet connection.",
        "offline.submissionSync": "You're offline. Submission will sync when connected.",

        // Map legend
        "map.defaultTitle": "Map",
        "map.notVisited": "Not Visited",
        "map.checkedIn": "Checked In",
        "map.pending": "Pending",
        "map.completed": "Completed",
        "player.gameNotLiveTitle": "Game not active yet",
        "player.gameNotLiveMessage": "Please wait until your operator sets the game live.",

        // Status (BaseStatus labels)
        "status.notVisited": "Not Visited",
        "status.checkedIn": "Checked In",
        "status.pendingReview": "Pending Review",
        "status.completed": "Completed",
        "status.rejected": "Rejected",

        // Base detail
        "base.defaultName": "Base",
        "base.loadingChallenge": "Loading challenge...",
        "base.solveChallenge": "Solve Challenge",
        "base.challengeCompleted": "Challenge completed!",
        "base.awaitingReview": "Awaiting review...",
        "base.checkInToSee": "Check in at this base to see the challenge",
        "base.challengeLocked": "Challenge locked",
        "base.challengeLockedHint": "Visit this base to unlock the challenge",
        "base.noChallengeAssigned": "No challenge assigned to this base",
        "base.contactOperator": "Please contact your game operator",
        "base.checkedInBanner": "Checked In!",
        "base.noChallengeYet": "No challenge assigned to this base yet",
        "base.answerType": "Answer type: %@",
        "base.completionContent": "Completion Info",

        // Check In
        "checkIn.title": "Base Check-In",
        "checkIn.instructions": "Hold your phone near the marker at a base to check in",
        "checkIn.checkingIn": "Checking In...",
        "checkIn.checkInAtBase": "Check In at Base",
        "checkIn.pendingSyncOne": "%d pending action to sync",
        "checkIn.pendingSyncOther": "%d pending actions to sync",
        "checkIn.navTitle": "Check In",

        // Solve
        "solve.submitPhoto": "Submit Your Photo",
        "solve.submitAnswer": "Submit Your Answer",
        "solve.photoInstructions": "Take a photo or choose one from your library.",
        "solve.presenceInstructions": "Enter your answer below. You'll need to confirm at the base to submit.",
        "solve.answerInstructions": "Enter your answer below and tap submit when ready.",
        "solve.yourAnswer": "Your Answer",
        "solve.typeAnswer": "Type your answer here...",
        "solve.confirmAtBase": "Confirm at Base to Submit",
        "solve.submitPhotoBtn": "Submit Photo",
        "solve.submitAnswerBtn": "Submit Answer",
        "solve.presenceHelp": "Return to this base and tap the button to confirm your presence and submit.",
        "solve.photoHelp": "Your photo will be reviewed by an operator.",
        "solve.answerHelp": "Your answer will be reviewed and you'll earn points if correct.",
        "solve.wrongBase": "Wrong base! You need to be at %@ to submit.",
        "solve.navTitle": "Solve: %@",
        "solve.photo": "Photo",
        "solve.library": "Library",
        "solve.camera": "Camera",
        "solve.notesOptional": "Notes (optional)",
        "solve.addNote": "Add a note about the photo...",

        // Submission result
        "result.correct": "Correct!",
        "result.approved": "Approved!",
        "result.rejected": "Rejected",
        "result.submitted": "Submitted",
        "result.correctMsg": "Great job! Your answer is correct.",
        "result.approvedMsg": "Your submission has been approved.",
        "result.rejectedMsg": "Your submission was rejected. Check the feedback and try again.",
        "result.submittedMsg": "Your answer has been submitted and is awaiting review by an operator.",
        "result.feedback": "Feedback: %@",
        "result.completionContent": "Completion Info",
        "result.backToMap": "Back to Map",

        // Settings
        "settings.title": "Settings",
        "settings.language": "Language",
        "settings.currentGame": "Current Game",
        "settings.game": "Game",
        "settings.status": "Status",
        "settings.yourTeam": "Your Team",
        "settings.team": "Team",
        "settings.yourProfile": "Your Profile",
        "settings.name": "Name",
        "settings.progress": "Progress",
        "settings.totalBases": "Total Bases",
        "settings.completed": "Completed",
        "settings.checkedIn": "Checked In",
        "settings.pendingReview": "Pending Review",
        "settings.device": "Device",
        "settings.deviceId": "Device ID",
        "settings.pendingActions": "Pending actions",
        "settings.privacy": "Privacy",
        "settings.privacyPolicy": "View Privacy Policy",
        "settings.deleteAccount": "Delete Account",
        "settings.deletingAccount": "Deleting account...",
        "settings.deleteAccountTitle": "Delete Account",
        "settings.deleteAccountMessage": "This will permanently delete your player account data for PointFinder. This action cannot be undone.",
        "settings.deleteAccountConfirm": "Delete",
        "settings.leaveGame": "Leave Game",

        // Operator
        "operator.loadingGames": "Loading games...",
        "operator.noGames": "No Games",
        "operator.noGamesDesc": "You don't have any games assigned yet.",
        "operator.logout": "Logout",
        "operator.myGames": "My Games",
        "operator.loading": "Loading...",
        "operator.noBases": "No Bases",
        "operator.noBasesDesc": "This game doesn't have any bases yet. Create bases in the web admin.",
        "operator.liveMap": "Live Map",
        "operator.submissions": "Submissions",
        "operator.submissionsTitle": "Submissions",
        "operator.pending": "Pending",
        "operator.noPendingSubmissions": "No pending submissions",
        "operator.noSubmissions": "No submissions yet",
        "operator.unknownTeam": "Unknown team",
        "operator.unknownChallenge": "Unknown challenge",
        "operator.unknownBase": "Unknown base",
        "operator.base": "Base",
        "operator.bases": "Bases",
        "operator.switchGame": "Switch Game",
        "operator.linked": "Linked",
        "operator.notLinked": "Not Linked",
        "operator.baseDetails": "Base Details",
        "operator.teamStatus": "Team Status",
        "operator.noTeams": "No teams in this game yet",
        "operator.remaining": "Remaining",
        "operator.notificationSettings": "Notification Settings",
        "operator.notifyPendingSubmissions": "Notify pending submissions",
        "operator.notifyAllSubmissions": "Notify all submissions",
        "operator.notifyCheckIns": "Notify team check-ins",

        // Operator submissions
        "submissions.reviewTitle": "Review Submission",
        "submissions.team": "Team",
        "submissions.challenge": "Challenge",
        "submissions.answer": "Answer",
        "submissions.feedbackLabel": "Feedback (optional)",
        "submissions.reject": "Reject",
        "submissions.approve": "Approve",
        "submissions.statusPending": "Pending",
        "submissions.statusApproved": "Approved",
        "submissions.statusRejected": "Rejected",
        "submissions.statusCorrect": "Correct",

        // NFC
        "nfc.tag": "NFC Tag",
        "nfc.writeInstructions": "Write the base ID to an NFC tag so players can check in here.",
        "nfc.writeSuccess": "Tag written and linked successfully!",
        "nfc.nfcLinked": "NFC Linked",
        "nfc.nfcNotLinked": "NFC Not Linked",
        "nfc.presenceRequired": "Presence Required",
        "nfc.writing": "Writing...",
        "nfc.writeToTag": "Write to NFC Tag",
        "nfc.fixedChallenge": "Fixed Challenge",
        "nfc.randomAssignment": "Random Assignment",
        "nfc.randomlyAssigned": "Randomly Assigned",
        "nfc.randomDesc": "Challenges will be randomly assigned to teams when the game goes live.",
        "nfc.noChallengesYet": "No challenges assigned to this base yet.",
        "nfc.challengeNotFound": "Challenge not found",
        "nfc.loadingChallengeInfo": "Loading challenge info...",
        "nfc.challenge": "Challenge",
        "nfc.holdToRead": "Hold your iPhone near the NFC tag",
        "nfc.readSuccess": "Tag read successfully!",
        "nfc.holdToWrite": "Hold your iPhone near the NFC tag to write",
        "nfc.writeSuccessAlert": "Tag written successfully!",
        "nfc.writeSuccessMessage": "NFC tag written successfully",
        "nfc.noTagFound": "No tag found",
        "nfc.noDataOnTag": "No data on tag",
        "nfc.invalidTagData": "Invalid tag data",
        "nfc.failedQueryStatus": "Failed to query tag status",
        "nfc.tagNotWritable": "Tag is not writable",

        // NFC Errors
        "nfcError.notAvailable": "NFC is not available on this device",
        "nfcError.cancelled": "NFC scan was cancelled",
        "nfcError.readFailed": "NFC read failed: %@",
        "nfcError.noData": "No data found on tag",
        "nfcError.invalidData": "Tag does not contain valid base data",
        "nfcError.writeFailed": "NFC write failed: %@",

        // API Errors
        "apiError.invalidURL": "Invalid URL",
        "apiError.invalidResponse": "Invalid server response",
        "apiError.httpError": "Server error (%d): %@",
        "apiError.decodingError": "Failed to decode response: %@",
        "apiError.authExpired": "Session expired. Please log in again.",

        // Permission Disclosure
        "disclosure.title": "Before You Start",
        "disclosure.subtitle": "PointFinder needs a few permissions to run your game experience.",
        "disclosure.locationTitle": "Location",
        "disclosure.locationDetail": "Shows your team on the live map so operators can monitor the game.",
        "disclosure.notificationsTitle": "Notifications",
        "disclosure.notificationsDetail": "Delivers game updates and messages from your operator.",
        "disclosure.cameraTitle": "Camera & Photos",
        "disclosure.cameraDetail": "Scan QR codes to join and submit photos for challenges.",
        "disclosure.footer": "You can change these permissions later in Settings.",
        "disclosure.continue": "Continue",

        // Notifications
        "notifications.title": "Notifications",
        "notifications.empty": "No notifications yet",

        // App Errors
        "error.photoOffline": "Photo submissions require an internet connection.",
        "error.photoProcessing": "Failed to process photo.",
    ]

    // MARK: - Portuguese

    static let pt: [String: String] = [
        // Welcome
        "welcome.title": "PointFinder",
        "welcome.subtitle": "Explora, descobre e completa desafios com a tua equipa",
        "welcome.joinGame": "Entrar num Jogo",
        "welcome.operatorLogin": "Login Operador",

        // Auth (Operator Login)
        "auth.operatorLogin": "Login Operador",
        "auth.signInSubtitle": "Inicia sessão com a tua conta de operador",
        "auth.email": "Email",
        "auth.password": "Palavra-passe",
        "auth.signIn": "Entrar",

        // Join (Player Join)
        "join.title": "Junta-te à tua Equipa",
        "join.subtitle": "Introduz o código que o teu líder de equipa te deu",
        "join.joinCode": "Código de Entrada",
        "join.yourName": "O teu Nome",
        "join.joinGame": "Entrar no Jogo",
        "join.orEnterCode": "Ou introduz o código manualmente",
        "join.next": "Continuar",
        "join.enterYourName": "Introduz o teu Nome",
        "join.cameraDisabled": "O acesso à câmara é necessário para ler códigos QR",

        // Common
        "common.error": "Erro",
        "common.ok": "OK",
        "common.cancel": "Cancelar",
        "common.unknownError": "Ocorreu um erro desconhecido",
        "common.done": "Feito",
        "common.all": "Todos",
        "common.saving": "A guardar...",
        "common.pts": "pts",

        // Tabs
        "tabs.map": "Mapa",
        "tabs.checkIn": "Check In",
        "tabs.settings": "Definições",

        // Offline
        "offline.banner": "Estás offline. As alterações serão sincronizadas quando ligares.",
        "offline.checkInSync": "Estás offline. O check-in será sincronizado quando ligares.",
        "offline.photoRequired": "Estás offline. As submissões de fotos requerem ligação à internet.",
        "offline.submissionSync": "Estás offline. A submissão será sincronizada quando ligares.",

        // Map legend
        "map.defaultTitle": "Mapa",
        "map.notVisited": "Não Visitado",
        "map.checkedIn": "Check-in",
        "map.pending": "Pendente",
        "map.completed": "Concluído",
        "player.gameNotLiveTitle": "Jogo ainda não está ativo",
        "player.gameNotLiveMessage": "Aguarda até que o operador coloque o jogo em direto.",

        // Status (BaseStatus labels)
        "status.notVisited": "Não Visitado",
        "status.checkedIn": "Check-in",
        "status.pendingReview": "Revisão Pendente",
        "status.completed": "Concluído",
        "status.rejected": "Rejeitado",

        // Base detail
        "base.defaultName": "Base",
        "base.loadingChallenge": "A carregar desafio...",
        "base.solveChallenge": "Resolver Desafio",
        "base.challengeCompleted": "Desafio concluído!",
        "base.awaitingReview": "A aguardar revisão...",
        "base.checkInToSee": "Faz check-in nesta base para ver o desafio",
        "base.challengeLocked": "Desafio bloqueado",
        "base.challengeLockedHint": "Visita esta base para desbloquear o desafio",
        "base.noChallengeAssigned": "Nenhum desafio atribuído a esta base",
        "base.contactOperator": "Contacta o teu operador de jogo",
        "base.checkedInBanner": "Check-in feito!",
        "base.noChallengeYet": "Nenhum desafio atribuído a esta base ainda",
        "base.answerType": "Tipo de resposta: %@",
        "base.completionContent": "Informação de conclusão",

        // Check In
        "checkIn.title": "Check-In de Base",
        "checkIn.instructions": "Segura o telemóvel perto do marcador numa base para fazeres check-in",
        "checkIn.checkingIn": "A fazer Check-In...",
        "checkIn.checkInAtBase": "Check-In na Base",
        "checkIn.pendingSyncOne": "%d ação pendente para sincronizar",
        "checkIn.pendingSyncOther": "%d ações pendentes para sincronizar",
        "checkIn.navTitle": "Check In",

        // Solve
        "solve.submitPhoto": "Submeter a tua Foto",
        "solve.submitAnswer": "Submeter a tua Resposta",
        "solve.photoInstructions": "Tira uma foto ou escolhe uma da tua biblioteca.",
        "solve.presenceInstructions": "Introduz a tua resposta abaixo. Terás de confirmar na base para submeter.",
        "solve.answerInstructions": "Introduz a tua resposta abaixo e toca em submeter quando estiveres pronto.",
        "solve.yourAnswer": "A tua Resposta",
        "solve.typeAnswer": "Escreve a tua resposta aqui...",
        "solve.confirmAtBase": "Confirmar na Base para Submeter",
        "solve.submitPhotoBtn": "Submeter Foto",
        "solve.submitAnswerBtn": "Submeter Resposta",
        "solve.presenceHelp": "Volta a esta base e toca no botão para confirmar a tua presença e submeter.",
        "solve.photoHelp": "A tua foto será revista por um operador.",
        "solve.answerHelp": "A tua resposta será revista e ganharás pontos se estiver correta.",
        "solve.wrongBase": "Base errada! Precisas de estar em %@ para submeter.",
        "solve.navTitle": "Resolver: %@",
        "solve.photo": "Foto",
        "solve.library": "Biblioteca",
        "solve.camera": "Câmara",
        "solve.notesOptional": "Notas (opcional)",
        "solve.addNote": "Adiciona uma nota sobre a foto...",

        // Submission result
        "result.correct": "Correto!",
        "result.approved": "Aprovado!",
        "result.rejected": "Rejeitado",
        "result.submitted": "Submetido",
        "result.correctMsg": "Bom trabalho! A tua resposta está correta.",
        "result.approvedMsg": "A tua submissão foi aprovada.",
        "result.rejectedMsg": "A tua submissão foi rejeitada. Verifica o feedback e tenta novamente.",
        "result.submittedMsg": "A tua resposta foi submetida e está a aguardar revisão por um operador.",
        "result.feedback": "Feedback: %@",
        "result.completionContent": "Informação de conclusão",
        "result.backToMap": "Voltar ao Mapa",

        // Settings
        "settings.title": "Definições",
        "settings.language": "Idioma",
        "settings.currentGame": "Jogo Atual",
        "settings.game": "Jogo",
        "settings.status": "Estado",
        "settings.yourTeam": "A tua Equipa",
        "settings.team": "Equipa",
        "settings.yourProfile": "O teu Perfil",
        "settings.name": "Nome",
        "settings.progress": "Progresso",
        "settings.totalBases": "Total de Bases",
        "settings.completed": "Concluídos",
        "settings.checkedIn": "Check-in",
        "settings.pendingReview": "Revisão Pendente",
        "settings.device": "Dispositivo",
        "settings.deviceId": "ID do Dispositivo",
        "settings.pendingActions": "Ações pendentes",
        "settings.privacy": "Privacidade",
        "settings.privacyPolicy": "Ver Política de Privacidade",
        "settings.deleteAccount": "Eliminar Conta",
        "settings.deletingAccount": "A eliminar conta...",
        "settings.deleteAccountTitle": "Eliminar Conta",
        "settings.deleteAccountMessage": "Isto irá eliminar permanentemente os teus dados de conta de jogador no PointFinder. Esta ação não pode ser desfeita.",
        "settings.deleteAccountConfirm": "Eliminar",
        "settings.leaveGame": "Sair do Jogo",

        // Operator
        "operator.loadingGames": "A carregar jogos...",
        "operator.noGames": "Sem Jogos",
        "operator.noGamesDesc": "Ainda não tens jogos atribuídos.",
        "operator.logout": "Terminar Sessão",
        "operator.myGames": "Os Meus Jogos",
        "operator.loading": "A carregar...",
        "operator.noBases": "Sem Bases",
        "operator.noBasesDesc": "Este jogo ainda não tem bases. Cria bases no painel web.",
        "operator.liveMap": "Mapa em Direto",
        "operator.submissions": "Submissões",
        "operator.submissionsTitle": "Submissões",
        "operator.pending": "Pendentes",
        "operator.noPendingSubmissions": "Sem submissões pendentes",
        "operator.noSubmissions": "Sem submissões ainda",
        "operator.unknownTeam": "Equipa desconhecida",
        "operator.unknownChallenge": "Desafio desconhecido",
        "operator.unknownBase": "Base desconhecida",
        "operator.base": "Base",
        "operator.bases": "Bases",
        "operator.switchGame": "Mudar de Jogo",
        "operator.linked": "Ligado",
        "operator.notLinked": "Não Ligado",
        "operator.baseDetails": "Detalhes da Base",
        "operator.teamStatus": "Estado das Equipas",
        "operator.noTeams": "Ainda sem equipas neste jogo",
        "operator.remaining": "Restantes",
        "operator.notificationSettings": "Definições de Notificações",
        "operator.notifyPendingSubmissions": "Notificar submissões pendentes",
        "operator.notifyAllSubmissions": "Notificar todas as submissões",
        "operator.notifyCheckIns": "Notificar check-ins das equipas",

        // Operator submissions
        "submissions.reviewTitle": "Rever Submissão",
        "submissions.team": "Equipa",
        "submissions.challenge": "Desafio",
        "submissions.answer": "Resposta",
        "submissions.feedbackLabel": "Feedback (opcional)",
        "submissions.reject": "Rejeitar",
        "submissions.approve": "Aprovar",
        "submissions.statusPending": "Pendente",
        "submissions.statusApproved": "Aprovada",
        "submissions.statusRejected": "Rejeitada",
        "submissions.statusCorrect": "Correta",

        // NFC
        "nfc.tag": "Etiqueta NFC",
        "nfc.writeInstructions": "Escreve o ID da base numa etiqueta NFC para que os jogadores possam fazer check-in aqui.",
        "nfc.writeSuccess": "Etiqueta escrita e ligada com sucesso!",
        "nfc.nfcLinked": "NFC Ligado",
        "nfc.nfcNotLinked": "NFC Não Ligado",
        "nfc.presenceRequired": "Presença Obrigatória",
        "nfc.writing": "A escrever...",
        "nfc.writeToTag": "Escrever na Etiqueta NFC",
        "nfc.fixedChallenge": "Desafio Fixo",
        "nfc.randomAssignment": "Atribuição Aleatória",
        "nfc.randomlyAssigned": "Atribuído Aleatoriamente",
        "nfc.randomDesc": "Os desafios serão atribuídos aleatoriamente às equipas quando o jogo começar.",
        "nfc.noChallengesYet": "Nenhum desafio atribuído a esta base ainda.",
        "nfc.challengeNotFound": "Desafio não encontrado",
        "nfc.loadingChallengeInfo": "A carregar info do desafio...",
        "nfc.challenge": "Desafio",
        "nfc.holdToRead": "Segura o iPhone perto da etiqueta NFC",
        "nfc.readSuccess": "Etiqueta lida com sucesso!",
        "nfc.holdToWrite": "Segura o iPhone perto da etiqueta NFC para escrever",
        "nfc.writeSuccessAlert": "Etiqueta escrita com sucesso!",
        "nfc.writeSuccessMessage": "Etiqueta NFC escrita com sucesso",
        "nfc.noTagFound": "Nenhuma etiqueta encontrada",
        "nfc.noDataOnTag": "Sem dados na etiqueta",
        "nfc.invalidTagData": "Dados da etiqueta inválidos",
        "nfc.failedQueryStatus": "Falha ao verificar estado da etiqueta",
        "nfc.tagNotWritable": "A etiqueta não é gravável",

        // NFC Errors
        "nfcError.notAvailable": "NFC não está disponível neste dispositivo",
        "nfcError.cancelled": "Leitura NFC foi cancelada",
        "nfcError.readFailed": "Leitura NFC falhou: %@",
        "nfcError.noData": "Nenhum dado encontrado na etiqueta",
        "nfcError.invalidData": "A etiqueta não contém dados válidos de base",
        "nfcError.writeFailed": "Escrita NFC falhou: %@",

        // API Errors
        "apiError.invalidURL": "URL inválido",
        "apiError.invalidResponse": "Resposta do servidor inválida",
        "apiError.httpError": "Erro do servidor (%d): %@",
        "apiError.decodingError": "Falha ao descodificar resposta: %@",
        "apiError.authExpired": "Sessão expirou. Inicia sessão novamente.",

        // Permission Disclosure
        "disclosure.title": "Antes de Começar",
        "disclosure.subtitle": "O PointFinder precisa de algumas permissões para a tua experiência de jogo.",
        "disclosure.locationTitle": "Localização",
        "disclosure.locationDetail": "Mostra a tua equipa no mapa ao vivo para os operadores monitorizarem o jogo.",
        "disclosure.notificationsTitle": "Notificações",
        "disclosure.notificationsDetail": "Envia atualizações de jogo e mensagens do operador.",
        "disclosure.cameraTitle": "Câmara e Fotos",
        "disclosure.cameraDetail": "Lê códigos QR para entrar e submete fotos para desafios.",
        "disclosure.footer": "Podes alterar estas permissões mais tarde nas Definições.",
        "disclosure.continue": "Continuar",

        // Notifications
        "notifications.title": "Notificações",
        "notifications.empty": "Sem notificações ainda",

        // App Errors
        "error.photoOffline": "As submissões de fotos requerem ligação à internet.",
        "error.photoProcessing": "Falha ao processar foto.",
    ]

    // MARK: - German

    static let de: [String: String] = [
        // Welcome
        "welcome.title": "PointFinder",
        "welcome.subtitle": "Erkunde, entdecke und meistere Challenges mit deinem Team",
        "welcome.joinGame": "Einem Spiel beitreten",
        "welcome.operatorLogin": "Operator-Anmeldung",

        // Auth (Operator Login)
        "auth.operatorLogin": "Operator-Anmeldung",
        "auth.signInSubtitle": "Melde dich mit deinem Operator-Konto an",
        "auth.email": "E-Mail",
        "auth.password": "Passwort",
        "auth.signIn": "Anmelden",

        // Join (Player Join)
        "join.title": "Deinem Team beitreten",
        "join.subtitle": "Gib den Code ein, den dir dein Teamleiter gegeben hat",
        "join.joinCode": "Beitrittscode",
        "join.yourName": "Dein Name",
        "join.joinGame": "Spiel beitreten",
        "join.orEnterCode": "Oder den Code manuell eingeben",
        "join.next": "Weiter",
        "join.enterYourName": "Gib deinen Namen ein",
        "join.cameraDisabled": "Kamerazugriff wird benötigt, um QR-Codes zu scannen",

        // Common
        "common.error": "Fehler",
        "common.ok": "OK",
        "common.cancel": "Abbrechen",
        "common.unknownError": "Ein unbekannter Fehler ist aufgetreten",
        "common.done": "Fertig",
        "common.all": "Alle",
        "common.saving": "Wird gespeichert...",
        "common.pts": "Pkt",

        // Tabs
        "tabs.map": "Karte",
        "tabs.checkIn": "Check-in",
        "tabs.settings": "Einstellungen",

        // Offline
        "offline.banner": "Du bist offline. Änderungen werden synchronisiert, sobald du wieder verbunden bist.",
        "offline.checkInSync": "Du bist offline. Der Check-in wird synchronisiert, sobald du wieder verbunden bist.",
        "offline.photoRequired": "Du bist offline. Foto-Einreichungen benötigen eine Internetverbindung.",
        "offline.submissionSync": "Du bist offline. Die Einreichung wird synchronisiert, sobald du wieder verbunden bist.",

        // Map legend
        "map.defaultTitle": "Karte",
        "map.notVisited": "Nicht besucht",
        "map.checkedIn": "Eingecheckt",
        "map.pending": "Ausstehend",
        "map.completed": "Abgeschlossen",
        "player.gameNotLiveTitle": "Spiel ist noch nicht aktiv",
        "player.gameNotLiveMessage": "Bitte warte, bis dein Operator das Spiel live schaltet.",

        // Status (BaseStatus labels)
        "status.notVisited": "Nicht besucht",
        "status.checkedIn": "Eingecheckt",
        "status.pendingReview": "Prüfung ausstehend",
        "status.completed": "Abgeschlossen",
        "status.rejected": "Abgelehnt",

        // Base detail
        "base.defaultName": "Station",
        "base.loadingChallenge": "Challenge wird geladen...",
        "base.solveChallenge": "Challenge lösen",
        "base.challengeCompleted": "Challenge abgeschlossen!",
        "base.awaitingReview": "Warte auf Prüfung...",
        "base.checkInToSee": "Checke an dieser Station ein, um die Challenge zu sehen",
        "base.challengeLocked": "Challenge gesperrt",
        "base.challengeLockedHint": "Besuche diese Station, um die Challenge freizuschalten",
        "base.noChallengeAssigned": "Dieser Station ist keine Challenge zugewiesen",
        "base.contactOperator": "Bitte kontaktiere deinen Spiel-Operator",
        "base.checkedInBanner": "Eingecheckt!",
        "base.noChallengeYet": "Dieser Station ist noch keine Challenge zugewiesen",
        "base.answerType": "Antworttyp: %@",
        "base.completionContent": "Abschlussinfos",

        // Check In
        "checkIn.title": "Stations-Check-in",
        "checkIn.instructions": "Halte dein Telefon an den Marker einer Station, um einzuchecken",
        "checkIn.checkingIn": "Check-in läuft...",
        "checkIn.checkInAtBase": "An Station einchecken",
        "checkIn.pendingSyncOne": "%d ausstehende Aktion zur Synchronisierung",
        "checkIn.pendingSyncOther": "%d ausstehende Aktionen zur Synchronisierung",
        "checkIn.navTitle": "Check-in",

        // Solve
        "solve.submitPhoto": "Foto einreichen",
        "solve.submitAnswer": "Antwort einreichen",
        "solve.photoInstructions": "Mache ein Foto oder wähle eines aus deiner Mediathek.",
        "solve.presenceInstructions": "Gib unten deine Antwort ein. Du musst die Antwort an der Station bestätigen, um sie einzureichen.",
        "solve.answerInstructions": "Gib unten deine Antwort ein und tippe auf Senden, wenn du bereit bist.",
        "solve.yourAnswer": "Deine Antwort",
        "solve.typeAnswer": "Antwort hier eingeben...",
        "solve.confirmAtBase": "An Station bestätigen und einreichen",
        "solve.submitPhotoBtn": "Foto senden",
        "solve.submitAnswerBtn": "Antwort senden",
        "solve.presenceHelp": "Kehre zu dieser Station zurück und tippe auf den Button, um deine Anwesenheit zu bestätigen und einzureichen.",
        "solve.photoHelp": "Dein Foto wird von einem Operator geprüft.",
        "solve.answerHelp": "Deine Antwort wird geprüft und du erhältst Punkte, wenn sie korrekt ist.",
        "solve.wrongBase": "Falsche Station! Du musst bei %@ sein, um einzureichen.",
        "solve.navTitle": "Lösen: %@",
        "solve.photo": "Foto",
        "solve.library": "Mediathek",
        "solve.camera": "Kamera",
        "solve.notesOptional": "Notizen (optional)",
        "solve.addNote": "Notiz zum Foto hinzufügen...",

        // Submission result
        "result.correct": "Richtig!",
        "result.approved": "Freigegeben!",
        "result.rejected": "Abgelehnt",
        "result.submitted": "Eingereicht",
        "result.correctMsg": "Super gemacht! Deine Antwort ist richtig.",
        "result.approvedMsg": "Deine Einreichung wurde freigegeben.",
        "result.rejectedMsg": "Deine Einreichung wurde abgelehnt. Prüfe das Feedback und versuche es erneut.",
        "result.submittedMsg": "Deine Antwort wurde eingereicht und wartet auf Prüfung durch einen Operator.",
        "result.feedback": "Feedback: %@",
        "result.completionContent": "Abschlussinfos",
        "result.backToMap": "Zurück zur Karte",

        // Settings
        "settings.title": "Einstellungen",
        "settings.language": "Sprache",
        "settings.currentGame": "Aktuelles Spiel",
        "settings.game": "Spiel",
        "settings.status": "Status",
        "settings.yourTeam": "Dein Team",
        "settings.team": "Team",
        "settings.yourProfile": "Dein Profil",
        "settings.name": "Name",
        "settings.progress": "Fortschritt",
        "settings.totalBases": "Stationen gesamt",
        "settings.completed": "Abgeschlossen",
        "settings.checkedIn": "Eingecheckt",
        "settings.pendingReview": "Prüfung ausstehend",
        "settings.device": "Gerät",
        "settings.deviceId": "Geräte-ID",
        "settings.pendingActions": "Ausstehende Aktionen",
        "settings.privacy": "Datenschutz",
        "settings.privacyPolicy": "Datenschutzerklärung anzeigen",
        "settings.deleteAccount": "Konto löschen",
        "settings.deletingAccount": "Konto wird gelöscht...",
        "settings.deleteAccountTitle": "Konto löschen",
        "settings.deleteAccountMessage": "Dadurch werden deine Spielerkontodaten für PointFinder dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
        "settings.deleteAccountConfirm": "Löschen",
        "settings.leaveGame": "Spiel verlassen",

        // Operator
        "operator.loadingGames": "Spiele werden geladen...",
        "operator.noGames": "Keine Spiele",
        "operator.noGamesDesc": "Dir sind noch keine Spiele zugewiesen.",
        "operator.logout": "Abmelden",
        "operator.myGames": "Meine Spiele",
        "operator.loading": "Wird geladen...",
        "operator.noBases": "Keine Stationen",
        "operator.noBasesDesc": "Dieses Spiel hat noch keine Stationen. Erstelle Stationen im Web-Admin.",
        "operator.liveMap": "Live-Karte",
        "operator.submissions": "Einreichungen",
        "operator.submissionsTitle": "Einreichungen",
        "operator.pending": "Ausstehend",
        "operator.noPendingSubmissions": "Keine ausstehenden Einreichungen",
        "operator.noSubmissions": "Noch keine Einreichungen",
        "operator.unknownTeam": "Unbekanntes Team",
        "operator.unknownChallenge": "Unbekannte Challenge",
        "operator.unknownBase": "Unbekannte Station",
        "operator.base": "Station",
        "operator.bases": "Stationen",
        "operator.switchGame": "Spiel wechseln",
        "operator.linked": "Verknüpft",
        "operator.notLinked": "Nicht verknüpft",
        "operator.baseDetails": "Stationsdetails",
        "operator.teamStatus": "Team-Status",
        "operator.noTeams": "Noch keine Teams in diesem Spiel",
        "operator.remaining": "Verbleibend",
        "operator.notificationSettings": "Benachrichtigungseinstellungen",
        "operator.notifyPendingSubmissions": "Ausstehende Einreichungen benachrichtigen",
        "operator.notifyAllSubmissions": "Alle Einreichungen benachrichtigen",
        "operator.notifyCheckIns": "Team-Check-ins benachrichtigen",

        // Operator submissions
        "submissions.reviewTitle": "Einreichung prüfen",
        "submissions.team": "Team",
        "submissions.challenge": "Challenge",
        "submissions.answer": "Antwort",
        "submissions.feedbackLabel": "Feedback (optional)",
        "submissions.reject": "Ablehnen",
        "submissions.approve": "Freigeben",
        "submissions.statusPending": "Ausstehend",
        "submissions.statusApproved": "Freigegeben",
        "submissions.statusRejected": "Abgelehnt",
        "submissions.statusCorrect": "Korrekt",

        // NFC
        "nfc.tag": "NFC-Tag",
        "nfc.writeInstructions": "Schreibe die Stations-ID auf ein NFC-Tag, damit Spieler hier einchecken können.",
        "nfc.writeSuccess": "Tag erfolgreich beschrieben und verknüpft!",
        "nfc.nfcLinked": "NFC verknüpft",
        "nfc.nfcNotLinked": "NFC nicht verknüpft",
        "nfc.presenceRequired": "Anwesenheit erforderlich",
        "nfc.writing": "Wird geschrieben...",
        "nfc.writeToTag": "Auf NFC-Tag schreiben",
        "nfc.fixedChallenge": "Feste Challenge",
        "nfc.randomAssignment": "Zufällige Zuweisung",
        "nfc.randomlyAssigned": "Zufällig zugewiesen",
        "nfc.randomDesc": "Challenges werden beim Spielstart den Teams zufällig zugewiesen.",
        "nfc.noChallengesYet": "Dieser Station sind noch keine Challenges zugewiesen.",
        "nfc.challengeNotFound": "Challenge nicht gefunden",
        "nfc.loadingChallengeInfo": "Challenge-Info wird geladen...",
        "nfc.challenge": "Challenge",
        "nfc.holdToRead": "Halte dein iPhone in die Nähe des NFC-Tags",
        "nfc.readSuccess": "Tag erfolgreich gelesen!",
        "nfc.holdToWrite": "Halte dein iPhone in die Nähe des NFC-Tags, um zu schreiben",
        "nfc.writeSuccessAlert": "Tag erfolgreich beschrieben!",
        "nfc.writeSuccessMessage": "NFC-Tag erfolgreich beschrieben",
        "nfc.noTagFound": "Kein Tag gefunden",
        "nfc.noDataOnTag": "Keine Daten auf dem Tag",
        "nfc.invalidTagData": "Ungültige Tag-Daten",
        "nfc.failedQueryStatus": "Tag-Status konnte nicht abgefragt werden",
        "nfc.tagNotWritable": "Tag ist nicht beschreibbar",

        // NFC Errors
        "nfcError.notAvailable": "NFC ist auf diesem Gerät nicht verfügbar",
        "nfcError.cancelled": "NFC-Scan wurde abgebrochen",
        "nfcError.readFailed": "NFC-Lesen fehlgeschlagen: %@",
        "nfcError.noData": "Keine Daten auf dem Tag gefunden",
        "nfcError.invalidData": "Tag enthält keine gültigen Stationsdaten",
        "nfcError.writeFailed": "NFC-Schreiben fehlgeschlagen: %@",

        // API Errors
        "apiError.invalidURL": "Ungültige URL",
        "apiError.invalidResponse": "Ungültige Serverantwort",
        "apiError.httpError": "Serverfehler (%d): %@",
        "apiError.decodingError": "Antwort konnte nicht dekodiert werden: %@",
        "apiError.authExpired": "Sitzung abgelaufen. Bitte erneut anmelden.",

        // Permission Disclosure
        "disclosure.title": "Bevor du startest",
        "disclosure.subtitle": "PointFinder benötigt einige Berechtigungen für dein Spielerlebnis.",
        "disclosure.locationTitle": "Standort",
        "disclosure.locationDetail": "Zeigt dein Team auf der Live-Karte, damit Operatoren das Spiel überwachen können.",
        "disclosure.notificationsTitle": "Benachrichtigungen",
        "disclosure.notificationsDetail": "Liefert Spiel-Updates und Nachrichten von deinem Operator.",
        "disclosure.cameraTitle": "Kamera & Fotos",
        "disclosure.cameraDetail": "QR-Codes scannen und Fotos für Challenges einreichen.",
        "disclosure.footer": "Du kannst diese Berechtigungen später in den Einstellungen ändern.",
        "disclosure.continue": "Weiter",

        // Notifications
        "notifications.title": "Benachrichtigungen",
        "notifications.empty": "Noch keine Benachrichtigungen",

        // App Errors
        "error.photoOffline": "Foto-Einreichungen benötigen eine Internetverbindung.",
        "error.photoProcessing": "Foto konnte nicht verarbeitet werden.",
    ]
}
