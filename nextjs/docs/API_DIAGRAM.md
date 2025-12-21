# Zero Trust Analytics API Architecture

## API Endpoint Structure

```mermaid
graph TB
    subgraph "Client Applications"
        Web[Web Browser]
        Mobile[Mobile App]
        SDK[Custom SDK]
    end

    subgraph "API Gateway"
        Auth[Authentication Layer]
        RateLimit[Rate Limiter]
        CORS[CORS Handler]
    end

    subgraph "API Endpoints"
        subgraph "Authentication /auth/*"
            Register[POST /register]
            Login[POST /login]
            Forgot[POST /forgot]
            Reset[POST /reset]
            TwoFA[POST /2fa]
            OAuth[GET /google, /github]
        end

        subgraph "Sites /sites/*"
            ListSites[GET /list]
            CreateSite[POST /create]
            UpdateSite[POST /update]
            DeleteSite[POST /delete]
            ShareSite[POST /share]
        end

        subgraph "Analytics /api/*"
            Track[POST /track]
            Stats[GET /stats]
            PublicStats[GET /public-stats]
        end

        subgraph "User /user/*"
            UserStatus[GET /status]
            UserSessions[GET /sessions]
        end

        subgraph "Billing /stripe/*"
            Checkout[POST /checkout]
            Portal[POST /portal]
        end
    end

    subgraph "Data Layer"
        Turso[(Turso DB<br/>Analytics)]
        Blobs[(Netlify Blobs<br/>User Data)]
        Stripe[Stripe API<br/>Billing]
    end

    Web --> Auth
    Mobile --> Auth
    SDK --> Auth

    Auth --> RateLimit
    RateLimit --> CORS

    CORS --> Register
    CORS --> Login
    CORS --> ListSites
    CORS --> Track
    CORS --> Stats

    Register --> Blobs
    Login --> Blobs
    CreateSite --> Blobs
    Track --> Turso
    Stats --> Turso
    Checkout --> Stripe
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant DB as Database
    participant E as Email Service

    rect rgb(200, 220, 255)
        Note over C,DB: Registration Flow
        C->>A: POST /auth/register<br/>{email, password, plan}
        A->>A: Validate password strength
        A->>DB: Check if email exists
        alt Email exists
            A->>C: 409 Conflict
        else New user
            A->>A: Hash password
            A->>DB: Create user
            A->>A: Generate JWT + CSRF tokens
            A->>C: 201 Created<br/>{token, csrfToken, user}
        end
    end

    rect rgb(220, 255, 220)
        Note over C,DB: Login Flow
        C->>A: POST /auth/login<br/>{email, password}
        A->>DB: Get user
        A->>A: Verify password
        alt Invalid credentials
            A->>C: 401 Unauthorized
        else Valid credentials
            alt 2FA Enabled
                A->>A: Generate temp token
                A->>C: 200 OK<br/>{requires_2fa, tempToken}
                C->>A: POST /auth/2fa<br/>{action: validate, code}
                A->>A: Verify TOTP code
                A->>A: Generate full JWT
                A->>C: 200 OK<br/>{token, user}
            else No 2FA
                A->>A: Generate JWT + CSRF
                A->>C: 200 OK<br/>{token, csrfToken, user}
            end
        end
    end

    rect rgb(255, 220, 220)
        Note over C,E: Password Reset Flow
        C->>A: POST /auth/forgot<br/>{email}
        A->>DB: Check if user exists
        A->>A: Generate reset token
        A->>DB: Store reset token
        A->>E: Send reset email
        A->>C: 200 OK (always)
        E->>C: Email with reset link
        C->>A: POST /auth/reset<br/>{token, newPassword}
        A->>DB: Verify token
        A->>A: Hash new password
        A->>DB: Update password
        A->>C: 200 OK
    end
```

## Analytics Tracking Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Analytics Script
    participant A as API /track
    participant DB as Turso Database

    rect rgb(240, 240, 255)
        Note over B,DB: Single Event Tracking
        B->>S: Page loads
        S->>S: Generate session ID
        S->>A: POST /track<br/>{siteId, type: pageview, path, referrer}
        A->>A: Validate site ID
        A->>A: Check origin vs site domain
        A->>A: Detect if bot
        alt Is bot
            A->>S: 200 OK (silent)
        else Real user
            A->>A: Hash IP + User Agent
            A->>A: Extract geo from headers
            A->>A: Validate no PII
            A->>DB: Insert event
            A->>S: 200 OK
        end
    end

    rect rgb(240, 255, 240)
        Note over B,DB: Batch Event Tracking (Recommended)
        B->>S: Page loads
        S->>S: Buffer events locally
        S->>A: POST /track<br/>{siteId, batch: true, events: [...]}
        A->>A: Process all events
        A->>A: Hash all identifiers
        A->>DB: Single INSERT with all events
        A->>S: 200 OK {count: N}
    end
```

## Site Management Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant DB as Netlify Blobs

    rect rgb(255, 245, 230)
        Note over C,DB: Create Site
        C->>A: POST /sites/create<br/>Authorization: Bearer TOKEN<br/>X-CSRF-Token: CSRF
        A->>A: Verify JWT
        A->>A: Verify CSRF token
        A->>A: Normalize domain
        A->>A: Generate site ID
        A->>DB: Store site
        A->>DB: Link to user
        A->>C: 201 Created<br/>{site, embedCode}
    end

    rect rgb(230, 245, 255)
        Note over C,DB: Get Analytics
        C->>A: GET /stats?siteId=X&period=7d<br/>Authorization: Bearer TOKEN
        A->>A: Verify JWT
        A->>DB: Get user's sites
        A->>A: Verify ownership
        alt User owns site
            A->>DB: Query Turso for stats
            A->>C: 200 OK {summary, daily, pages, ...}
        else Access denied
            A->>C: 403 Forbidden
        end
    end
```

## Data Flow Architecture

```mermaid
graph LR
    subgraph "Client Side"
        W[Website Visitor]
        T[Tracking Script]
    end

    subgraph "Zero-Trust Processing"
        H[Hash Function]
        V[PII Validator]
        B[Bot Filter]
    end

    subgraph "Storage"
        TD[(Turso<br/>Hashed Analytics)]
        ND[(Netlify Blobs<br/>User/Site Config)]
    end

    W -->|Visits page| T
    T -->|Raw data| H
    H -->|Hash IP/UA| V
    V -->|Validate| B
    B -->|Filter bots| TD
    T -.->|Site config| ND

    style H fill:#ff9999
    style V fill:#99ff99
    style B fill:#9999ff
    style TD fill:#ffcc99
    style ND fill:#cc99ff
```

## Security Layers

```mermaid
graph TB
    Request[Incoming Request]

    subgraph "Layer 1: Network"
        HTTPS[HTTPS Only]
        CORS[CORS Validation]
    end

    subgraph "Layer 2: Rate Limiting"
        RL[Rate Limiter<br/>3-1000 req/min]
    end

    subgraph "Layer 3: Authentication"
        JWT[JWT Verification]
        CSRF[CSRF Token Check]
    end

    subgraph "Layer 4: Authorization"
        Ownership[Resource Ownership]
        Subscription[Subscription Status]
    end

    subgraph "Layer 5: Data Privacy"
        Hash[Hash PII]
        Validate[Validate No PII]
    end

    Storage[(Secure Storage)]

    Request --> HTTPS
    HTTPS --> CORS
    CORS --> RL
    RL --> JWT
    JWT --> CSRF
    CSRF --> Ownership
    Ownership --> Subscription
    Subscription --> Hash
    Hash --> Validate
    Validate --> Storage

    style HTTPS fill:#ff9999
    style JWT fill:#ff9999
    style Hash fill:#99ff99
    style Validate fill:#99ff99
```

## Rate Limiting Strategy

```mermaid
graph TB
    subgraph "Endpoint Categories"
        Auth[Auth Endpoints]
        Track[Tracking Endpoint]
        API[General API]
    end

    subgraph "Rate Limits"
        R1[Register: 5/min]
        R2[Login: 10/min]
        R3[Forgot: 3/min]
        R4[Track: 1000/min]
        R5[Other: Standard]
    end

    subgraph "Actions"
        Block[429 Too Many Requests]
        Allow[Process Request]
    end

    Auth --> R1
    Auth --> R2
    Auth --> R3
    Track --> R4
    API --> R5

    R1 -->|Exceeded| Block
    R2 -->|Exceeded| Block
    R3 -->|Exceeded| Block
    R4 -->|Exceeded| Block

    R1 -->|Within limit| Allow
    R2 -->|Within limit| Allow
    R3 -->|Within limit| Allow
    R4 -->|Within limit| Allow
    R5 -->|Within limit| Allow
```

## Database Schema Overview

```mermaid
erDiagram
    USERS ||--o{ SITES : owns
    USERS ||--o{ SESSIONS : has
    SITES ||--o{ PAGEVIEWS : tracks
    SITES ||--o{ SHARES : has

    USERS {
        string id PK
        string email
        string passwordHash
        string plan
        boolean twoFactorEnabled
        string twoFactorSecret
        json subscription
        timestamp createdAt
    }

    SITES {
        string id PK
        string userId FK
        string domain
        string nickname
        timestamp createdAt
    }

    PAGEVIEWS {
        string id PK
        string siteId FK
        string sessionHash
        string userHash
        string deviceHash
        string page_path
        string referrer_domain
        string country
        string region
        timestamp timestamp
    }

    SHARES {
        string token PK
        string siteId FK
        array allowedPeriods
        timestamp expiresAt
        timestamp createdAt
    }

    SESSIONS {
        string id PK
        string userId FK
        string ipHash
        string userAgent
        timestamp createdAt
        timestamp lastActive
    }
```

## Event Processing Pipeline

```mermaid
graph LR
    subgraph "Client"
        E[Event Generated]
    end

    subgraph "Collection"
        B[Batch Buffer]
        S[Send to API]
    end

    subgraph "Validation"
        V1[Validate Site ID]
        V2[Validate Origin]
        V3[Check Bot]
    end

    subgraph "Processing"
        H1[Hash IP]
        H2[Hash User Agent]
        H3[Extract Geo]
        H4[Parse Event Data]
    end

    subgraph "Storage"
        VI[Validate No PII]
        DB[(Turso Insert)]
    end

    E --> B
    B -->|Every 10s or 10 events| S
    S --> V1
    V1 --> V2
    V2 --> V3
    V3 -->|Not bot| H1
    H1 --> H2
    H2 --> H3
    H3 --> H4
    H4 --> VI
    VI -->|Clean| DB

    V3 -.->|Is bot| Silent[Silent Accept]
    VI -.->|PII detected| Reject[Reject]
```

## API Response Flow

```mermaid
graph TB
    Request[API Request]

    subgraph "Success Paths"
        S200[200 OK<br/>Success]
        S201[201 Created<br/>Resource Created]
    end

    subgraph "Client Errors"
        E400[400 Bad Request<br/>Invalid Data]
        E401[401 Unauthorized<br/>No/Invalid Token]
        E403[403 Forbidden<br/>No Permission]
        E404[404 Not Found<br/>Resource Missing]
        E409[409 Conflict<br/>Already Exists]
        E429[429 Too Many<br/>Rate Limited]
    end

    subgraph "Server Errors"
        E500[500 Internal<br/>Server Error]
    end

    Request --> Validate{Validate}
    Validate -->|Valid| Process{Process}
    Validate -->|Invalid Data| E400
    Validate -->|No Auth| E401
    Validate -->|No Permission| E403
    Validate -->|Not Found| E404
    Validate -->|Duplicate| E409
    Validate -->|Rate Limit| E429

    Process -->|Success| S200
    Process -->|Created| S201
    Process -->|Error| E500

    style S200 fill:#99ff99
    style S201 fill:#99ff99
    style E400 fill:#ffcc99
    style E401 fill:#ffcc99
    style E403 fill:#ffcc99
    style E404 fill:#ffcc99
    style E409 fill:#ffcc99
    style E429 fill:#ffcc99
    style E500 fill:#ff9999
```

---

**Note**: These diagrams use Mermaid syntax and can be rendered in:
- GitHub (native support)
- VS Code (with Mermaid extension)
- Online viewers: https://mermaid.live/
- Documentation sites (GitBook, MkDocs, etc.)
