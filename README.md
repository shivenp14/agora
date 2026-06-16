# Agora

AI-powered campus event discovery from event pages, flyers, and student organization listings.

Agora is a macOS desktop app that helps students discover relevant campus events by automatically scanning event listings, extracting flyer text with OCR, and using LLM-based classification to rank events by student-relevant attributes.

## Problem

Campus event platforms often contain dozens of listings with inconsistent descriptions, flyer-only details, and limited filtering. Students may miss useful opportunities because important information is buried in images, vague descriptions, or long event feeds.

Agora treats campus event discovery as an information retrieval problem: collect the available listings, extract the details that matter, classify the signals students care about, and rank the events so useful opportunities are easier to evaluate.

## Solution

Agora automates campus event discovery by collecting current event listings, extracting text from both event metadata and promotional flyers, and applying AI classification to surface the events most likely to be relevant to students.

## What It Does

- Signs into Ducklink through the embedded browser flow
- Scrapes current campus event listings from the Events tab
- Downloads and processes attached event flyers and posters
- Runs OCR on flyer images to recover details that are not present in structured event metadata
- Uses NVIDIA NIM for LLM-based classification of student-relevant event attributes, currently focused on food and refreshments
- Ranks classified events so high-value opportunities appear first
- Caches scan results and stores the API key securely on the machine

## Tech Stack

- Electron
- React
- Playwright
- Tesseract.js
- NVIDIA NIM
- electron-store

## Requirements

- macOS
- Node.js and npm
- A valid NVIDIA API key for AI classification

## Getting Started

```bash
npm install
npm run dev
```

On first launch, enter your NVIDIA API key in the app settings.

## Available Scripts

- `npm run dev` - Start the app in development mode
- `npm run build` - Build the main and renderer bundles
- `npm run preview` - Preview the production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript checks for main and renderer
- `npm run pack` - Build and create an unpacked desktop app
- `npm run dist` - Build and create distributable packages
- `npm run dist:mac` - Build the macOS release artifacts locally
- `npm run dist:mac:publish` - Build and publish the macOS release to GitHub Releases
- `npm run cli` - Run the CLI entry point
- `npm run bench` - Run model benchmarking utilities

## App Flow

1. Open the app and start a scan.
2. Let the app load Ducklink and scrape the Events tab.
3. Wait while event metadata, flyer OCR, and AI classification run.
4. Review the ranked event results, with refreshment-related events currently surfaced as a primary signal.

```text
┌────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│ Start Scan │ ->│ Ducklink Events  │ ->│ Scrape event cards   │
└────────────┘   │ tab              │   │ + attached images    │
                 └──────────────────┘   └──────────┬───────────┘
                                                    │
                                      ┌─────────────┴─────────────┐
                                      │                           │
                         ┌──────────────────────┐    ┌──────────────────────┐
                         │ Event metadata       │    │ Flyer/poster text    │
                         │ name / time / loc    │    │ OCR with Tesseract   │
                         └────────────┬─────────┘    └────────────┬─────────┘
                                      │                           │
                                      └─────────────┬─────────────┘
                                                    │
                                      ┌─────────────▼─────────────┐
                                      │ Merge text + send to NIM  │
                                      └─────────────┬─────────────┘
                                                    │
                                      ┌─────────────▼─────────────┐
                                      │ Classify + rank results   │
                                      └─────────────┬─────────────┘
                                                    │
                                          ┌─────────▼─────────┐
                                          │ Display results   │
                                          └───────────────────┘
```

## Current Progress / Implementation

Agora currently implements the core event intelligence pipeline: sign in through Ducklink, scrape campus event listings, collect attached flyer images, extract flyer text with OCR, classify events with NVIDIA NIM, rank the results, cache scan data, and store the API key securely.

The current ranking signal focuses on events that mention food or refreshments. That is useful because many campus postings mention pizza, snacks, catered meals, or refreshments only inside flyer images or unstructured descriptions.

## Future Goal / Vision

Agora's longer-term vision is broader campus event intelligence: a student-focused discovery system that identifies relevant opportunities across inconsistent event listings, flyers, and organization posts.

The architecture is intended to support additional event categories such as career events, club meetings, workshops, networking opportunities, and social activities, with food and refreshment detection becoming one ranking signal among many.

## Project Structure

- `src/main` - Electron main process, services, and IPC handlers
- `src/preload` - Safe bridge between Electron and the renderer
- `src/renderer` - React UI, screens, components, and hooks
- `docs` - Architecture and implementation notes

## Packaging

The macOS build outputs both DMG and ZIP artifacts via Electron Builder.

## Auto Updates

The app now includes an in-app updater flow in Settings:

- `Check for Updates` asks the update feed for a newer packaged release
- `Download Update` pulls the new release without requiring a manual reinstall
- `Restart to Update` closes the app and installs the downloaded build

This project is configured to use GitHub Releases from `shivenp14/agora`.

To publish an update:

```bash
export GH_TOKEN=your_github_personal_access_token
npm version patch
npm run dist:mac:publish
```

That publish step uploads the generated `.dmg`, `.zip`, and update metadata needed by `electron-updater`.

Your token needs GitHub permissions that can create releases and upload release assets for this repo.

Testing flow:

1. Install an older packaged version of the app.
2. Publish a newer version to GitHub Releases.
3. Open the installed older app and go to Settings.
4. Press `Check for Updates`, then `Download Update`, then `Restart to Update`.

Auto-updates remain intentionally disabled in `npm run dev`.

## License

MIT
