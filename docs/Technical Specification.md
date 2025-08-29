# DBV NFC Games - Technical Specification

**Version:** 1.0  
**Date:** December 2024  
**Target Audience:** Portuguese (with future English support)

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture & Components](#architecture--components)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Core Game Mechanics](#core-game-mechanics)
5. [Data Models](#data-models)
6. [User Workflows](#user-workflows)
7. [Technical Requirements](#technical-requirements)
8. [Security & Fair Play](#security--fair-play)
9. [Real-time Features](#real-time-features)
10. [Error Handling](#error-handling)

---

## System Overview

### Purpose
DBV NFC Games is a physical adventure game platform designed for organized group events (primarily scouting activities). Teams physically visit real-world locations ("bases") to solve challenges ("enigmas") using NFC technology for validation and progress tracking.

### Core Concept
- **Physical Adventure Gaming**: Teams move between real locations to solve puzzles
- **NFC-Based Validation**: Physical presence is verified through NFC tag interactions
- **Competitive Progression**: Teams compete by completing bases quickly and accurately
- **Controlled Access**: Invite-only system prevents unauthorized participation
- **Real-time Monitoring**: Operators track team progress and locations live

### Scale & Limitations
- **Target Size**: Up to 100 people per event
- **Concurrent Games**: One active game at a time initially
- **Languages**: Portuguese primary, English future consideration
- **Platforms**: Web admin panel + iOS mobile app

---

## Architecture & Components

### System Components

#### 1. **Web Admin Panel** (Next.js)
- **Purpose**: Game creation, management, and monitoring
- **Users**: Admins and Operators
- **Key Features**:
  - Game setup and configuration
  - Team and base management
  - Real-time monitoring and dashboards
  - Event logging and analytics
  - Export functionality

#### 2. **Mobile App** (iOS Swift)
- **Purpose**: Player interaction and gameplay
- **Users**: Team members (players)
- **Key Features**:
  - Team joining via invite codes
  - NFC tag reading for base interactions
  - Enigma solving interface
  - Location tracking and offline sync
  - Anti-cheating measures

#### 3. **Backend API** (Go + Fiber)
- **Purpose**: Core game logic and data management
- **Key Features**:
  - RESTful API with JWT authentication
  - WebSocket real-time updates
  - PostgreSQL database with JSONB
  - NFC tag management
  - Transaction-based operations

### Technology Stack

- **Backend**: Go 1.22+, Fiber web framework, PostgreSQL 15+
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Mobile**: iOS (Swift), NFC capabilities required
- **Real-time**: WebSocket connections
- **Authentication**: JWT tokens, device-based identification
- **Database**: PostgreSQL with JSONB for flexible game data

---

## User Roles & Permissions

### 1. **Admin**
- **Primary Role**: Platform management and operator oversight
- **Key Responsibilities**:
  - Manage operator accounts (create, suspend, remove)
  - Send operator invitations via email
  - Full CRUD access for troubleshooting and data issues
  - System monitoring and maintenance

**Permissions**: Full access to all system functions

### 2. **Operator** (Game Organizer)
- **Primary Role**: Create and manage specific games
- **Key Responsibilities**:
  - Create games with bases, teams, and enigmas
  - Configure game rules and setup
  - Link NFC tags to bases (mobile app)
  - Monitor game progress in real-time
  - Manage team assignments and leadership

**Permissions**: 
- Equal access for all operators within a game (no creator/collaborator distinction)
- Any operator in a game can add/remove other operators
- Full CRUD access to their assigned games
- Cannot access other operators' games unless invited

### 3. **Player** (Team Member)
- **Primary Role**: Participate in games as team members
- **Key Responsibilities**:
  - Join teams using invite codes
  - Participate in base visits and enigma solving
  - Follow fair play rules

**Permissions**:
- **Team Leader**: Can tap NFC tags for base interactions
- **Team Member**: Can view game state and contribute to solving
- No web access (mobile app only)

### Authentication Model

#### Web Users (Admin/Operator)
- Email/password authentication
- JWT tokens for session management
- Role-based access control

#### Mobile Users (Players)
- Device-based identification (no registration required)
- Team invite code for initial access
- Device UUID as persistent identifier
- Optional display name for team identification

---

## Core Game Mechanics

### Game States
1. **Setup**: Game creation and configuration phase
2. **Live**: Active gameplay with teams participating
3. **Finished**: Game completed, results available

### Game Lifecycle

#### 1. **Setup Phase**
**Requirements to Go Live:**
- At least 1 base created
- At least 1 team created
- At least 1 enigma created
- All bases linked to NFC tags
- Enigmas assigned (automatic for non-location-dependent)

**Actions Available:**
- Create/edit bases with GPS coordinates
- Create/edit enigmas with content and answers
- Create teams with invite codes
- Link bases to physical NFC tags (mobile app)

#### 2. **Live Phase**
**Team Gameplay Flow:**
1. **Base Arrival**: Team leader taps NFC tag → "arrived" status
2. **Enigma Solving**: Team views enigma content and submits answer
3. **Answer Validation**: System validates answer (offline capable)
4. **Base Completion**: After correct answer, leader taps NFC again → "completed"
5. **Progress Tracking**: Timestamps recorded for all actions

**Fair Play Enforcement:**
- Only team leader can tap NFC tags
- Teams cannot start new bases until current one completed
- Location tracking validates team presence
- Answer validation prevents cheating

#### 3. **Finished Phase**
**Available Actions:**
- View final results and statistics
- Export game data and reports
- Analyze team performance and timing

### Base and Enigma System

#### Base Types
**All bases require physical NFC tags for interaction**

#### Enigma Types
1. **Location-Dependent Enigmas**
   - Permanently tied to specific bases
   - Content references physical objects/clues at location
   - Same enigma for all teams at that base
   - Example: "Count the red balls hidden here" (answer: actual count)

2. **Location-Independent Enigmas**
   - Can be assigned to any base
   - Randomly distributed at game start
   - Different teams may get different enigmas at same base
   - Prevents answer sharing between teams

#### Dynamic Assignment Logic
- At game start, non-location-dependent enigmas are randomly assigned
- Assignment ensures variety: teams get different combinations
- More enigmas than bases allowed for increased variety
- Example: 3 enigmas for 2 bases → Team A gets (Enigma 1, Enigma 2), Team B gets (Enigma 2, Enigma 3)

---

## Data Models

### Core Entities

#### Games
```sql
- id (uuid)
- name (text)
- status (setup|live|finished)
- rules_html (rich text content)
- bases (jsonb array)
- enigmas (jsonb array)
- bases_linked (boolean flag)
- created_by_operator_id (uuid)
- created_at, updated_at (timestamps)
```

#### Teams
```sql
- id (uuid)
- name (text)
- game_id (uuid, foreign key)
- invite_code (unique text)
- members (jsonb array of names)
- leader_device_id (text)
- active_base_id (uuid, current location)
- created_at (timestamp)
```

#### Progress Tracking
```sql
- team_id, base_id (composite primary key)
- arrived_at (timestamp)
- solved_at (timestamp)
- completed_at (timestamp)
- score (integer)
- nfc_tag_uuid (text, verification)
```

#### NFC Tags
```sql
- id (uuid)
- tag_uuid (unique identifier from hardware)
- game_id (uuid, foreign key)
- base_id (text, references base in game.bases)
- is_active (boolean)
- linked_at (timestamp)
```

#### Location Tracking
```sql
- id (uuid)
- team_id (uuid, foreign key)
- latitude, longitude (coordinates)
- accuracy (meters)
- device_id (text)
- created_at (timestamp)
```

### JSONB Structures

#### Base Object
```json
{
  "id": "base-uuid",
  "name": "Base Name",
  "description": "Optional description",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "isLocationDependent": true,
  "nfcLinked": false,
  "enigmaId": "optional-enigma-id"
}
```

#### Enigma Object
```json
{
  "id": "enigma-uuid",
  "title": "Enigma Title",
  "content": "Enigma description/question",
  "answer": "Correct answer",
  "answerTemplate": "Answer + <teamId>",
  "points": 10,
  "isLocationDependent": false,
  "mediaType": "image|video|youtube",
  "mediaUrl": "https://...",
  "baseId": "optional-base-assignment"
}
```

---

## User Workflows

### Operator Workflow

#### 1. **Game Creation**
1. Login to web admin panel
2. Create new game with name and rules
3. Add bases using map interface (GPS coordinates auto-captured)
4. Create enigmas with content editor
5. Create teams with auto-generated invite codes
6. Review setup checklist

#### 2. **NFC Setup (Mobile App)**
1. Login to mobile app as operator
2. Enter NFC setup mode for game
3. Visit each base location
4. Tap physical NFC tag to write base UUID
5. Confirm linking in app
6. Repeat for all bases

#### 3. **Game Launch**
1. Verify all setup requirements met:
   - All bases have NFC tags linked
   - At least one team created
   - At least one enigma created
2. Click "Go Live" in web admin
3. System performs final validation
4. Game enters Live state

#### 4. **Game Monitoring**
1. Real-time dashboard shows:
   - Team locations on map
   - Base completion status
   - Event feed with timestamps
2. Toggle map elements (teams, bases)
3. Monitor team progress tables
4. Export data when game finished

### Player Workflow

#### 1. **Team Joining**
1. Download mobile app
2. Enter team invite code
3. Set display name
4. Automatic assignment as member or leader
5. Wait for game to go live

#### 2. **Gameplay Loop**
1. **Arrive at Base**:
   - Team leader taps NFC tag
   - App confirms base arrival
   - Enigma content displayed
   
2. **Solve Enigma**:
   - Team collaborates to solve puzzle
   - Enter answer in app
   - Submit for validation
   - App confirms if correct (required to proceed)
   
3. **Complete Base**:
   - Team leader taps NFC tag again
   - App records completion timestamp
   - Progress updated for all team members
   
4. **Move to Next Base**:
   - Select next base from list/map
   - Repeat cycle

#### 3. **Game Completion**
1. Complete all available bases
2. View final score and statistics
3. Wait for operator to finish game
4. Final results available

### Admin Workflow

#### 1. **Operator Management**
1. Login to admin panel
2. View operator list and status
3. Send invitation emails to new operators
4. Monitor operator activity
5. Suspend/remove operators if needed

#### 2. **System Oversight**
1. Monitor system health and usage
2. Access any game for troubleshooting
3. View system-wide statistics
4. Handle technical issues

---

## Technical Requirements

### Performance Requirements
- **Response Time**: < 200ms for API calls, < 1s for page loads
- **Location Updates**: Every minute per player + on NFC interactions
- **WebSocket Heartbeat**: 30-second intervals
- **Database**: Connection pooling, indexed queries
- **Caching**: None required initially (small scale)

### Scalability Considerations
- **Concurrent Users**: Up to 100 per game
- **Database**: PostgreSQL with JSONB for flexible schema
- **Real-time**: WebSocket connections per operator
- **File Storage**: Local storage initially, cloud storage for scale

### Mobile Requirements
- **iOS Version**: iOS 14+ (NFC support)
- **NFC Capability**: Required for team leaders
- **Offline Support**: Cache game data, sync when online
- **Location Permissions**: Required for tracking
- **Storage**: Local SQLite for offline data

### Security Requirements
- **Authentication**: JWT tokens, secure password storage
- **Data Validation**: Input sanitization, SQL injection prevention
- **Rate Limiting**: API endpoints protected
- **HTTPS**: All communications encrypted
- **Database**: Foreign key constraints, transaction safety

---

## Security & Fair Play

### Anti-Cheating Measures

#### Technical Prevention
1. **NFC Validation**: Physical presence required for base interactions
2. **Leader-Only Access**: Only team leader can tap NFC tags
3. **Location Tracking**: Continuous GPS monitoring during gameplay
4. **Answer Validation**: Server-side verification of enigma solutions
5. **Screenshot Blocking**: iOS app prevents screen capture during enigmas
6. **Offline Protection**: Game data cached locally, answers validated offline

#### Behavioral Rules
1. **Team Unity**: Teams must stay together (leader proximity enforced)
2. **Sequential Progress**: Cannot start new base until current one completed
3. **Physical Presence**: Location pinging validates team positions
4. **Time Tracking**: All interactions timestamped for audit

### Monitoring Tools
1. **Real-time Location Tracking**: Operator dashboard shows team positions
2. **Event Logging**: All game actions recorded with timestamps
3. **Progress Auditing**: Complete trail of team movements and solutions
4. **Alert System**: Suspicious behavior flagged for operator review

---

## Real-time Features

### WebSocket Implementation
- **Connection Management**: Per-operator connections to game-specific channels
- **Message Types**:
  - `team_location`: Location updates
  - `base_arrival`: Team arrives at base
  - `base_complete`: Team completes base
  - `enigma_solved`: Enigma successfully solved
  - `heartbeat`: Connection health check

### Update Frequency
- **Location Updates**: Every minute + on significant events
- **Progress Updates**: Immediate on base interactions
- **Connection Health**: 30-second heartbeat intervals
- **Fallback Polling**: If WebSocket fails, 10-second polling

### Operator Dashboard Features
- **Live Map**: Team positions, base states, real-time updates
- **Progress Tables**: Team completion status, scores, timing
- **Event Feed**: Chronological activity log
- **Toggleable Elements**: Show/hide teams, bases, paths
- **Alert Notifications**: Important events highlighted

---

## Error Handling

### Client-Side Error Handling
1. **Network Failures**: Offline mode with local caching
2. **Invalid Inputs**: Real-time validation with user feedback
3. **Permission Errors**: Clear messaging for authentication issues
4. **Device Issues**: NFC troubleshooting guides and fallbacks

### Server-Side Error Handling
1. **Database Failures**: Transaction rollback, consistent state
2. **Validation Errors**: Detailed error messages with corrective actions
3. **Concurrent Access**: Optimistic locking, conflict resolution
4. **Resource Limits**: Graceful degradation, user notification

### Data Integrity
1. **Foreign Key Constraints**: Prevent orphaned records
2. **Transaction Safety**: Atomic operations for critical paths
3. **Backup Strategy**: Regular database backups
4. **Audit Trail**: Complete history of system changes

---

## Future Considerations

### Scalability Enhancements
- Multiple concurrent games
- Cloud infrastructure deployment
- CDN for media content
- Advanced caching strategies

### Feature Extensions
- Multi-language support (i18n)
- Advanced scoring systems
- Team communication tools
- Game templates and presets
- Integration with external systems

### Platform Expansion
- Android mobile app
- Progressive Web App (PWA)
- API for third-party integrations
- White-label deployment options

---

## Implementation Status

### Completed Features ✅
- Core backend API with authentication
- PostgreSQL database with proper constraints
- Web admin panel with game management
- iOS mobile app with NFC support
- WebSocket real-time monitoring
- Team joining and basic gameplay flow
- NFC tag management system

### In Progress / Pending Features ⚠️
- Dynamic enigma assignment logic
- Team leader reassignment UI
- Complete NFC tag writing (mobile)
- Enhanced go-live validation
- Portuguese UI localization
- Offline sync capabilities
- Export functionality
- Advanced monitoring features

---

*This specification serves as the authoritative reference for system behavior and requirements. All implementation decisions should align with this document, and updates should be reflected here for consistency.*