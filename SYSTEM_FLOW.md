# ERP Architecture Diagram

```
                         ┌──────────────────────────┐
                         │        React UI          │
                         │  Pages / Components      │
                         │ modules/*/pages          │
                         └─────────────┬────────────┘
                                       │
                                       ▼
                         ┌──────────────────────────┐
                         │     Layout + Routing     │
                         │ App.tsx + ProtectedRoute │
                         │ Dynamic Menu (RBAC)      │
                         └─────────────┬────────────┘
                                       │
                                       ▼
                         ┌──────────────────────────┐
                         │     Application Layer    │
                         │      Zustand Store       │
                         │      useAppStore         │
                         │                          │
                         │ initializeApp()          │
                         │ subscriptions            │
                         │ orchestration            │
                         └─────────────┬────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼

      ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
      │ Production     │   │ HR Module      │   │ Quality Module │
      │ Module         │   │                │   │                │
      │                │   │                │   │                │
      │ pages          │   │ pages          │   │ pages          │
      │ hooks          │   │ hooks          │   │ hooks          │
      │ use-cases      │   │ use-cases      │   │ use-cases      │
      │ services       │   │ services       │   │ services       │
      └───────┬────────┘   └───────┬────────┘   └───────┬────────┘
              │                    │                    │
              └──────────────┬─────┴─────┬──────────────┘
                             ▼
                 ┌──────────────────────────┐
                 │     Shared Layer         │
                 │                          │
                 │ permissions              │
                 │ utils                    │
                 │ activity logs            │
                 │ notifications            │
                 │ events (Event Bus)       │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │     Services Layer       │
                 │ Firestore Wrappers       │
                 │ modules/*/services       │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │        Firebase          │
                 │                          │
                 │ Auth                     │
                 │ Firestore                │
                 │ Storage                  │
                 └──────────────────────────┘
```

---

# Event Driven Communication

Instead of:

Production → Inventory → QC

System Uses:

Production emits event

```
production.started
```

Listeners react independently:

Inventory deduct materials
QC create inspection
Activity log created
Notifications triggered

```
Use Case
   ↓
Event Emit
   ↓
Event Bus
   ↓
Multiple Modules Listen
```

---

# Authentication Flow

User Login
→ Firebase Auth
→ initializeApp()
→ Load Profile
→ Load Role
→ Load Permissions
→ Load Application Data

---

# Data Flow

UI Action
→ Store Action
→ Use Case
→ Service
→ Firestore

Realtime Updates
→ Firestore Subscription
→ Store Update
→ UI Refresh

---

# Scaling Ready Design

Supports:

✓ Multi factories
✓ Event automation
✓ Background processing
✓ Mobile applications
✓ Analytics systems

```
Golden Rule:

UI → Store → Use Case → Service → Database
```
