# OpenPLC Studio Frontend

![OpenPLC Studio banner](https://raw.githubusercontent.com/CIMIL/openplc-studio/main/assets/banner.png)

[![Unit tests](https://github.com/filippodaniotti/openplc-studio-frontend/actions/workflows/tests.yml/badge.svg)](https://github.com/filippodaniotti/openplc-studio-frontend/actions/workflows/tests.yml)
[![Build and publish](https://github.com/filippodaniotti/openplc-studio-frontend/actions/workflows/publish-image.yml/badge.svg)](https://github.com/filippodaniotti/openplc-studio-frontend/actions/workflows/publish-image.yml)
[![Docker pulls](https://img.shields.io/docker/pulls/cimil/openplc-studio-frontend?logo=docker&label=Docker%20pulls)](https://hub.docker.com/r/cimil/openplc-studio-frontend)
[![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker image](https://img.shields.io/badge/container-linux%2Famd64-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/cimil/openplc-studio-frontend)

Web application for **OpenPLC Studio**, a platform for configuring, executing, and analysing PLC audio-codec test runs. It provides the browser interface for the OpenPLC Studio backend and is published as a compact production-ready container image.

> This README is about the frontend application. For the complete, ready-to-run platform and its deployment documentation, see [OpenPLC Studio](https://github.com/CIMIL/openplc-studio).

## What it does

- Guides users through creating and validating test-run configurations.
- Uploads and manages original audio tracks.
- Presents a backlog of submitted and completed runs.
- Streams live run progress and completion events from the backend.
- Provides an analysis workspace for results, metrics, waveforms, spectrograms, and reconstructed tracks.
- Supports exporting artifacts and run configuration from the platform.

The application is an Angular single-page application (SPA). It communicates with the backend using same-origin `/api` requests and subscribes to `/ws/runs` for real-time updates. In production, the OpenPLC Studio reverse proxy routes API and WebSocket traffic to the backend while serving this frontend separately.

```text
browser
  │
  ├── /             → Angular SPA
  ├── /api/*        → OpenPLC Studio backend
  └── /ws/runs      → run-progress WebSocket
```

Using relative URLs keeps the image environment-independent: deployment-specific routing, TLS, and service discovery belong to the surrounding OpenPLC Studio stack rather than to the built frontend bundle.

## Technology

| Area               | Technology                         |
| ------------------ | ---------------------------------- |
| Application        | Angular 19, TypeScript, RxJS       |
| UI                 | PrimeNG, Prime Icons, Tailwind CSS |
| Visualisation      | Chart.js, WaveSurfer.js            |
| Real-time updates  | RxJS WebSocket client              |
| Build and delivery | Angular CLI, npm, Docker Buildx    |

## Container image

The published image is [`cimil/openplc-studio-frontend`](https://hub.docker.com/r/cimil/openplc-studio-frontend). It uses a multi-stage build: Node builds the optimized Angular bundle, then an unprivileged NGINX image serves only the static files on port `8080`.

The image deliberately does **not** proxy `/api` or `/ws`; those routes are owned by the platform reverse proxy.

| Tag            | Intended use                                   |
| -------------- | ---------------------------------------------- |
| `latest`       | Current build from `master`                    |
| `sha-<commit>` | Immutable build for a specific source revision |

Production images target **`linux/amd64`**. The [OpenPLC Studio deployment repository](https://github.com/CIMIL/openplc-studio) combines this image with the backend and supporting services.

## Application structure

```text
src/app/
├── analyser/           # Results, metrics, waveform, and spectrogram views
├── backlog/            # Run list and status overview
├── run-configurator/    # Audio and module configuration workflow
├── run-progress/       # Live processing progress
├── shared/             # API clients, DTOs, WebSocket, and common UI utilities
└── header/             # Application navigation and theme controls
.docker/                # Local and production container definitions
```

## Delivery

A GitHub Actions workflow builds the production image on every push to `master` and publishes both `latest` and an immutable `sha-<commit>` tag to Docker Hub. The production image includes an HTTP health check and OCI image metadata.

**Keywords:** `OpenPLC` · `PLC` · `audio codec` · `testbench` · `Angular` · `TypeScript` · `PrimeNG` · `Chart.js` · `WaveSurfer` · `WebSocket` · `Docker` · `CI/CD`
