# ERP System Architecture

## Overview

This project is a Frontend ERP Single Page Application (SPA)
built using:

* React
* TypeScript
* Vite
* Firebase (Auth + Firestore + Storage)
* Zustand (Central State Management)

Firebase acts as a managed backend service while business
logic orchestration happens inside the frontend application.

The system follows a Modular Feature-Based Architecture.

---

# High Level Architecture

Application Entry:

App.tsx

Responsible for:

* Route aggregation
* Module registration
* Layout mounting
* Authentication flow

Modules included:

* production
* hr
* quality
* costs
* dashboards
* system
* auth

---

# Architecture Layers

## 1. Presentation Layer

Responsible for UI rendering.

Location:

modules/*/pages
modules/*/components
shared/components

Contains:

* React Pages
* UI Components
* Forms
* Tables
* Dashboards

Rules:

UI must NOT access Firestore directly.

---

## 2. Application Layer

Central orchestration layer.

Main file:

store/useAppStore.ts

Responsibilities:

* Application initialization
* Authentication state
* Permissions loading
* Live subscriptions
* Global data synchronization
* CRUD orchestration

Main flows handled:

initializeApp()
_loadAppData()

Recommended Future Improvement:

Split store into slices:

* authSlice
* productionSlice
* hrSlice
* qualitySlice
* systemSlice

---

## 3. Domain (Feature Modules)

Each business domain lives inside:

modules/<domain>

Example:

modules/production
modules/hr
modules/quality

Typical structure:

modules/domain/

pages/
components/
services/
hooks/
routes/
types/
constants/
use-cases/

Responsibilities:

* Feature logic
* Domain workflows
* Data transformation

Modules represent isolated business domains.

---

## 4. Infrastructure Layer

Firebase integration.

Includes:

* Firebase Auth
* Firestore
* Storage

Main access occurs through:

modules/*/services

Services act as Firestore wrappers.

Rules:

Database access allowed ONLY inside services.

---

## 5. Compatibility Layer

Root folder:

services/

Purpose:

Backward compatibility during refactoring.

Contains:

Re-export wrappers only.

Example:

export * from "@/modules/production/services";

No logic allowed here.

---

# Routing Architecture

Routes are aggregated in App.tsx.

Public Routes:

Defined inside:

modules/auth/routes

Examples:

/login
/setup
/pending

Protected Routes:

Wrapped using:

ProtectedRoute

Authentication required.

---

# Security Model

RBAC (Role Based Access Control)

Permissions stored in Firestore per role.

Flow:

User Login
→ Load Profile
→ Load Role
→ Load Permissions
→ Store داخل Zustand

Permission checks handled via:

utils/permissions.ts

Example:

can("production.start")

---

# Role Based Navigation

Sidebar menu generated from:

config/menu.config.ts

Menu items filtered dynamically based on permissions.

Users automatically land on allowed dashboards.

---

# Application Data Flow

Login Flow:

User Login
→ Firebase Authentication
→ initializeApp()

initializeApp loads:

* user profile
* role
* permissions

Then:

_loadAppData()

Bootstraps system data:

* products
* production lines
* work orders
* reports
* plans
* costs
* settings

Raw database data transformed using:

buildProducts()
buildProductionLines()

UI consumes Zustand store directly.

---

# Realtime Updates

Realtime subscriptions include:

* production reports
* line status
* work orders
* scan events

Subscriptions handled inside Application Layer.

---

# Event Driven Extension (Recommended)

Cross-module workflows should use:

shared/events

Example:

production.started

Listeners:

Inventory
Quality
Activity Logs
Notifications

Avoid direct module dependencies.

---

# Progressive Web App (PWA)

Configured via:

vite.config.ts

Includes:

* Manifest
* Offline caching
* Installable app support

---

# Golden Architecture Rule

UI
→ Store / Use Case
→ Service
→ Firebase

Never bypass layers.

---

# Development Rules

Always:

* reuse existing services
* respect module boundaries
* use alias imports

Avoid:

* direct firestore usage in UI
* cross-module tight coupling
* duplicated business logic

---

# Future Scaling Ready

Architecture supports:

* Background workers
* APIs
* Mobile apps
* Multi factory setup
* Event driven automation

---

# System Goal

Maintain a scalable ERP platform with clear domain
boundaries and predictable data flow.
