# RentEverything — Final PFE Defense Guide

This guide is designed to help you prepare for your Projet de Fin d'Études (PFE) defense. It covers a structured live demo script, presentation slide outline, report checklist, anticipated jury questions, and a fallback plan in case of technical issues.

---

## 1. Final Demo Scenario (The "Golden Path")

This scenario is designed to showcase the most technically impressive features of RentEverything in a logical, business-driven flow. 

**Duration:** ~8-10 minutes.

### Part A: Marketplace Discovery & AI Assistant (Renter Persona)
1. **Context Setting:** Briefly explain the problem ("It's hard to find the right rental equipment and negotiate").
2. **AI Discovery:** Open the RentEverything platform as a user (`user6@example.com`).
3. **Chatbot Interaction:** Open the AI Chatbot. Ask a natural language query: *"Je cherche une raquette de tennis pour ce week-end à Kélibia, moins de 50 TND."*
4. **AI Output:** Show how the AI interprets the request, queries the database, and returns formatted, clickable results.
5. **Comparison:** Click on one of the results and show the AI-generated description enhancements or comparison features to aid decision support.

### Part B: Wallet Checkout (Renter Persona)
1. **The Problem:** Explain that small rentals (scooters, rackets) have high credit card fees, creating friction.
2. **Wallet Top-up:** Navigate to `/client/wallet`. Show the current balance. Add funds (e.g., 50 TND) and show the instant feedback.
3. **Booking Flow:** Go back to the selected listing, choose dates, and click "Request to Book".
4. **Checkout:** At the payment step, select **"RentEverything Wallet"**.
5. **Confirmation:** Confirm the payment. Show that the wallet balance instantly decrements and a `PAYMENT` transaction appears in the history.

### Part C: Admin Oversight & Finance (Admin Persona)
1. **Context Switch:** Log out and log back in as the Administrator (`user1@example.com`).
2. **Wallet Oversight:** Navigate to `/admin/wallets`. 
3. **Transparency:** Show the total platform wallet balance (Ledger integrity) and find `user6` in the list.
4. **Admin Adjustment:** Click "View" on `user6`. Perform a manual credit adjustment (e.g., 10 TND) with the reason "Loyalty Bonus". Show that this immediately logs an `ADJUSTMENT` transaction and updates the audit log.

### Part D: Trust, Governance & Image Pipeline (Admin Persona)
1. **Trust & Moderation:** Navigate to the Admin Trust Dashboard (`/admin/trust/suspicious` or equivalent). Show how the system flags suspicious users based on Chatbot abuse rules or low ratings.
2. **Category Governance:** Show the category request pipeline, explaining how hosts can request new categories, but admins must approve them to maintain marketplace taxonomy.
3. **Image Upload Pipeline (Brief Mention):** While creating a listing or showing an existing one, briefly mention the Cloudinary integration, explaining how images are optimized and securely stored off-server.

---

## 2. Slide Deck Outline (15-20 Slides)

**1. Title Slide (1 slide)**
- Project Name, Your Name, Supervisor, Academic Year.

**2. Context & Problem Statement (2 slides)**
- The fragmentation of the rental market.
- Friction in peer-to-peer trust, micro-payments, and search discovery.

**3. Solution & Value Proposition (1 slide)**
- RentEverything: A centralized, AI-enhanced, secure P2P rental marketplace.

**4. Global Architecture (2 slides)**
- High-level diagram: Frontend (Next.js), Backend (NestJS), Database (PostgreSQL/Prisma), External integrations (OpenAI/Groq, Cloudinary).
- Key design patterns: Modular architecture, separation of concerns.

**5. Feature Focus 1: AI Search & Chatbot (2 slides)**
- How NLP transforms user intent into structured database queries.
- Architecture of the Chatbot Service.

**6. Feature Focus 2: Finance & Wallet System (2 slides)**
- The Renter Wallet MVP: Solving micro-transaction friction.
- Financial Integrity: The double-entry Ledger system, idempotency, and atomic transactions.

**7. Feature Focus 3: Trust & Moderation (2 slides)**
- AI prompt injection protection.
- Abuse scoring, admin audit logs, and category governance.

**8. Live Demo (Placeholder Slide)**
- "Let's see it in action."

**9. Technical Challenges & Solutions (2 slides)**
- *Challenge:* Preventing race conditions in wallet payments. *Solution:* Prisma `$transaction` and atomic decrements.
- *Challenge:* AI Hallucinations. *Solution:* Strict schema validation and function calling.

**10. Future Work & Conclusion (2 slides)**
- Integration of a real payment provider (e.g., Flouci/Stripe).
- Real-time messaging enhancements (WebSockets).
- Conclusion and Thank You.

---

## 3. Report Section Checklist

Ensure your written PFE report covers these critical technical implementations:

- [ ] **State of the Art:** Comparison with existing platforms (Airbnb, Fat Llama) and justification of the tech stack (NestJS vs Express, Next.js App Router).
- [ ] **Architecture:** System diagrams, ERD (Entity Relationship Diagram) showing Wallet, Ledger, and Booking models.
- [ ] **The AI Engine:** Detailed explanation of the LLM function-calling mechanism, schema validation, and prompt security (Context bounding).
- [ ] **Financial Integrity (Ledger):** Explanation of `LedgerEntry`, FIFO payout logic, atomic transactions, and why balances aren't just a simple `number` column without history.
- [ ] **The Wallet MVP:** Sequence diagram of the checkout flow using the wallet.
- [ ] **Trust & Safety:** How the `ChatbotSecurityEvent` model works, penalty scoring, and admin oversight.
- [ ] **Media Pipeline:** Explanation of the Cloudinary upload pipeline and local fallback.

---

## 4. Jury Q&A Preparation

**Q: Why build a custom Wallet/Ledger system instead of just using Stripe?**
*A: For a PFE, building the core financial primitives demonstrates strong backend engineering skills (ACID properties, transactions, double-entry accounting). Furthermore, in regions where Stripe isn't available, maintaining an internal ledger allows us to plug into local gateways (like Flouci) strictly for top-ups, while handling the complex multi-party marketplace splits internally.*

**Q: How do you prevent double-spending in the wallet?**
*A: All wallet operations (payments, refunds, top-ups) are wrapped in Prisma `$transaction` blocks. We use database-level atomic operations (e.g., `decrement: amount`) rather than reading the balance into memory and writing it back, which prevents race conditions.*

**Q: How do you ensure the AI doesn't hallucinate fake listings or offer discounts?**
*A: The AI does not generate listings itself. We use OpenAI/Groq's "Function Calling". The LLM is instructed to extract search parameters (category, max price) from the user's prompt. The actual database query is executed securely by the backend using those parameters, guaranteeing that only real data is returned.*

**Q: What happens if a payment fails halfway through the booking process?**
*A: Our system uses database transactions. If the wallet decrement succeeds but the booking status update fails, the entire transaction rolls back. Furthermore, operations like refunds are idempotent—we check for existing `WalletTransaction` records with the same `referenceId` before processing.*

---

## 5. Risk Fallback Plan (Disaster Recovery for Demo)

Live demos can fail (network drops, API rate limits). Be prepared.

1. **The "Pre-recorded Video" Fallback:**
   - **ACTION REQUIRED TODAY:** Use OBS Studio or QuickTime to record a 5-minute video of the flawless "Golden Path" demo. Keep this video loaded and minimized on your desktop. If the live server crashes or internet drops, say: *"It seems we have a network issue, but I have a video of this exact flow recorded earlier today."*

2. **LLM / Groq API Rate Limit Fallback:**
   - If the AI Chatbot returns a 429 or 500 error during the defense, do not panic.
   - Explain: *"Since we are using a free-tier LLM API for development, we have hit a rate limit. However, the system is designed to degrade gracefully. Users can still use the standard manual search bar."* Then, proceed to use the standard search filters.

3. **Database Locks / Prisma Errors:**
   - If a booking fails with a 500 error (e.g., Prisma transaction timeout).
   - Explain: *"This is a strict concurrency lock ensuring financial safety. In a production environment, this would be placed in a background queue or auto-retried. Let me refresh and show you the admin view instead."*

4. **Localhost over Cloud:**
   - Run the demo entirely on `localhost:3000` and `localhost:3001` using your local PostgreSQL instance. Do **not** rely on a cloud deployment (like Railway/Vercel) for the live defense unless required, as university Wi-Fi is notoriously unreliable.
