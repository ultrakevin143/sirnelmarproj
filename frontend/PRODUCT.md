# LiftUp

<!-- impeccable:product-schema 1 -->

## Platform

web

The existing Vue and Quasar interface will also be packaged for Android with Capacitor. This remains an adaptation of the existing web design. It is not a separate native design system.

## Users

People tracking their own gym workouts and training plans. The group and instructor will also install and review the Android application for the final project.

## Product Purpose

Let an authenticated user plan training, record workout sets, and review previous sessions and exercise progress. Web and Android must use the same account and saved records.

## Operating Context

This is a continuation of the existing LiftUp school project. The instructor accepts a locally hosted website or deployed link and requires an installable, functional Android application with screenshot evidence. The user has an Android phone for installation and testing.

## Capabilities and Constraints

- Existing stack: Vue 3, Quasar, TypeScript, Express, PostgreSQL, and a documented Neon database setup.
- Existing capabilities include accounts, weekly plans, workout set logging, exercise guides, history search and date filters, training insights, settings, rest timer, CSV export, plate calculator, and an experimental push-up counter.
- Server-backed features need an internet connection in the proposed hosted setup. Existing local drafts do not provide an offline synchronization queue.
- The user selected free hosting first on November 3, 2026.
- The user confirmed retaining LiftUp's existing design and features for the Android adaptation.
- Password recovery and email verification were previously excluded by the user.
- The hosted website and API are at https://liftup-ldlv.onrender.com/. The test phone is a Samsung SM-A736B running Android 16. The submission deadline remains unconfirmed.

## Brand Commitments

Keep LiftUp's existing name, logo, typography, light and dark themes, and visual identity. Adapt layout and interactions to phone use.

## Evidence on Hand

- Existing routes and implementations are in src/pages, src/layouts, and src/composables.
- Existing phone screenshot references are in ../artifacts. They are historical layout references, not proof of a completed Android application.
- The Android project is initialized in src-capacitor/android. Native build and real-device checks are in progress; this is not yet release evidence.

## Product Principles

- Saving a workout must give clear confirmation or a recoverable error.
- Keep each account's training records private to that account.
- Preserve a user's current workout while moving between screens or recovering from a connection failure.
- Describe camera counts as estimates and let the user review them before saving.
- Make the main training tasks usable on the user's real Android phone.
