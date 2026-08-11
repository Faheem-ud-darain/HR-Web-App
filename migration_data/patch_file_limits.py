import json
import sys
import requests

PB_URL = "https://pb.delcargo.us"
ADMIN_EMAIL = "studiozsparx@gmail.com"
ADMIN_PASSWORD = "Fah123@123"

def get_admin_token():
    resp = requests.post(
        f"{PB_URL}/api/admins/auth-with-password",
        json={"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["token"]

def get_collection(token, name):
    resp = requests.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code == 200:
        return resp.json()
    return None

def patch_collection(token, collection_data, max_size, field_name="attachment"):
    schema = collection_data["schema"]
    for field in schema:
        if field["name"] == field_name:
            field["options"]["maxSize"] = max_size
            break
            
    resp = requests.patch(
        f"{PB_URL}/api/collections/{collection_data['id']}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"schema": schema},
        timeout=20,
    )
    if resp.status_code >= 300:
        print(f"Failed to update {collection_data['name']}: HTTP {resp.status_code}")
        print(resp.text)
        sys.exit(1)
    print(f"Successfully bumped {collection_data['name']}.{field_name} maxSize to {max_size}")

def main():
    token = get_admin_token()
    
    # Update hr_messages (chat attachments) to 100MB
    hr_messages = get_collection(token, "hr_messages")
    if hr_messages:
        patch_collection(token, hr_messages, 100 * 1024 * 1024, "attachment")
        
    # Update hr_team_documents (documents panel) to 200MB
    hr_docs = get_collection(token, "hr_team_documents")
    if hr_docs:
        patch_collection(token, hr_docs, 200 * 1024 * 1024, "file")

if __name__ == "__main__":
    main()
