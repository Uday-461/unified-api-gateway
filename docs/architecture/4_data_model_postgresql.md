## 4. Data Model (PostgreSQL)

A simplified schema to support the core features:

-   `users`:
    -   `id` (PK), `email`, `password_hash`, `credits_balance`, `profile_info`, `created_at`
-   `api_keys`:
    -   `id` (PK), `user_id` (FK to users), `key_hash` (indexed), `key_prefix`, `label`, `revoked`, `created_at`
    -   `monthly_spend_cap`, `daily_spend_cap`, `rate_limit_per_minute`, `rate_limit_per_hour`
-   `mcp_servers`:
    -   `id` (PK, this is the `serverId`), `provider_id` (FK to users), `https_url`, `name`, `description`, `published`, `created_at`
    -   `free_requests_per_day` (INTEGER, default 0)
-   `tool_pricing`:
    -   `id` (PK), `server_id` (FK to mcp_servers), `tool_name`, `cost_per_call`, `created_at`
-   `usage_logs`:
    -   `id` (PK, `X-Gateway-Request-ID`), `api_key_id` (FK to api_keys), `server_id` (FK to mcp_servers), `tool_name`, `cost`, `status_code`, `is_upstream_error`, `created_at`
-   `daily_free_usage`:
    -   `id` (PK), `user_id` (FK to users), `server_id` (FK to mcp_servers), `date` (DATE), `usage_count` (INTEGER)
