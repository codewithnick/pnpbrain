# PNPBrain Product Specifications

## Supported Integrations

### Payment Processing
**Razorpay**
- Instant order status lookup
- Payment history retrieval
- Refund request processing
- Subscription management

**Stripe** (Coming Q2 2026)
- Payment processing
- Subscription management
- Invoice retrieval

### Meeting & Calendar
**Calendly**
- Real-time availability checking
- Automatic meeting booking
- Timezone-aware scheduling
- Calendar sync (Google, Outlook, iCal)

**Google Calendar** (Coming Q3 2026)
- Direct calendar integration
- Buffer time settings
- Meeting room booking

### Support & Ticketing
**Zendesk**
- Automatic ticket creation with context
- Ticket status lookup  
- Knowledge base sync
- Agent assignment based on skills

**Intercom** (Coming Q2 2026)
- Conversation handoff
- Custom attributes sync
- Conversation history

### CRM & Marketing
**Salesforce** (Coming Q3 2026)
- Lead creation and qualification
- Contact enrichment
- Opportunity tracking

**HubSpot** (Coming Q3 2026)
- Contact management
- Lead scoring
- Email integration

**Mailchimp** (Coming Q3 2026)
- List management
- Campaign performance
- Subscriber data sync

### Communication
**WhatsApp Business API**
- Send messages to customers
- Receive incoming messages
- Media sharing (images, documents)
- Message templates

**Twilio SMS** (Coming Q2 2026)
- SMS sending & receiving
- MMS support
- Phone calls

**Email** (SMTP)
- Newsletter sending
- Transactional emails
- Reply tracking

### E-Commerce
**WooCommerce**
- Product catalog sync
- Inventory management
- Order lookup
- Customer loyalty programs

**Shopify** (Coming Q3 2026)
- Product information
- Inventory tracking
- Order management
- Fulfillment status

---

## Available Skills

### Calculator Skill
**Purpose**: Perform math operations with precision
**Capabilities**:
- Basic arithmetic (add, subtract, multiply, divide)
- Percentage calculations
- Discount application
- Tax calculation

**Example**: "If I buy 3 items at $29.99 each, what's the total with 18% tax?"

### DateTime Skill
**Purpose**: Handle dates, times, and scheduling logic
**Capabilities**:
- Current date/time in any timezone
- Date arithmetic (add days, weeks, months)
- Timezone conversion
- Business hours checking
- Holiday awareness

**Example**: "Will a meeting on March 15th at 2 PM IST overlap with my morning in New York?"

### Firecrawl Skill
**Purpose**: Scrape and process web content
**Capabilities**:
- Extract markdown from any URL
- Clean HTML to readable text
- Extract structured data
- Handle JavaScript-heavy sites
- Respect robots.txt

**Example**: "Add our competitors' pricing page to our knowledge base"

### Lead Qualification Skill
**Purpose**: Automatically score and qualify leads
**Capabilities**:
- Score based on engagement level
- Analyze budget fit
- Assess use case alignment
- Prioritize high-value prospects
- Auto-tag for sales team

**Scoring Algorithm**:
- Budget mentioned (25 points)
- Specific use case (20 points)
- Timeline/urgency (15 points)
- Company size indicator (15 points)
- Email validation (10 points)
- Engagement depth (15 points)

**Example**: "Is this customer a good fit for our Enterprise plan?"

### Meeting Scheduler Skill
**Purpose**: Book meetings without back-and-forth
**Capabilities**:
- Check real-time availability
- Suggest optimal time slots
- Send calendar invites
- Create Zoom/Google Meet links
- Send confirmations
- Handle reschedule/cancel requests

**Example**: "Can you schedule me a 30-minute call with the sales team next week?"

### Support Escalation Skill
**Purpose**: Intelligently route complex issues
**Capabilities**:
- Create Zendesk tickets
- Add context from conversation
- Assign to right department
- Set priority level
- Track escalation
- Notify customer of ticket #

**Escalation Triggers**:
- Refund requests
- Technical issues (not in KB)
- Billing disputes
- Account access issues
- Feature requests

---

## Performance Specifications

### Response Time
- **Cold Start**: < 2 seconds (first message)
- **Typical Response**: 500-1500ms with knowledge retrieval
- **Streaming**: Real-time chunks (first chunk in < 500ms)
- **With Tool Use**: 2-5 seconds (varies by tool latency)

### Throughput
- **Messages/Second**: Up to 100 concurrent conversations
- **Daily Messages**: 10,000+ without performance degradation
- **Concurrent Users**: 1,000+ per instance

### Knowledge Base
- **Maximum Documents**: Unlimited
- **Search Latency**: < 100ms for vector search
- **Accuracy**: 85%+ semantic relevance in top-3 results
- **Freshness**: Real-time with Firecrawl auto-crawl

### Memory & Personalization
- **Conversation Context**: Last 20 messages retained
- **Long-term Memory**: Up to 2 years of interactions
- **Memory Update Latency**: < 1 second

### Availability
- **SLA**: 99.9% uptime (Enterprise)
- **Backup**: Automatic failover to secondary instance
- **Data Retention**: 30 days (Free), 1 year (Pro), unlimited (Enterprise)

---

## Security & Compliance

### Data Protection
- **Encryption In Transit**: TLS 1.2+
- **Encryption At Rest**: AES-256
- **Database Isolation**: Separate customer schemas
- **API Keys**: Rotated quarterly, salted & hashed

### Compliance
- **GDPR**: Full EU data residency option
- **CCPA**: California privacy compliance
- **SOC2 Type II**: In progress (Q3 2026)
- **HIPAA**: Available for healthcare (Custom Enterprise)

### Privacy
- **Data Ownership**: Customer data never shared
- **On-Premise Option**: Deploy in your own infrastructure
- **Audit Logs**: Full activity logging for all data access
- **Right to Delete**: GDPR-compliant data deletion

---

## Limits & Quotas

| Feature | Free | Pro | Enterprise |
|---------|------|-----|-----------|
| Messages/month | 100 | 10,000 | Unlimited |
| Knowledge Documents | 5 | Unlimited | Unlimited |
| Integrations | 0 | 3 | Unlimited |
| Custom Skills | 0 | 0 | Available |
| API Calls | 100/month | 50,000/month | Unlimited |
| Concurrent Sessions | 5 | 100 | 1,000+ |
| Response Size | 4KB | 16KB | Unlimited |
| File Upload Size | 1MB | 10MB | 100MB |

