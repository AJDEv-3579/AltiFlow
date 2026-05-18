#!/usr/bin/env python3
"""
Backend test for Refly Round-Robin Assignment
Tests that successive refly-triggering projects rotate through team members correctly.
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://stream-audit-portal.preview.emergentagent.com/api"

def test_refly_round_robin():
    """
    Test that refly automation correctly rotates assignments through Rohit, Shalini, Advik.
    """
    print("\n" + "="*80)
    print("REFLY ROUND-ROBIN ASSIGNMENT TEST")
    print("="*80)
    
    try:
        # Step 1: Login as TestSLA client user to create projects
        print("\n[1] Logging in as TestSLA client user...")
        login_response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": "testsla_user", "password": "WelcometoAlti@123"},
            timeout=10
        )
        
        if login_response.status_code == 401:
            print("   ⚠️  TestSLA user not found or wrong password, trying to create...")
            # Login as admin to create client and user
            admin_login = requests.post(
                f"{BASE_URL}/auth/login",
                json={"username": "devbond01", "password": "63pk0wpT@123"},
                timeout=10
            )
            if admin_login.status_code != 200:
                print(f"   ❌ Admin login failed: {admin_login.status_code}")
                return False
            
            admin_token = admin_login.json()["token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            
            # Create TestSLA client
            client_response = requests.post(
                f"{BASE_URL}/clients",
                json={"name": "TestSLA", "contact_email": "testsla@example.com"},
                headers=admin_headers,
                timeout=10
            )
            if client_response.status_code == 201:
                client_id = client_response.json()["id"]
                print(f"   ✅ Created TestSLA client: {client_id}")
            else:
                # Client might already exist, try to get it
                clients_response = requests.get(f"{BASE_URL}/clients", headers=admin_headers, timeout=10)
                if clients_response.status_code == 200:
                    clients_data = clients_response.json()
                    # Handle both list and dict responses
                    if isinstance(clients_data, list):
                        clients = clients_data
                    elif isinstance(clients_data, dict) and "clients" in clients_data:
                        clients = clients_data["clients"]
                    else:
                        clients = []
                    
                    testsla_client = next((c for c in clients if c.get("name") == "TestSLA"), None)
                    if testsla_client:
                        client_id = testsla_client["id"]
                        print(f"   ✅ Found existing TestSLA client: {client_id}")
                    else:
                        print(f"   ❌ Failed to create/find TestSLA client")
                        return False
                else:
                    print(f"   ❌ Failed to get clients: {clients_response.status_code}")
                    return False
            
            # Create TestSLA user
            user_response = requests.post(
                f"{BASE_URL}/users",
                json={
                    "username": "testsla_user",
                    "password": "WelcometoAlti@123",
                    "role": "Client",
                    "client_id": client_id
                },
                headers=admin_headers,
                timeout=10
            )
            if user_response.status_code == 201:
                print(f"   ✅ Created testsla_user")
            else:
                print(f"   ⚠️  User creation returned {user_response.status_code}, might already exist")
            
            # Try login again
            login_response = requests.post(
                f"{BASE_URL}/auth/login",
                json={"username": "testsla_user", "password": "WelcometoAlti@123"},
                timeout=10
            )
        
        if login_response.status_code != 200:
            print(f"   ❌ Login failed: {login_response.status_code} - {login_response.text}")
            return False
        
        user_data = login_response.json()
        token = user_data["token"]
        client_id = user_data["user"]["client_id"]
        headers = {"Authorization": f"Bearer {token}"}
        print(f"   ✅ Logged in as testsla_user (client_id: {client_id})")
        
        # Step 1b: Also login as admin to view assignee names
        print("\n[1b] Logging in as admin to view assignee names...")
        admin_login = requests.post(
            f"{BASE_URL}/auth/login",
            json={"username": "devbond01", "password": "63pk0wpT@123"},
            timeout=10
        )
        if admin_login.status_code != 200:
            print(f"   ❌ Admin login failed: {admin_login.status_code}")
            return False
        admin_token = admin_login.json()["token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print(f"   ✅ Logged in as admin")
        
        # Step 2: Upload 3 successive refly-triggering projects
        print("\n[2] Uploading 3 refly-triggering projects...")
        print("    (image_count=200, csv_count=180, base_rover_bool=false)")
        print("    Expected: Each project assigned to DIFFERENT team member")
        
        assignments = []
        project_ids = []
        
        for i in range(3):
            project_data = {
                "title": f"RoundRobin_Test_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{i+1}",
                "drone_name": "DJI_Phantom_4",
                "capture_date": "2025-01-15",
                "image_count": 200,
                "csv_count": 180,
                "base_rover_bool": False,
                "grid_file_bool": False,
                "client_id": client_id
            }
            
            response = requests.post(
                f"{BASE_URL}/projects",
                json=project_data,
                headers=headers,
                timeout=10
            )
            
            if response.status_code not in [200, 201]:
                print(f"   ❌ Project {i+1} creation failed: {response.status_code} - {response.text}")
                return False
            
            project = response.json().get("project", response.json())
            project_id = project["id"]
            project_ids.append(project_id)
            
            # Fetch project as admin to get assignee_name
            project_response = requests.get(
                f"{BASE_URL}/projects",
                headers=admin_headers,
                timeout=10
            )
            if project_response.status_code != 200:
                print(f"   ❌ Failed to fetch projects as admin: {project_response.status_code}")
                return False
            
            projects = project_response.json().get("projects", [])
            created_project = next((p for p in projects if p["id"] == project_id), None)
            
            if not created_project:
                print(f"   ❌ Could not find created project {project_id}")
                return False
            
            assignee = created_project.get("assignee_name", "NONE")
            assignments.append(assignee)
            
            print(f"   Project {i+1}: {project['title']}")
            print(f"      Status: {project['status']}")
            print(f"      Assigned to: {assignee}")
            
            # Verify it's a refly project
            if project["status"] != "Failed_Refly":
                print(f"   ❌ Expected status=Failed_Refly, got {project['status']}")
                return False
        
        print(f"\n   Assignments for 3 projects: {assignments}")
        
        # Step 3: Verify all 3 assignments are DIFFERENT
        print("\n[3] Verifying round-robin rotation...")
        unique_assignments = set(assignments)
        
        if len(unique_assignments) != 3:
            print(f"   ❌ ROUND-ROBIN FAILED: Expected 3 different assignees, got {len(unique_assignments)}")
            print(f"      Assignments: {assignments}")
            print(f"      Unique: {unique_assignments}")
            return False
        
        # Verify all are valid team members
        valid_team = {'Rohit', 'Shalini', 'Advik'}
        if not unique_assignments.issubset(valid_team):
            print(f"   ❌ Invalid assignees: {unique_assignments - valid_team}")
            return False
        
        print(f"   ✅ All 3 projects assigned to DIFFERENT team members: {assignments}")
        
        # Step 4: Upload 4th project and verify wrap-around
        print("\n[4] Uploading 4th refly project to verify wrap-around...")
        
        project_data = {
            "title": f"RoundRobin_Test_{datetime.now().strftime('%Y%m%d_%H%M%S')}_4",
            "drone_name": "DJI_Phantom_4",
            "capture_date": "2025-01-15",
            "image_count": 200,
            "csv_count": 180,
            "base_rover_bool": False,
            "grid_file_bool": False,
            "client_id": client_id
        }
        
        response = requests.post(
            f"{BASE_URL}/projects",
            json=project_data,
            headers=headers,
            timeout=10
        )
        
        if response.status_code not in [200, 201]:
            print(f"   ❌ Project 4 creation failed: {response.status_code} - {response.text}")
            return False
        
        project = response.json().get("project", response.json())
        project_id = project["id"]
        
        # Fetch project as admin to get assignee_name
        project_response = requests.get(
            f"{BASE_URL}/projects",
            headers=admin_headers,
            timeout=10
        )
        if project_response.status_code != 200:
            print(f"   ❌ Failed to fetch projects as admin: {project_response.status_code}")
            return False
        
        projects = project_response.json().get("projects", [])
        created_project = next((p for p in projects if p["id"] == project_id), None)
        
        if not created_project:
            print(f"   ❌ Could not find created project {project_id}")
            return False
        
        fourth_assignee = created_project.get("assignee_name", "NONE")
        print(f"   Project 4: {project['title']}")
        print(f"      Assigned to: {fourth_assignee}")
        
        # Verify wrap-around: 4th should match 1st
        if fourth_assignee != assignments[0]:
            print(f"   ❌ WRAP-AROUND FAILED: Expected {assignments[0]}, got {fourth_assignee}")
            return False
        
        print(f"   ✅ Wrap-around correct: 4th project assigned to {fourth_assignee} (same as 1st)")
        
        # Final summary
        print("\n" + "="*80)
        print("✅ REFLY ROUND-ROBIN TEST PASSED")
        print("="*80)
        print(f"   Sequence: {assignments[0]} → {assignments[1]} → {assignments[2]} → {fourth_assignee}")
        print(f"   All 3 team members rotated correctly")
        print(f"   Wrap-around verified")
        print("="*80 + "\n")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Network error: {e}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_refly_round_robin()
    exit(0 if success else 1)
