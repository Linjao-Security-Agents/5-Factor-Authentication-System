# Liggy Security Agents (LSA) - 5-Factor Authentication System

A robust, web-based Multi-Factor Authentication (MFA) system that implements five distinct authentication factors for enhanced security.

## Features

- **Five-Factor Authentication**
  1. Password Authentication
  2. Email Verification
  3. Phone Verification
  4. Security Questions
  5. Time-based One-Time Password (TOTP)

- **Comprehensive Security Features**
  - Session Management
  - Authentication History
  - Active Session Monitoring
  - Device Tracking
  - Secure Password Hashing

## Tech Stack

- Frontend: React + TypeScript
- Backend: Express.js
- Authentication: Passport.js
- State Management: TanStack Query
- UI Components: shadcn/ui
- Styling: Tailwind CSS

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Authentication Flow

1. **Registration**
   - Create account with username, password, email, and phone
   - Set up security questions
   - TOTP secret generation

2. **Login Process**
   - Password verification
   - Email code verification
   - Phone code verification
   - Security questions validation
   - TOTP code verification

3. **Session Management**
   - View active sessions
   - Revoke sessions
   - Monitor authentication history

## Security Considerations

- Passwords are securely hashed using scrypt
- Session tokens are securely stored
- Comprehensive audit logging
- Rate limiting on authentication attempts
- Secure session management

## API Routes

### Authentication
- `POST /api/register` - Create new user account
- `POST /api/login` - Authenticate user
- `POST /api/logout` - End user session

### Verification
- `POST /api/verify/email` - Verify email
- `POST /api/verify/phone` - Verify phone
- `POST /api/verify/security-questions` - Verify security questions
- `POST /api/verify/totp` - Verify TOTP code

### Session Management
- `GET /api/sessions` - List active sessions
- `DELETE /api/sessions/:id` - Revoke specific session
- `GET /api/auth-history` - View authentication history

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for any purpose.
