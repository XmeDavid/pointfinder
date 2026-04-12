import Foundation

// MARK: - Workspace & Organization Models

struct WorkspaceResponse: Codable {
    let personal: PersonalWorkspace
    let organizations: [OrgWorkspace]
}

struct PersonalWorkspace: Codable {
    let tier: String
    let status: String
    let activeGames: Int
}

struct OrgWorkspace: Codable, Identifiable {
    let id: UUID
    let name: String
    let slug: String
    let tier: String
    let status: String
    let memberCount: Int
    let liveGames: Int
    let permissions: Int
}

struct OrgMemberResponse: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    let name: String
    let email: String
    let permissions: Int
}

// MARK: - Organization Request DTOs

struct CreateOrgRequest: Encodable {
    let name: String
}

struct InviteOrgMemberRequest: Encodable {
    let email: String
}

struct UpdatePermissionsRequest: Encodable {
    let permissions: Int
}

// MARK: - Permission Bitmask Helpers

enum OrgPermission {
    static let operateGames  = 1
    static let createGames   = 2
    static let deleteGames   = 4
    static let inviteMembers = 8
    static let managePerms   = 16
    static let manageBilling = 32

    static func has(_ mask: Int, _ permission: Int) -> Bool {
        mask & permission != 0
    }
}
