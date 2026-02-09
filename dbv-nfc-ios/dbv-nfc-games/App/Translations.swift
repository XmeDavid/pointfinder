import Foundation

// MARK: - Translation Dictionaries

/// All app translations, keyed by dot-notation namespace.
/// Use `Translations.string(_:language:)` for non-view code,
/// or `locale.t(_:)` via LocaleManager in SwiftUI views.
enum Translations {

    /// Non-isolated lookup safe to call from any context.
    /// Falls back to English, then returns the key itself.
    static func string(_ key: String, language: String? = nil) -> String {
        let lang = language ?? (UserDefaults.standard.string(forKey: "com.dbvnfc.preferredLanguage") ?? "en")
        return all[lang]?[key] ?? all["en"]?[key] ?? key
    }

    /// Non-isolated lookup with format arguments.
    static func string(_ key: String, language: String? = nil, _ args: CVarArg...) -> String {
        let template = string(key, language: language)
        return String(format: template, arguments: args)
    }

    static let all: [String: [String: String]] = ["en": en, "pt": pt]

    // MARK: - English

    static let en: [String: String] = [
        // Welcome
        "welcome.title": "Scout Mission",
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

        // Common
        "common.error": "Error",
        "common.ok": "OK",
        "common.unknownError": "An unknown error occurred",
        "common.done": "Done",
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
        "base.noChallengeAssigned": "No challenge assigned to this base",
        "base.contactOperator": "Please contact your game operator",
        "base.checkedInBanner": "Checked In!",
        "base.noChallengeYet": "No challenge assigned to this base yet",
        "base.answerType": "Answer type: %@",

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
        "result.incorrect": "Incorrect",
        "result.rejected": "Rejected",
        "result.submitted": "Submitted",
        "result.correctMsg": "Great job! Your answer is correct.",
        "result.approvedMsg": "Your submission has been approved.",
        "result.incorrectMsg": "Sorry, that's not the right answer. You can try again.",
        "result.rejectedMsg": "Your submission was rejected. Check the feedback and try again.",
        "result.submittedMsg": "Your answer has been submitted and is awaiting review by an operator.",
        "result.feedback": "Feedback: %@",
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
        "operator.bases": "Bases",
        "operator.switchGame": "Switch Game",
        "operator.linked": "Linked",
        "operator.notLinked": "Not Linked",
        "operator.baseDetails": "Base Details",
        "operator.teamStatus": "Team Status",
        "operator.noTeams": "No teams in this game yet",
        "operator.remaining": "Remaining",

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

        // App Errors
        "error.photoOffline": "Photo submissions require an internet connection.",
        "error.photoProcessing": "Failed to process photo.",
    ]

    // MARK: - Portuguese

    static let pt: [String: String] = [
        // Welcome
        "welcome.title": "Missão Scout",
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

        // Common
        "common.error": "Erro",
        "common.ok": "OK",
        "common.unknownError": "Ocorreu um erro desconhecido",
        "common.done": "Feito",
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
        "base.noChallengeAssigned": "Nenhum desafio atribuído a esta base",
        "base.contactOperator": "Contacta o teu operador de jogo",
        "base.checkedInBanner": "Check-in feito!",
        "base.noChallengeYet": "Nenhum desafio atribuído a esta base ainda",
        "base.answerType": "Tipo de resposta: %@",

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
        "result.incorrect": "Incorreto",
        "result.rejected": "Rejeitado",
        "result.submitted": "Submetido",
        "result.correctMsg": "Bom trabalho! A tua resposta está correta.",
        "result.approvedMsg": "A tua submissão foi aprovada.",
        "result.incorrectMsg": "Desculpa, essa não é a resposta certa. Podes tentar novamente.",
        "result.rejectedMsg": "A tua submissão foi rejeitada. Verifica o feedback e tenta novamente.",
        "result.submittedMsg": "A tua resposta foi submetida e está a aguardar revisão por um operador.",
        "result.feedback": "Feedback: %@",
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
        "operator.bases": "Bases",
        "operator.switchGame": "Mudar de Jogo",
        "operator.linked": "Ligado",
        "operator.notLinked": "Não Ligado",
        "operator.baseDetails": "Detalhes da Base",
        "operator.teamStatus": "Estado das Equipas",
        "operator.noTeams": "Ainda sem equipas neste jogo",
        "operator.remaining": "Restantes",

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

        // App Errors
        "error.photoOffline": "As submissões de fotos requerem ligação à internet.",
        "error.photoProcessing": "Falha ao processar foto.",
    ]
}
