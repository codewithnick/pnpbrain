# PNPBrain - Company Information

## About PNPBrain

PNPBrain is a **plug-and-play AI Sales & Support Agent** that transforms how businesses interact with customers online. We replace broken website experiences (static forms, basic chatbots, poor navigation) with an intelligent conversational layer that feels like talking to your best salesperson.

**Founded:** 2024  
**Headquarters:** India  
**Mission:** Enable every small business to compete like enterprise with 24/7 AI-powered customer engagement  

---

## Core Product & Capabilities

### What PNPBrain Does
- **Instant Answers**: Responds 24/7 to customer questions using your knowledge base
- **Intent Detection**: Understands customer needs and guides them appropriately
- **Context Memory**: Remembers conversation history and customer preferences
- **Real Actions**: Books meetings, checks orders, qualifies leads, updates inventory
- **Smart Handoff**: Escalates to humans with full context when needed
- **Multi-Language**: Supports English, Hindi, and Hinglish

### Key Features
1. **Knowledge Base Management**
   - Auto-crawl website content
   - Upload documents (FAQ, product specs, policies)
   - Organize knowledge by category (Products, Pricing, Returns, etc.)
   - Real-time updates without code changes

2. **Skills & Integrations**
   - Calendly: Book meetings directly from chat
   - Razorpay: Process payments and check order status
   - Zendesk: Escalate complex issues with context
   - WhatsApp API: Reach customers on their preferred channel
   - Custom Skills: API for building domain-specific actions

3. **Memory & Personalization**
   - Persistent AI memory per customer
   - Tracks preferences, previous purchases, conversation history
   - Improves responses over time
   - GDPR-compliant data handling

4. **Analytics & Insights**
   - Query deflection rate (% of customer questions handled by AI)
   - Lead scoring and qualification metrics
   - Conversation quality dashboard
   - Performance trends by intent type

---

## How It Works

```
Customer Question (Widget)
    ↓
Backend Agent (LangGraph)
    ↓
Retrieves Knowledge Base (Vector Search)
+ Fetches AI Memory (Conversation Context)
    ↓
LLM Reasoning
    ↓
Does it need a tool/skill?
├─ Yes → Execute Skill (Calendly, Razorpay, etc.)
└─ No  → Generate Direct Answer
    ↓
Stream Response to Customer
    ↓
Save to Memory & Analytics
```

---

## Customer Entry Points

### 1. WordPress Plugin
- One-click installation for WordPress/WooCommerce stores
- Customizable chat widget (colors, position, greeting)
- Admin dashboard integrated into WordPress
- Perfect for: Small stores, agencies, creators

### 2. Script Tag Embed
```html
<script src="https://pnpbrain.com/embed.js" data-agent-id="..."></script>
```
Works on any website (Shopify, custom sites, landing pages)

### 3. React Component
For developers building custom integrations:
```jsx
import { ChatWidget } from '@pnpbrain/widget';
<ChatWidget agentId="..." />
```

### 4. WhatsApp / API
Direct integration for native mobile apps or messaging platforms

---

## Pricing Model (In Development)

### Free Tier
- Up to 100 messages/month
- Basic knowledge base (5 documents)
- No integrations
- Community support

### Pro ($149/month)
- 10,000 messages/month
- Unlimited documents
- 3 integrations (Calendly, Razorpay, custom)
- Email support
- Basic analytics

### Enterprise (Custom)
- Unlimited messages
- Advanced integrations (Zendesk, WhatsApp, CRM)
- Custom skills development
- Dedicated support
- SLA guarantee

---

## Technical Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React, Next.js, TypeScript |
| **Backend** | Node.js, Express, TypeScript |
| **Agent** | LangGraph, OpenAI/Ollama LLM |
| **Database** | PostgreSQL + pgvector (embeddings) |
| **Scraping** | Firecrawl (AI-native) |
| **Deployment** | Docker, AWS/GCP |
| **Infrastructure** | Turborepo, pnpm |

---

## Key Differentiators

1. **Works with Local LLMs**: Not dependent on expensive cloud APIs
2. **Fast Setup**: No complex configuration needed
3. **Multi-Language**: Built for global audiences (Hindi support from day 1)
4. **Actionable AI**: Doesn't just answer—actually completes tasks
5. **Privacy-First**: Data stays in your control (on-premise option available)

---

## Success Metrics

Typical customers see:

- **70-80% Query Deflection**: Most common questions answered automatically
- **3-5x Conversion Lift**: Lead qualification + follow-up
- **50% Cost Reduction**: Lower support team workload
- **24/7 Availability**: Never miss a customer
- **98%+ Uptime**: Reliable as your website

---

## Roadmap (2026-2028)

### Phase 1: MVP (Current)
- ✅ Basic widget + knowledge base
- ✅ Firecrawl integration
- ✅ Persistent memory
- 🔄 Multi-skill orchestration

### Phase 2: Sales Agent (Q2 2026)
- Advanced objection handling
- Lead scoring engine
- Multi-tool workflows
- Human handoff with context

### Phase 3: Enterprise (Q4 2026)
- Multi-agent system
- WhatsApp/Voice support
- Team collaboration
- Custom fine-tuning

### Phase 4: Autonomous (2027+)
- Cross-business knowledge sharing
- Predictive personalization
- Voice-first interface

---

## Our Team Values

- **Ship Fast**: Iterate with real customer feedback
- **Keep It Simple**: Complex problems, elegant solutions
- **Data-Driven**: Measure impact, optimize continuously
- **Customer Obsessed**: Success = Our customer's success

---

## Contact & Support

- **Website**: https://pnpbrain.com
- **Support Email**: support@pnpbrain.com
- **API Docs**: https://docs.pnpbrain.com
- **GitHub**: https://github.com/pnpbrain
- **Status Page**: https://status.pnpbrain.com
