> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# Technical Architecture: Learn Wren

This document outlines the recommended technical architecture for the Learn Wren platform. The architecture is designed to be modular, scalable, and self-hostable, using open-source technologies wherever possible.

---

## System Architecture Diagram

```mermaid
graph TD
    subgraph "User Layer"
        A[Web Browser] --> B{Load Balancer / Reverse Proxy};
    end

    subgraph "Application Layer"
        B --> C[Frontend (React/Vue)];
        B --> D[Backend API (Node.js/Python)];
    end

    subgraph "Data Layer"
        D --> E[PostgreSQL Database];
        D --> F[Redis Cache];
        D --> G[Object Storage (MinIO)];
    end

    subgraph "Video Pipeline"
        D --> H[Transcoding Worker];
        H --> G;
        H --> I[DRM Service];
        I --> J[DRM Key Store];
    end

    subgraph "DRM & Playback"
        C --> K[Video Player (Shaka/Video.js)];
        K --> G;
        K --> I;
    end
```

---

## Technology Stack

| Layer | Component | Recommended Technology | Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend** | Web Application | React or Vue.js | Mature ecosystems, component-based architecture, strong community support. |
| **Backend** | API Server | Node.js (Express/Fastify) or Python (Django/FastAPI) | Both are well-suited for building RESTful or GraphQL APIs with strong LMS ecosystem support. |
| **Database** | Relational Data | PostgreSQL | Robust, open-source RDBMS with excellent support for complex queries and JSONB for flexible data. |
| **Cache** | Session and Metadata | Redis | In-memory data store for session tokens, rate limiting, and caching course metadata. |
| **Object Storage** | Video and File Storage | MinIO | Self-hosted, S3-compatible object storage ideal for large video files. |
| **Video Transcoding** | Pipeline | FFmpeg + Worker Queue (BullMQ/Celery) | FFmpeg is the industry-standard open-source transcoding tool; a message queue manages asynchronous jobs. |
| **Video Packaging** | HLS/DASH Packaging | Shaka Packager | Open-source tool from Google for packaging video into HLS and DASH with CENC encryption. |
| **DRM** | License Server | Widevine (Google), PlayReady (Microsoft), FairPlay (Apple) via EZDRM or a self-hosted solution | Multi-DRM ensures compatibility across all major browsers and devices. |
| **Video Player** | Web Player | Shaka Player or Video.js with DRM plugins | Both are open-source, support HLS/DASH, and integrate with Widevine, PlayReady, and FairPlay. |
| **Authentication** | Identity Provider | Keycloak (self-hosted) or custom JWT implementation | Keycloak provides enterprise-grade SSO, OAuth2, and OIDC support out of the box. |
| **Deployment** | Containerisation | Docker + Docker Compose | Simplifies self-hosted deployment and ensures environment consistency. |
| **CDN / Reverse Proxy** | Content Delivery | Nginx + optional CDN (e.g., Bunny.net) | Nginx serves as a reverse proxy and can deliver HLS segments; a CDN reduces latency for geographically distributed users. |

---

## Data Models

### User

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `email` | String | Unique email address |
| `password_hash` | String | Hashed password |
| `display_name` | String | User's public name |
| `role` | Enum | `STUDENT`, `INSTRUCTOR`, `ADMIN` |
| `created_at` | Timestamp | ... |
| `updated_at` | Timestamp | ... |

### Course

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `title` | String | ... |
| `description` | Text | ... |
| `instructor_id` | UUID | Foreign Key to User |
| `status` | Enum | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `created_at` | Timestamp | ... |
| `updated_at` | Timestamp | ... |

### Module

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `title` | String | ... |
| `course_id` | UUID | Foreign Key to Course |
| `order` | Integer | ... |
| `created_at` | Timestamp | ... |
| `updated_at` | Timestamp | ... |

### Lesson

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `title` | String | ... |
| `module_id` | UUID | Foreign Key to Module |
| `video_url` | String | URL to the HLS/DASH manifest |
| `order` | Integer | ... |
| `created_at` | Timestamp | ... |
| `updated_at` | Timestamp | ... |

### Enrollment

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `user_id` | UUID | Foreign Key to User |
| `course_id` | UUID | Foreign Key to Course |
| `progress` | JSONB | Stores completion status of lessons |
| `created_at` | Timestamp | ... |
| `updated_at` | Timestamp | ... |
