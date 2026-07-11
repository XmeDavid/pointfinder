import SwiftUI

struct OrganizationView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let org: OrgWorkspace

    @State private var members: [OrgMemberResponse] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var successMessage: String?

    // Invite sheet
    @State private var showInviteSheet = false
    @State private var inviteEmail = ""
    @State private var isSendingInvite = false
    @State private var inviteError: String?

    // Permissions sheet
    @State private var selectedMember: OrgMemberResponse?
    @State private var showPermissionsSheet = false
    @State private var editedPermissions = 0
    @State private var isSavingPermissions = false

    // Remove confirmation
    @State private var memberToRemove: OrgMemberResponse?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType { return token }
        return nil
    }

    private var canInvite: Bool { OrgPermission.has(org.permissions, OrgPermission.inviteMembers) }
    private var canManagePerms: Bool { OrgPermission.has(org.permissions, OrgPermission.managePerms) }

    var body: some View {
        List {
            // Header section: org metadata
            Section {
                OrganizationWorkspaceSummary(name: org.name, slug: org.slug, tier: org.tier, memberCount: org.memberCount, liveGameCount: org.liveGames, membersLabel: locale.t("org.members"), liveGamesLabel: locale.t("org.liveGames"))
                    .listRowInsets(EdgeInsets(top: PFSpaceToken.space2, leading: 0, bottom: PFSpaceToken.space2, trailing: 0))
            }

            // Members section
            Section(locale.t("org.members")) {
                if isLoading {
                    ProgressView(locale.t("org.loadingMembers"))
                } else if members.isEmpty {
                    Text(locale.t("org.noMembers"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(members) { member in
                        memberRow(member)
                    }
                    .onDelete(perform: canInvite ? deleteMember : nil)
                }

                if canInvite {
                    Button {
                        inviteEmail = ""
                        inviteError = nil
                        showInviteSheet = true
                    } label: {
                        Label(locale.t("org.inviteMember"), systemImage: "person.badge.plus")
                            .foregroundStyle(Color.pfPrimary)
                    }
                }
            }

            if let successMessage {
                Section {
                    Text(successMessage)
                        .foregroundStyle(PFColorToken.statusCompleted)
                        .font(.caption)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(PFColorToken.contentDanger)
                        .font(.caption)
                }
            }
        }
        .navigationTitle(org.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadMembers() }
        // Invite sheet
        .sheet(isPresented: $showInviteSheet) {
            inviteSheet
        }
        // Permissions sheet
        .sheet(isPresented: $showPermissionsSheet) {
            if let member = selectedMember {
                permissionsSheet(for: member)
            }
        }
        // Remove confirmation
        .alert(locale.t("org.removeMember"), isPresented: Binding(
            get: { memberToRemove != nil },
            set: { if !$0 { memberToRemove = nil } }
        )) {
            Button(locale.t("org.remove"), role: .destructive) {
                if let m = memberToRemove { Task { await removeMember(m) } }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(String(format: locale.t("org.removeMemberMessage"), memberToRemove?.name ?? "", org.name))
        }
    }

    // MARK: - Sub-views

    @ViewBuilder
    private func memberRow(_ member: OrgMemberResponse) -> some View {
        HStack(spacing: PFSpacing.itemGap) {
            VStack(alignment: .leading, spacing: 2) {
                Text(member.name)
                    .font(.body)
                    .foregroundStyle(Color.pfText)
                Text(member.email)
                    .font(.caption)
                    .foregroundStyle(Color.pfTextMuted)
                permissionBadges(member.permissions)
                    .padding(.top, 2)
            }
            Spacer()
            if canManagePerms {
                Button {
                    selectedMember = member
                    editedPermissions = member.permissions
                    showPermissionsSheet = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .foregroundStyle(Color.pfPrimary)
                }
                .buttonStyle(.plain)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if canInvite {
                Button(role: .destructive) {
                    memberToRemove = member
                } label: {
                    Label(locale.t("org.remove"), systemImage: "trash")
                }
            }
        }
    }

    @ViewBuilder
    private func permissionBadges(_ mask: Int) -> some View {
        let labels = permissionLabels(for: mask)
        if labels.isEmpty {
            Text(locale.t("org.noPermissions"))
                .font(.caption2)
                .foregroundStyle(Color.pfTextMuted)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(labels, id: \.self) { label in
                        Text(label)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.pfPrimary.opacity(0.12))
                            .foregroundStyle(Color.pfPrimary)
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var inviteSheet: some View {
        NavigationStack {
            Form {
                Section(locale.t("org.inviteByEmail")) {
                    TextField(locale.t("org.emailAddress"), text: $inviteEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                }
                if let inviteError {
                    Section {
                        Text(inviteError)
                            .foregroundStyle(PFColorToken.contentDanger)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(locale.t("org.inviteMember"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { showInviteSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("org.send")) {
                        Task { await sendInvite() }
                    }
                    .disabled(inviteEmail.trimmingCharacters(in: .whitespaces).isEmpty || isSendingInvite)
                    .overlay {
                        if isSendingInvite { ProgressView().scaleEffect(0.7) }
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder
    private func permissionsSheet(for member: OrgMemberResponse) -> some View {
        NavigationStack {
            Form {
                Section(String(format: locale.t("org.permissionsFor"), member.name)) {
                    permissionToggle(locale.t("org.permOperateGamesFull"), flag: OrgPermission.operateGames)
                    permissionToggle(locale.t("org.permCreateGamesFull"), flag: OrgPermission.createGames)
                    permissionToggle(locale.t("org.permDeleteGamesFull"), flag: OrgPermission.deleteGames)
                    permissionToggle(locale.t("org.permInviteMembersFull"), flag: OrgPermission.inviteMembers)
                    permissionToggle(locale.t("org.permManagePermsFull"), flag: OrgPermission.managePerms)
                    permissionToggle(locale.t("org.permManageBillingFull"), flag: OrgPermission.manageBilling)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(PFColorToken.contentDanger)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(locale.t("org.editPermissions"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { showPermissionsSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("operator.save")) {
                        Task { await savePermissions(for: member) }
                    }
                    .disabled(isSavingPermissions)
                    .overlay {
                        if isSavingPermissions { ProgressView().scaleEffect(0.7) }
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder
    private func permissionToggle(_ label: String, flag: Int) -> some View {
        Toggle(label, isOn: Binding(
            get: { OrgPermission.has(editedPermissions, flag) },
            set: { on in
                if on { editedPermissions |= flag } else { editedPermissions &= ~flag }
            }
        ))
    }

    // MARK: - Helpers

    private func permissionLabels(for mask: Int) -> [String] {
        var labels: [String] = []
        if OrgPermission.has(mask, OrgPermission.operateGames)  { labels.append(Translations.string("org.permOperateGames")) }
        if OrgPermission.has(mask, OrgPermission.createGames)   { labels.append(Translations.string("org.permCreateGames")) }
        if OrgPermission.has(mask, OrgPermission.deleteGames)   { labels.append(Translations.string("org.permDeleteGames")) }
        if OrgPermission.has(mask, OrgPermission.inviteMembers) { labels.append(Translations.string("org.permInviteMembers")) }
        if OrgPermission.has(mask, OrgPermission.managePerms)   { labels.append(Translations.string("org.permManagePerms")) }
        if OrgPermission.has(mask, OrgPermission.manageBilling) { labels.append(Translations.string("org.permManageBilling")) }
        return labels
    }

    private func deleteMember(at offsets: IndexSet) {
        for index in offsets {
            let member = members[index]
            memberToRemove = member
        }
    }

    // MARK: - Data Loading

    private func loadMembers() async {
        guard let token else { return }
        isLoading = true
        do {
            members = try await appState.apiClient.getOrgMembers(orgId: org.id, token: token)
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // MARK: - Actions

    private func sendInvite() async {
        guard let token else { return }
        let email = inviteEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else { return }
        isSendingInvite = true
        inviteError = nil
        do {
            let newMember = try await appState.apiClient.inviteOrgMember(
                orgId: org.id,
                request: InviteOrgMemberRequest(email: email),
                token: token
            )
            members.insert(newMember, at: 0)
            showInviteSheet = false
            successMessage = String(format: locale.t("org.inviteSentTo"), email)
            Task { try? await Task.sleep(for: .seconds(3)); successMessage = nil }
        } catch is CancellationError {
        } catch {
            inviteError = error.localizedDescription
        }
        isSendingInvite = false
    }

    private func removeMember(_ member: OrgMemberResponse) async {
        guard let token else { return }
        do {
            try await appState.apiClient.removeOrgMember(orgId: org.id, userId: member.userId, token: token)
            members.removeAll { $0.id == member.id }
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func savePermissions(for member: OrgMemberResponse) async {
        guard let token else { return }
        isSavingPermissions = true
        errorMessage = nil
        do {
            let updated = try await appState.apiClient.updateMemberPermissions(
                orgId: org.id,
                userId: member.userId,
                request: UpdatePermissionsRequest(permissions: editedPermissions),
                token: token
            )
            if let idx = members.firstIndex(where: { $0.id == member.id }) {
                members[idx] = updated
            }
            showPermissionsSheet = false
        } catch is CancellationError {
        } catch {
            errorMessage = error.localizedDescription
        }
        isSavingPermissions = false
    }
}
