# Backend Endpoints Needed for Operator Management

This document lists the backend endpoints that need to be implemented to support the operator management functionality in the web admin panel.

## Admin Operator Management Endpoints

### 1. List All Operators
```
GET /api/admin/operators
Authorization: Bearer <admin_token>
Response: Array of operators with their details
```

**Response Format:**
```json
[
  {
    "id": "uuid",
    "email": "operator@example.com",
    "name": "John Doe",
    "createdAt": "2025-01-01T12:00:00Z",
    "gameCount": 5,
    "status": "active" // "active", "pending", "inactive"
  }
]
```

### 2. Invite New Operator
```
POST /api/admin/operators/invite
Authorization: Bearer <admin_token>
Body: { "email": "operator@example.com", "name": "John Doe" }
Response: Success message
```

**Expected Behavior:**
- Send invitation email with registration link
- Create pending operator record
- Return success response

### 3. Get Operator Details
```
GET /api/admin/operators/{operatorId}
Authorization: Bearer <admin_token>
Response: Operator details with their games
```

**Response Format:**
```json
{
  "id": "uuid",
  "email": "operator@example.com",
  "name": "John Doe",
  "createdAt": "2025-01-01T12:00:00Z",
  "status": "active",
  "games": [
    {
      "id": "uuid",
      "name": "Game Name",
      "status": "live",
      "createdAt": "2025-01-01T12:00:00Z",
      "teamCount": 3,
      "baseCount": 5
    }
  ]
}
```

### 4. Get Operator's Games
```
GET /api/admin/operators/{operatorId}/games
Authorization: Bearer <admin_token>
Response: Array of games created by this operator
```

### 5. Delete Operator
```
DELETE /api/admin/operators/{operatorId}
Authorization: Bearer <admin_token>
Response: Success message
```

**Expected Behavior:**
- Soft delete or mark as inactive
- Optionally transfer their games to another operator
- Return success response

### 6. Update Operator Status
```
PATCH /api/admin/operators/{operatorId}
Authorization: Bearer <admin_token>
Body: { "status": "active" | "inactive" }
Response: Updated operator details
```

## Operator Registration Endpoints

### 7. Register Operator (from invitation)
```
POST /api/operators/register
Body: { 
  "token": "invitation_token", 
  "email": "operator@example.com", 
  "password": "secure_password", 
  "name": "John Doe" 
}
Response: { "token": "jwt_token", "user": {...} }
```

### 8. Operator Login
```
POST /api/operators/login
Body: { "email": "operator@example.com", "password": "password" }
Response: { "token": "jwt_token", "user": {...} }
```

## Database Schema Updates Needed

### Operators Table
```sql
CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'inactive'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Operator Invitations Table
```sql
CREATE TABLE operator_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE
);
```

## Email Templates Needed

### Operator Invitation Email
- Subject: "You've been invited to join DBV NFC Games"
- Content: Registration link with token
- Expiration notice (24 hours)

## Security Considerations

1. **Invitation Tokens**: Should expire after 24 hours
2. **Password Requirements**: Minimum 8 characters, complexity rules
3. **Rate Limiting**: Prevent abuse of invitation endpoint
4. **Email Validation**: Verify email format and domain
5. **Admin Only**: All admin endpoints should require admin role

## Implementation Priority

1. **High Priority** (Core functionality):
   - `GET /api/admin/operators` - List operators
   - `POST /api/admin/operators/invite` - Invite operator
   - `POST /api/operators/register` - Register from invitation
   - `POST /api/operators/login` - Operator login

2. **Medium Priority** (Enhanced features):
   - `GET /api/admin/operators/{id}` - Operator details
   - `GET /api/admin/operators/{id}/games` - Operator games
   - `DELETE /api/admin/operators/{id}` - Delete operator

3. **Low Priority** (Nice to have):
   - `PATCH /api/admin/operators/{id}` - Update status
   - Bulk operations
   - Operator activity logs

## Testing Requirements

1. **Admin Authentication**: Verify only admins can access operator management
2. **Invitation Flow**: Test complete invitation → registration → login flow
3. **Email Delivery**: Verify invitation emails are sent correctly
4. **Token Expiration**: Test invitation token expiration
5. **Error Handling**: Test invalid tokens, duplicate emails, etc.
6. **Data Integrity**: Verify operator deletion doesn't break games
