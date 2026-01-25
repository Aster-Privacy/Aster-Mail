# AtlasMail - AI Coding Agent Instructions

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
