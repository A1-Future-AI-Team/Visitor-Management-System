# Visitor Management System (VMS) Backend

This is the backend for the Visitor Management System, built with **FastAPI**. It handles visitor registration, QR code generation, and biometric verification using **DeepFace (ArcFace model)**.

## Configuration

Copy the example environment file and tweak as needed:

```bash
cp .env.example .env
```

At minimum, set a strong admin API key for protecting admin endpoints:

```bash
# .env
ADMIN_API_KEY=super-secret-token
```

If you are also running the frontend UI, set the public version as well:

```bash
# .env.local (Next.js frontend)
NEXT_PUBLIC_ADMIN_API_KEY=super-secret-token
```

## Prerequisites

-   **Python 3.9+**
-   **CMake** (recommended for some underlying libraries):
    ```bash
    brew install cmake
    ```

## Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
    *Note: internal dependencies like `deepface`, `tensorflow`, `numpy` will be installed.*

## Running the Server

Start the development server:
```bash
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
-   **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
-   **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## API Usage (cURL Commands)

Ensure the server is running and you have test images (e.g., `person.jpg`) in your directory.

### 1. Register a Visitor
**Endpoint**: `POST /visitors/register`
**Description**: Register a new visitor with their details and a reference photo.

```bash
curl -X 'POST' \
  'http://localhost:8000/visitors/register' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'name=John Doe' \
  -F 'phone=1234567890' \
  -F 'email=john@example.com' \
  -F 'image=@person_a_1.jpg;type=image/jpeg'
```
*Returns*: Visitor object with `id`.

### 2. Generate QR Code
**Endpoint**: `GET /visitors/{id}/qr`
**Description**: Get a QR code for a specific visitor ID (e.g., ID `1`).

```bash
curl -X 'GET' \
  'http://localhost:8000/visitors/1/qr' \
  -H 'accept: image/png' \
  --output qr.png
```
*Returns*: PNG image file (saved as `qr.png`).

### 3. Check-In (Verification)
**Endpoint**: `POST /check-in`
**Description**: Verify a visitor by uploading a live photo and their Visitor ID. The system matches the live photo against the registered reference photo.

```bash
curl -X 'POST' \
  'http://localhost:8000/check-in' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'visitor_id=1' \
  -F 'image=@person_a_2.jpg;type=image/jpeg'
```
*Returns*: JSON with `decision` ("ALLOW"/"DENY") and `confidence_score`.

### 4. Admin Endpoints (Protected)
The following endpoints require a valid admin API key. Provide it via `Authorization: Bearer <ADMIN_API_KEY>`.

#### Get all visitors
```bash
curl -X 'GET' \
  'http://localhost:8000/admin/visitors' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer <ADMIN_API_KEY>'
```

#### Identify a visitor (face match)
**Endpoint**: `POST /identify`

```bash
curl -X 'POST' \
  'http://localhost:8000/identify' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer <ADMIN_API_KEY>' \
  -H 'Content-Type: multipart/form-data' \
  -F 'image=@person_a_2.jpg;type=image/jpeg'
```

## Automated Testing
Run the verification script to test the full flow:
```bash
python3 verify.py
```
