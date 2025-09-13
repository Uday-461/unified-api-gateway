## 3. Component Breakdown

### 3.1. Zuplo Gateway
The core of the system. It's a serverless, programmable edge gateway responsible for handling all incoming API traffic.

-   **Inbound Policies:** Pre-built Zuplo policies will be used for initial request validation, such as API Key Authentication (`AuthN`).
-   **Custom Handlers (TypeScript):** The majority of the business logic resides in custom TypeScript code running on Zuplo's edge runtime. This includes credit checks, dynamic routing lookups, metering, and logging.
-   **Proxy/Routing Engine:** Zuplo's native request forwarding capabilities will be used to proxy the request to the target MCP server after the custom logic has executed.

### 3.2. External PostgreSQL Database
This is the system's persistent state store, hosted on a cloud provider (e.g., AWS RDS, Supabase, Neon). It is the single source of truth for all user and server data.

-   **Responsibility:** Stores user accounts, API keys (hashed), server registrations, pricing configurations, usage logs, and developer payout information.
-   **Connection:** The Zuplo gateway will connect to the database securely using connection strings stored as environment variables/secrets within Zuplo.

### 3.3. Developer/Consumer Portal (Web App)
While the PRD focuses on the gateway, it implies the existence of a UI for developers and consumers. This is considered a separate component.

-   **Responsibility:** Provides the user interface for account creation, server registration, API key management, credit purchases, and viewing dashboards.
-   **Implementation:** A standard web application (e.g., Next.js, Remix) that interacts directly with the PostgreSQL database via its own backend or a data API layer. It is **not** part of the Zuplo gateway itself.
