## 2. Architecture Diagram
```mermaid
graph TD
    subgraph "Consumer's Environment"
        Client[Client Application]
    end

    subgraph "Zuplo Edge Gateway"
        A(POST /api/mcp/{serverId}) --> B{1. AuthN Policy};
        B --> |Valid API Key| C[2. Custom Handler: Pre-Call Logic];
        C --> |Checks Pass| D[3. Zuplo Proxy];
        D --> |Forward Request| E[Upstream MCP Server];
        E --> |Upstream Response| F[4. Custom Handler: Post-Call Logic];
        F --> |Final Response| G[Response to Client];
    end
    
    subgraph "External Infrastructure"
        PostgresDB[(PostgreSQL DB)];
        DeveloperUI[Developer/Consumer Portal <br/> (Web App)];
    end

    C --> |Read: User Credits, Server URL, Pricing| PostgresDB;
    F --> |Write: Log Usage, Deduct Credits| PostgresDB;
    DeveloperUI --> |CRUD Operations for Users, Servers, Keys| PostgresDB;
    
    Client --> A;
    G --> Client;
    
    style E fill:#cce5ff,stroke:#333,stroke-width:2px
    style DeveloperUI fill:#fff2cc,stroke:#333,stroke-width:2px
```
