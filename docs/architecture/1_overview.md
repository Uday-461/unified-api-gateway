## 1. Overview

This document outlines the technical architecture for the MCP HTTPS Gateway as defined in the `prd.md`. The system is designed to be implemented on the [Zuplo](https://zuplo.com/) programmable API gateway, leveraging an external PostgreSQL database for persistent data storage.

The architecture prioritizes security, scalability, and low latency, aligning with the non-functional requirements. It maps the product's core capabilities—authentication, routing, metering, and billing—to the specific features and custom code modules within the Zuplo environment.
