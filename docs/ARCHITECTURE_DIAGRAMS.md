# GCFIS Architecture Diagrams

Visual representations of the GCFIS monorepo structure and data flow.

## 1. Monorepo Architecture Overview

```mermaid
graph TB
    subgraph Apps["Apps"]
        Admin["Admin<br/>Dashboard"]
        Backend["Backend<br/>API"]
        Marketing["Marketing<br/>Website"]
        Widget["Widget<br/>Chat"]
        WPPlugin["WP Plugin"]
    end

    subgraph Packages["Packages"]
        Agent["Agent<br/>LLM"]
        DB["DB<br/>Drizzle"]
        Tools["Tools<br/>Utils"]
        Types["Types<br/>Contracts"]
    end

    Admin --> Agent
    Admin --> DB
    Admin --> Tools
    Admin --> Types
    
    Backend --> Agent
    Backend --> DB
    Backend --> Tools
    Backend --> Types
    
    Marketing --> Types
    Widget --> Agent
    Widget --> Types
    WPPlugin --> Types

    Agent -.-> DB
    Agent -.-> Tools
```

## 2. Layered Service Architecture

```mermaid
graph TD
    Client["Client<br/>React UI"]
    Routes["API Routes<br/>Handlers"]
    Controller["Controller<br/>Orchestrate"]
    
    Agent["Agent Service<br/>LLM"]
    Memory["Memory Service<br/>Extract"]
    RAG["RAG Service<br/>Retrieve"]
    Billing["Billing Service"]
    
    Repo["Repository<br/>Data Access"]
    ORM["Drizzle ORM"]
    Database["PostgreSQL"]
    
    Tools["LLM Tools<br/>Calc DateTime"]
    ExtAPI["External APIs<br/>OpenAI Stripe"]

    Client --> Routes
    Routes --> Controller
    Controller --> Agent
    Controller --> Billing
    
    Agent --> Memory
    Agent --> RAG
    Agent --> Tools
    
    Memory --> Repo
    RAG --> Repo
    Billing --> Repo
    
    Repo --> ORM
    ORM --> Database
    
    Agent -.-> ExtAPI
    Tools -.-> ExtAPI
```

## 3. Package Structure and Ownership

```mermaid
graph LR
    PKG_AGENT["packages/agent<br/>LLM LangGraph<br/>Memory RAG"]
    PKG_DB["packages/db<br/>Drizzle Queries<br/>Schema"]
    PKG_TOOLS["packages/tools<br/>Calculator DateTime<br/>Firecrawl"]
    PKG_TYPES["packages/types<br/>TypeScript<br/>Contracts"]
    
    ADMIN["Admin App<br/>Controllers Services"]
    BACKEND["Backend App<br/>API Routes"]
    MARKETING["Marketing App<br/>Frontend"]
    WIDGET["Widget App<br/>Chat"]

    ADMIN --> PKG_AGENT
    ADMIN --> PKG_DB
    ADMIN --> PKG_TOOLS
    ADMIN --> PKG_TYPES
    
    BACKEND --> PKG_AGENT
    BACKEND --> PKG_DB
    BACKEND --> PKG_TOOLS
    BACKEND --> PKG_TYPES
    
    MARKETING --> PKG_TYPES
    WIDGET --> PKG_AGENT
    WIDGET --> PKG_TYPES
```

## 4. Agent Execution Flow

```mermaid
sequenceDiagram
    participant Client
    participant Route
    participant Controller
    participant Agent
    participant Repository
    participant Database

    Client->>Route: POST chat
    Route->>Controller: validate context
    Controller->>Agent: execute
    
    Agent->>Repository: retrieve context
    Repository->>Database: query
    Database-->>Repository: results
    Repository-->>Agent: documents
    
    Agent->>Agent: LLM inference
    Agent->>Agent: tool execution
    Agent->>Repository: save conversation
    Repository->>Database: insert
    
    Agent-->>Controller: response
    Controller-->>Route: format
    Route-->>Client: 200 JSON
```

## 5. Technology Stack Matrix

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React + Next.js App Router | UI components, server-side rendering |
| **Type Safety** | TypeScript (strict mode) | Compile-time type checking |
| **Package Management** | pnpm + Turborepo | Monorepo orchestration & caching |
| **Backend** | Next.js API Routes | HTTP endpoints, middleware |
| **Database** | PostgreSQL + Drizzle ORM | Structured data, migrations |
| **Agent** | LangGraph + LangChain | Workflow orchestration, tool calling |
| **LLM** | OpenAI, Anthropic | Language model inference |
| **Tools** | Calculator, DateTime, Firecrawl | Agent tool ecosystem |
| **Styling** | Tailwind CSS + PostCSS | Utility-first CSS |
| **Integration** | Stripe, Supabase | Payment & auth services |

## Key Architecture Principles

- **Modularity**: Each package has one responsibility
- **Type Safety**: Strict TypeScript across all layers
- **Dependency Injection**: Services receive dependencies via constructor
- **Separation of Concerns**: Routes handle transport, controllers orchestrate, services contain logic
- **Database Abstraction**: Drizzle ORM for type-safe queries
- **Clean Exports**: Apps import only from package `exports` map, no deep imports
- **Composability**: Build complex flows from small, testable units
