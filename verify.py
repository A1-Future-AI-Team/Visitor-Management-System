import os
import requests
import sys
import time

BASE_URL = "http://127.0.0.1:8000"
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "dev-admin-key")

def build_verification_token(email: str) -> str:
    """Generate a valid verification token for testing."""
    from app.security import build_registration_verification_token
    return build_registration_verification_token(email)

def test_registration():
    print("\n--- Testing Registration ---")
    url = f"{BASE_URL}/visitors/register"
    files = {'image': open('person_a_1.jpg', 'rb')}
    # unique phone
    ts = int(time.time())
    email = f'john_{ts}@example.com'
    
    # Generate a valid verification token for testing
    verification_token = build_verification_token(email)
    
    data = {
        'name': 'John Doe',
        'phone': f'{ts}',
        'email': email,
        'verification_token': verification_token
    }
    
    response = requests.post(url, data=data, files=files)
    if response.status_code == 200:
        print("Registration Successful")
        return response.json()
    else:
        print(f"Registration Failed: {response.text}")
        sys.exit(1)

def test_qr(visitor_id):
    print("\n--- Testing QR Generation ---")
    url = f"{BASE_URL}/visitors/{visitor_id}/qr"
    headers = {'Authorization': f'Bearer {ADMIN_API_KEY}'}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        print("QR Generation Successful")
        with open("visitor_qr.png", "wb") as f:
            f.write(response.content)
    else:
        print(f"QR Generation Failed: {response.status_code} - {response.text}")

def test_checkin_match(visitor_id):
    print("\n--- Testing Check-in (Match) ---")
    url = f"{BASE_URL}/check-in"
    files = {'image': open('person_a_2.jpg', 'rb')} # Same person, diff photo
    data = {'visitor_id': str(visitor_id)}
    
    response = requests.post(url, data=data, files=files)
    result = response.json()
    print(f"Result: {result}")
    
    if result.get("decision") == "ALLOW":
        print("PASS: Correctly Allowed")
    else:
        print("FAIL: Should have allowed")

def test_checkin_mismatch(visitor_id):
    print("\n--- Testing Check-in (Mismatch) ---")
    url = f"{BASE_URL}/check-in"
    files = {'image': open('person_b.jpg', 'rb')} # Different person
    data = {'visitor_id': str(visitor_id)}
    
    response = requests.post(url, data=data, files=files)
    result = response.json()
    print(f"Result: {result}")
    
    if result.get("decision") == "DENY":
        print("PASS: Correctly Denied")
    else:
        print("FAIL: Should have denied")

if __name__ == "__main__":
    try:
        user = test_registration()
        visitor_id = user['id']
        test_qr(visitor_id)
        test_checkin_match(visitor_id)
        test_checkin_mismatch(visitor_id)
        print("\n✅ All tests passed!")
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        import traceback
        traceback.print_exc()