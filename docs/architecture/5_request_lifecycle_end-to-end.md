## 5. Request Lifecycle (End-to-End)

This details the flow for a consumer making a proxied request:

1.  **AuthN Policy:** The request hits the Zuplo endpoint. A built-in Zuplo API Key Authentication policy validates the `Authorization: Bearer <key>` header. It checks for a valid key format and existence.
2.  **Pre-Call Logic (Custom Handler):**
    a. The handler receives the request, including the validated API key and the `{serverId}` from the URL.
    b. It establishes a connection to the PostgreSQL DB.
    c. **DB Read 1:** Fetches the `user` and `credits_balance` associated with the API key hash.
    d. **DB Read 2:** Fetches the `https_url` and `tool_pricing` for the given `serverId`.
    e. **Authorization & Validation:** It parses the request body to identify the MCP tool being called. It then checks if the user's `credits_balance` is sufficient to cover the `cost_per_call`. If not, it terminates the request with a `402 Payment Required` error.
3.  **Proxy to Upstream:**
    a. If all checks pass, the handler constructs the request for the upstream server using the fetched `https_url`.
    b. It uses Zuplo's `context.sendRequest` function to forward the request.
4.  **Post-Call Logic (Custom Handler):**
    a. The handler awaits the response from the upstream MCP server.
    b. **DB Write:** Upon receiving a successful response, it makes two asynchronous calls to the PostgreSQL DB:
        i. `INSERT` a new record into the `usage_logs` table.
        ii. `UPDATE` the `users` table to deduct the credits (`credits_balance = credits_balance - cost`).
    c. It adds the `X-Gateway-Request-ID` and other relevant metadata to the response headers.
5.  **Response to Client:** The final response is streamed back to the consumer.
