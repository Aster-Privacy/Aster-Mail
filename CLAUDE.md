# Aster Privacy - AI Coding Agent Instructions

## Critical Conventions

### MANDATORY: snake_case Naming
**ALWAYS use snake_case (all lowercase with underscores) for ALL identifiers**
- Variables: `user_name`, `is_loading`, `theme_config`
- Functions: `handle_click`, `fetch_user_data`, `render_component`
- Components: `theme_switch`, `default_layout`, `index_page`
- Files: `theme_switch.tsx`, `default_layout.tsx`, `index_page.tsx`

**If NOT using snake_case, you CANNOT make edits. This is non-negotiable.**

### Code Quality Standards
- **NEVER add code comments** - code must be self-documenting through clear naming
- Write production-grade code: clean, fast, optimized, engineered for performance
- No explanatory comments, documentation comments, or inline comments of any kind
- Let code structure and naming convey intent

---

## Rust Backend Standards

### Core Principles
- **Zero-cost abstractions** - prefer compile-time guarantees over runtime checks
- **Explicit over implicit** - no hidden behavior, clear data flow
- **Fail fast** - validate inputs at boundaries, propagate errors explicitly
- **Minimal allocations** - prefer borrowing, use `Cow<str>` when ownership is conditional

### Error Handling

#### Use `thiserror` for Library Errors
```rust
#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("key generation failed: {0}")]
    KeyGeneration(String),
    #[error("encryption failed")]
    Encryption(#[from] pgp::errors::Error),
    #[error("invalid key format")]
    InvalidKeyFormat,
}
```

#### Use `anyhow` for Application Errors
```rust
use anyhow::{Context, Result};

async fn load_user(id: Uuid) -> Result<User> {
    sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", id)
        .fetch_one(&pool)
        .await
        .context("failed to load user")
}
```

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Types, Traits | PascalCase | `UserRepository`, `Encryptable` |
| Functions, Methods | snake_case | `generate_keypair`, `verify_signature` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_KEY_SIZE`, `DEFAULT_ITERATIONS` |
| Modules | snake_case | `key_manager`, `auth_handler` |
| Type Parameters | Single uppercase or descriptive | `T`, `E`, `Key`, `Value` |
| Lifetimes | Short lowercase | `'a`, `'de`, `'key` |

### Type Design

#### Newtype Pattern for Type Safety
```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(Uuid);

#[derive(Debug, Clone, Zeroize, ZeroizeOnDrop)]
pub struct PrivateKey(Vec<u8>);
```

#### Builder Pattern for Complex Construction
```rust
pub struct KeyGeneratorBuilder {
    bits: u32,
    algorithm: Algorithm,
}

impl KeyGeneratorBuilder {
    pub fn new() -> Self { ... }
    pub fn bits(mut self, bits: u32) -> Self { ... }
    pub fn build(self) -> Result<KeyGenerator> { ... }
}
```

### Memory Safety for Cryptographic Code

#### Zeroize Sensitive Data
```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SecretKey {
    key_material: Vec<u8>,
}
```

### API Design

#### Request/Response Types
```rust
#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 12))]
    pub password: String,
    pub public_key: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub user_id: Uuid,
    pub token: String,
}
```

#### Handler Pattern
```rust
pub async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, AppError> {
    request.validate()?;
    let user = state.user_service.register(request).await?;
    Ok(Json(RegisterResponse { user_id: user.id, token }))
}
```

### Backend Project Structure
```
backend/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point, server setup
│   ├── config.rs            # Configuration loading
│   ├── error.rs             # Application error types
│   ├── api/
│   │   ├── mod.rs           # Router composition
│   │   ├── auth.rs          # Authentication endpoints
│   │   ├── keys.rs          # Key management endpoints
│   │   └── messages.rs      # Message endpoints
│   ├── db/
│   │   ├── mod.rs           # Database connection
│   │   └── models.rs        # Database models
│   └── middleware/
│       ├── mod.rs           # Middleware exports
│       └── auth.rs          # JWT validation
├── aster-crypto/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs           # Public API
│       ├── error.rs         # Crypto errors
│       ├── keys.rs          # Key generation
│       ├── encrypt.rs       # Encryption
│       ├── decrypt.rs       # Decryption
│       ├── sign.rs          # Signatures
│       └── password.rs      # Password hashing
└── migrations/
    └── *.sql                # Database migrations
```

### Dependencies - Preferred Crates
| Purpose | Crate |
|---------|-------|
| Web Framework | `axum` |
| Database | `sqlx` with compile-time checks |
| Serialization | `serde` + `serde_json` |
| Error Handling | `thiserror` (lib), `anyhow` (app) |
| Async Runtime | `tokio` |
| Cryptography | `pgp`, `argon2`, `rand` |
| Validation | `validator` |
| JWT | `jsonwebtoken` |
| Logging | `tracing` + `tracing-subscriber` |

### Running the Backend

```bash
cd backend
export DATABASE_URL="postgres://user:pass@localhost/astermail"
export JWT_SECRET="your-secret-key"
cargo run
```

---

## Frontend Architecture

### Tech Stack
- **Framework**: React 18.3 + TypeScript 5.6
- **Build Tool**: Vite 6.4 with HMR
- **UI Library**: HeroUI v2 (built on React Aria)
- **Styling**: Tailwind CSS v4 + Tailwind Variants
- **Routing**: React Router DOM v6
- **PWA**: Vite PWA plugin with Workbox
- **Animation**: Framer Motion 11

### Project Structure
```
src/
├── components/     Component library (Navbar, ThemeSwitch, icons)
├── config/        Site configuration (site.ts)
├── layouts/       Layout wrappers (default.tsx)
├── pages/         Route pages (index, docs, pricing, blog, about)
├── styles/        Global CSS
└── types/         TypeScript definitions
```

### Key Patterns

#### Component Architecture
- **Pages** = Route components in `src/pages/*.tsx`, imported in App.tsx
- **Layouts** = Wrapper components providing structure (Navbar + main + footer)
- **Components** = Reusable UI components using HeroUI primitives
- Default exports for pages/layouts, named exports for components

#### Styling with Tailwind Variants
Use `tailwind-variants` for component styling patterns (see primitives.ts):
```tsx
import { tv } from "tailwind-variants";

export const title = tv({
  base: "tracking-tight inline font-semibold",
  variants: {
    color: { violet: "from-[#FF1CF7] to-[#b249f8]" },
    size: { sm: "text-3xl lg:text-4xl" }
  },
  defaultVariants: { size: "md" }
});
```

#### HeroUI Integration
- Use HeroUI components from `@heroui/*` packages
- Custom router integration via Provider wrapping `HeroUIProvider`
- Theme switching via `useTheme()` from `@heroui/use-theme`

#### Path Aliases
- `@/*` resolves to `src/*` (configured in tsconfig.json)
- Always use path aliases: `import { siteConfig } from "@/config/site"`

### Development Workflow

#### Commands
```bash
npm run dev       # Start dev server (port auto-assigned by Vite)
npm run build     # TypeScript check + production build
npm run lint      # ESLint auto-fix
npm run preview   # Preview production build
```

#### PWA Development
- Service worker auto-registers in main.tsx
- PWA manifest configured in vite.config.ts
- Dev mode PWA enabled for testing offline features

### Configuration Files

#### ESLint (eslint.config.mjs)
- React hooks rules enforced
- No console warnings
- Auto-removes unused imports
- Prettier integration
- JSX a11y checks enabled

#### TypeScript
- Strict mode enabled
- Path aliases configured
- React JSX transform (no React import needed)
- Unused locals/parameters flagged

#### Tailwind
- HeroUI plugin included
- Dark mode via class strategy
- Content paths cover all component locations

### State Management
- No global state library - React Context for theming
- URL state via React Router
- Component-level state with hooks

### Data Flow
- siteConfig exports navigation/link configuration
- Route definitions centralized in App.tsx
- Theme state managed by HeroUI provider

### Adding New Pages
1. Create page component in `src/pages/your_page.tsx`
2. Add route in App.tsx: `<Route element={<YourPage />} path="/your-route" />`
3. Optionally add nav link to site.ts `navItems` array

### Common Patterns
- Responsive classes: `hidden lg:flex`, `sm:basis-full`
- External links: `<Link isExternal href={url}>`
- Icons from icons.tsx as React components
- Gradient text via `bg-clip-text text-transparent bg-gradient-to-b`

---

## Security Standards (MANDATORY)

**Security is non-negotiable. Every line of code must be written with a security-first mindset. Aster is a privacy company — our users trust us with their most sensitive data. Betray that trust with sloppy security and you break everything we stand for.**

### Core Security Principles

1. **Defense in depth** - never rely on a single layer of protection
2. **Least privilege** - grant minimum permissions required for any operation
3. **Fail securely** - errors must never expose internal state, stack traces, or sensitive data
4. **Zero trust** - validate everything at every boundary, even between internal services
5. **Secure by default** - every default configuration must be the most restrictive option

### Input Validation & Injection Prevention

#### MANDATORY for ALL User Input
- **Validate type, length, format, and range** on every input at the boundary where it enters the system
- **Use parameterized queries exclusively** - NEVER concatenate user input into SQL, commands, or templates
- **Reject unexpected input** - use allowlists, not denylists

#### SQL Injection
```rust
// CORRECT - parameterized query
sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", user_id)

// NEVER DO THIS
format!("SELECT * FROM users WHERE id = {}", user_id)
```

#### Command Injection
- NEVER pass user input to `std::process::Command` without strict validation
- NEVER use shell interpolation with user-controlled values
- Use typed arguments, not string concatenation

#### XSS Prevention (Frontend)
- NEVER use `dangerouslySetInnerHTML` unless the content has been sanitized with a proven library (e.g., DOMPurify) AND there is no alternative
- Always escape dynamic content rendered into HTML
- Use Content-Security-Policy headers on all responses
- Treat all data from APIs as untrusted when rendering

#### Path Traversal
- NEVER construct file paths from user input without canonicalization and validation
- Reject any input containing `..`, null bytes, or path separators
- Validate the resolved path is within the expected directory

### Authentication & Authorization

- **Verify authorization on every request** - never trust client-side state
- **Use constant-time comparison** for tokens, hashes, and secrets
- **Enforce rate limiting** on all authentication endpoints
- **Session tokens must be cryptographically random** with sufficient entropy (minimum 256 bits)
- **JWT tokens must have short expiration times** and be validated fully (signature, expiry, issuer, audience)
- **Never expose whether a user exists** in error messages (use generic "invalid credentials" responses)

### Cryptographic Standards

- **Use only well-established algorithms** - AES-256-GCM, ChaCha20-Poly1305, Ed25519, X25519, Argon2id, SHA-256/SHA-512
- **NEVER implement custom cryptographic algorithms or protocols**
- **NEVER use deprecated algorithms** - no MD5, SHA1 (for security), DES, RC4, ECB mode, PKCS#1 v1.5
- **Use cryptographically secure random number generators** (`rand::rngs::OsRng` in Rust, `crypto.getRandomValues` in JS)
- **Zeroize all secrets from memory** when no longer needed using the `zeroize` crate
- **Never log, serialize, or expose cryptographic key material**
- **Use appropriate key derivation** - Argon2id for passwords, HKDF for deriving subkeys
- **Nonces must never be reused** with the same key

### Secret Management

- **NEVER hardcode secrets** - no API keys, passwords, tokens, or private keys in source code
- **NEVER commit secrets** - use `.env` files (gitignored) or environment variables
- **NEVER log secrets** - mask or redact any sensitive values before logging
- **Secrets in memory** must be zeroized after use and never cloned unnecessarily
- **Database credentials, JWT secrets, API keys** must come from environment variables or a secrets manager

### Error Handling & Information Disclosure

- **NEVER expose stack traces, internal paths, or system information** to end users
- **Log detailed errors server-side** but return only generic, safe error messages to clients
- **NEVER include sensitive data in error messages** - no emails, IDs, tokens, or internal identifiers in user-facing errors
- **Use structured error types** that separate internal detail from public-facing messages
- **HTTP error responses must not leak implementation details** (e.g., database type, library versions, file paths)

### Dependency Security

- **Audit dependencies before adding them** - check for known vulnerabilities, maintenance status, and trustworthiness
- **Keep dependencies up to date** - outdated dependencies are a primary attack vector
- **Use `cargo audit`** (Rust) and `npm audit` (Node.js) regularly
- **Minimize dependency surface area** - fewer dependencies = fewer attack vectors
- **Pin dependency versions** in production builds
- **Never use deprecated or unmaintained crates/packages** for security-critical functionality

### API Security

- **Enforce HTTPS everywhere** - never allow unencrypted connections
- **Set security headers on all responses**: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- **Validate Content-Type** on all requests accepting body data
- **Implement request size limits** to prevent resource exhaustion
- **Use CORS restrictively** - only allow specific, known origins
- **Rate limit all endpoints** - especially authentication, registration, and password reset

### Database Security

- **Use parameterized queries exclusively** - no exceptions
- **Apply least-privilege database roles** - application accounts should never have DDL or SUPERUSER permissions
- **Encrypt sensitive data at rest** - encryption keys managed separately from the database
- **Never store plaintext passwords** - use Argon2id with appropriate parameters
- **Audit database access patterns** and log queries that access sensitive tables

### Security Review Checklist

**Before every commit, verify:**
- [ ] No hardcoded secrets, tokens, or credentials
- [ ] All user input is validated and sanitized at the system boundary
- [ ] All SQL queries use parameterized statements
- [ ] No sensitive data in logs or error messages exposed to users
- [ ] Authentication and authorization checks on every protected endpoint
- [ ] Cryptographic operations use approved algorithms and libraries
- [ ] Secrets are zeroized from memory after use
- [ ] Dependencies are audited and up to date
- [ ] No debug code, test credentials, or development backdoors remain
- [ ] CORS, CSP, and security headers are properly configured

---

## Privacy Standards (MANDATORY)

**Aster Privacy exists to protect user privacy. This is not a feature — it is our identity. Every design decision, every line of code, every data flow must reflect this commitment.**

### Core Privacy Principles

1. **Zero-knowledge architecture** - the server must never have access to plaintext user content
2. **Data minimization** - collect only what is strictly necessary for the service to function
3. **No PII collection** - never collect, store, or transmit personally identifiable information beyond what the user explicitly provides for account functionality
4. **User data sovereignty** - users own their data and must be able to export or delete it completely
5. **Transparency** - every data flow must be explainable and justifiable

### PII Rules (NON-NEGOTIABLE)

- **NEVER collect, log, or store PII** that is not strictly required for core service functionality
- **PII includes**: full names, physical addresses, phone numbers, IP addresses, device fingerprints, geolocation data, biometric data, government IDs, financial information
- **NEVER add analytics, tracking pixels, telemetry, or third-party tracking scripts**
- **NEVER send user data to third-party services** unless the user has explicitly opted in and the service is essential
- **Email addresses** are the only PII stored, and only because they are required for the email service to function
- **NEVER correlate user activity** across sessions, devices, or services for profiling purposes
- **IP addresses must not be stored permanently** - if needed for rate limiting, use short-lived in-memory storage only

### Data Handling

- **Encrypt all user content client-side** before it reaches the server
- **Server-side encryption keys must be derived from user credentials** and never stored in plaintext
- **Delete data completely** when users request deletion - no soft deletes for user content, no hidden retention
- **Backup data must be encrypted** with the same rigor as primary storage
- **Never transmit user data over unencrypted channels**
- **Metadata minimization** - minimize metadata stored alongside encrypted content (timestamps, sizes, recipient info should be minimized or encrypted where possible)

### Logging & Monitoring

- **NEVER log user content, email bodies, subjects, or attachments**
- **NEVER log authentication tokens or session identifiers** in their complete form
- **Log only what is necessary** for operational health and security incident response
- **Logs must not contain** any data that could identify specific user actions or content
- **Sanitize all log output** - strip or hash any potentially identifying information before writing to logs

### Third-Party Services

- **Minimize third-party dependencies** for data processing
- **NEVER send user data to third-party analytics** platforms
- **Any third-party service must be vetted** for privacy compliance before integration
- **Self-host wherever possible** to maintain control over data

---

## Git Push Guidelines (MANDATORY)

**This section is NON-NEGOTIABLE. Follow these rules for EVERY push.**

### Commit Message Format
Use conventional commits with scope:

```
type(scope): short description
```

**Types:**
- `fix` - Bug fixes
- `feat` - New features
- `refactor` - Code restructuring without behavior change
- `perf` - Performance improvements
- `style` - Formatting, styling changes
- `docs` - Documentation only
- `test` - Adding/updating tests
- `chore` - Maintenance tasks, dependencies

**Scope:** The area of code affected (e.g., `drafts`, `auth`, `ui`, `api`, `crypto`)

### Examples
```
fix(drafts): resolve duplicate draft creation on edit
feat(mail): add live update for draft list items
refactor(crypto): simplify encryption key derivation
fix(ui): prevent sent emails from appearing in drafts
perf(api): optimize draft fetch with batch decryption
```

### Multiple Related Changes
For commits with multiple related changes, use a short summary line followed by bullet points:

```
fix(drafts): improve draft editing and list updates

- Add DRAFT_UPDATED event for live list updates
- Delete draft immediately on send to prevent ghost entries
- Pass full draft content to avoid re-fetching on edit
```

### Strict Rules
- **NEVER add Co-Authored-By lines**
- **NEVER mention AI/Claude/assistant in commits or code**
- **NEVER add "Generated with" or similar attribution lines**
- **NEVER use generic messages** like "fix bug" or "update code"
- **ALWAYS be specific** about what changed and why
- **Keep the first line under 72 characters**
