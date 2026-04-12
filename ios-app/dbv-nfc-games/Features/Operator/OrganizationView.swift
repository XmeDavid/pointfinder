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
                HStack(spacing: PFSpacing.itemGap) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(org.name)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.pfText)
                        Text("@\(org.slug)")
                            .font(.subheadline)
                            .foregroundStyle(Color.pfTextMuted)
                    }
                    Spacer()
                    tierBadge(org.tier)
                }
                .padding(.vertical, 4)

                HStack(spacing: PFSpacing.sectionGap) {
                    statPill(label: "Members", value: "\(org.memberCount)", icon: "person.2")
                    statPill(label: "Live Games", value: "\(org.liveGames)", icon: "gamecontroller")
                }
                .padding(.vertical, 2)
            }

            // Members section
            Section("Members") {
                if isLoading {
                    ProgressView("Loading members…")
                } else if members.isEmpty {
                    Text("No members yet.")
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
                        Label("Invite Member", systemImage: "person.badge.plus")
                            .foregroundStyle(Color.pfPrimary)
                    }
                }
            }

            if let successMessage {
                Section {
                    Text(successMessage)
                        .foregroundStyle(.green)
                        .font(.caption)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
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
        .alert("Remove Member", isPresented: Binding(
            get: { memberToRemove != nil },
            set: { if !$0 { memberToRemove = nil } }
        )) {
            Button("Remove", role: .destructive) {
                if let m = memberToRemove { Task { await removeMember(m) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove \(memberToRemove?.name ?? "") from \(org.name)?")
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
                    Label("Remove", systemImage: "trash")
                }
            }
        }
    }

    @ViewBuilder
    private func permissionBadges(_ mask: Int) -> some View {
        let labels = permissionLabels(for: mask)
        if labels.isEmpty {
            Text("No permissions")
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
                Section("Invite by Email") {
                    TextField("Email address", text: $inviteEmail)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                }
                if let inviteError {
                    Section {
                        Text(inviteError)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Invite Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showInviteSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
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
                Section("Permissions for \(member.name)") {
                    permissionToggle("Operate Games", flag: OrgPermission.operateGames)
                    permissionToggle("Create Games", flag: OrgPermission.createGames)
                    permissionToggle("Delete Games", flag: OrgPermission.deleteGames)
                    permissionToggle("Invite Members", flag: OrgPermission.inviteMembers)
                    permissionToggle("Manage Permissions", flag: OrgPermission.managePerms)
                    permissionToggle("Manage Billing", flag: OrgPermission.manageBilling)
                }
                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Edit Permissions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showPermissionsSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
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

    @ViewBuilder
    private func tierBadge(_ tier: String) -> some View {
        Text(tier.uppercased())
            .font(.caption2)
            .fontWeight(.bold)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tierColor(tier).opacity(0.15))
            .foregroundStyle(tierColor(tier))
            .clipShape(Capsule())
    }

    @ViewBuilder
    private func statPill(label: String, value: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
            Text(value)
                .font(.caption)
                .fontWeight(.semibold)
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.pfTextMuted)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.pfCard)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(Color.pfCardBorder, lineWidth: 0.5))
    }

    // MARK: - Helpers

    private func tierColor(_ tier: String) -> Color {
        switch tier.lowercased() {
        case "pro": return .pfPrimary
        case "enterprise": return Color(red: 0.6, green: 0.3, blue: 1.0)
        default: return Color.pfTextMuted
        }
    }

    private func permissionLabels(for mask: Int) -> [String] {
        var labels: [String] = []
        if OrgPermission.has(mask, OrgPermission.operateGames)  { labels.append("Operate") }
        if OrgPermission.has(mask, OrgPermission.createGames)   { labels.append("Create") }
        if OrgPermission.has(mask, OrgPermission.deleteGames)   { labels.append("Delete") }
        if OrgPermission.has(mask, OrgPermission.inviteMembers) { labels.append("Invite") }
        if OrgPermission.has(mask, OrgPermission.managePerms)   { labels.append("Perms") }
        if OrgPermission.has(mask, OrgPermission.manageBilling) { labels.append("Billing") }
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
            successMessage = "Invite sent to \(email)"
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
