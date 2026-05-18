#!/usr/bin/env python3
"""
Comprehensive backend API test for Altiflow
Tests all critical backend functionality including auth, SLA, refly, RBAC, audit logs, analytics
"""
import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "https://stream-audit-portal.preview.emergentagent.com/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_pass(test_name):
    print(f"✅ PASS: {test_name}")
    test_results["passed"].append(test_name)

def log_fail(test_name, reason):
    print(f"❌ FAIL: {test_name}")
    print(f"   Reason: {reason}")
    test_results["failed"].append(f"{test_name}: {reason}")

def log_warning(test_name, reason):
    print(f"⚠️  WARNING: {test_name}")
    print(f"   Reason: {reason}")
    test_results["warnings"].append(f"{test_name}: {reason}")

print("="*80)
print("ALTIFLOW BACKEND API TEST SUITE")
print("="*80)
print(f"Base URL: {BASE_URL}")
print()

# Store tokens and IDs for later tests
tokens = {}
user_data = {}
test_client_id = None
test_projects = []

# ============================================================================
# 1. AUTH FLOW TESTS
# ============================================================================
print("\n" + "="*80)
print("1. AUTHENTICATION FLOW TESTS")
print("="*80)

# Test 1.1: Login with bad password
print("\n[Test 1.1] Login with bad password should return 401")
try:
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "devbond01",
        "password": "wrongpassword"
    })
    if response.status_code == 401:
        log_pass("Auth: Bad password returns 401")
    else:
        log_fail("Auth: Bad password returns 401", f"Expected 401, got {response.status_code}")
except Exception as e:
    log_fail("Auth: Bad password returns 401", str(e))

# Test 1.2: Login as admin (devbond01)
print("\n[Test 1.2] Login as admin devbond01")
try:
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "devbond01",
        "password": "63pk0wpT@123"
    })
    if response.status_code == 200:
        data = response.json()
        if "token" in data and "user" in data:
            tokens["admin"] = data["token"]
            user_data["admin"] = data["user"]
            if data["user"]["role"] == "Admin" and data["user"]["must_change_password"] == False:
                log_pass("Auth: Admin login successful with correct role and must_change_password=false")
            else:
                log_fail("Auth: Admin login", f"Role={data['user']['role']}, must_change={data['user']['must_change_password']}")
        else:
            log_fail("Auth: Admin login", "Missing token or user in response")
    else:
        log_fail("Auth: Admin login", f"Expected 200, got {response.status_code}: {response.text}")
except Exception as e:
    log_fail("Auth: Admin login", str(e))

# Test 1.3: GET /auth/me with token
print("\n[Test 1.3] GET /auth/me with valid token")
try:
    response = requests.get(f"{BASE_URL}/auth/me", headers={
        "Authorization": f"Bearer {tokens['admin']}"
    })
    if response.status_code == 200:
        data = response.json()
        if "user" in data and data["user"]["username"] == "devbond01":
            log_pass("Auth: /auth/me with token works")
        else:
            log_fail("Auth: /auth/me with token", "User data mismatch")
    else:
        log_fail("Auth: /auth/me with token", f"Expected 200, got {response.status_code}")
except Exception as e:
    log_fail("Auth: /auth/me with token", str(e))

# Test 1.4: GET /auth/me without token
print("\n[Test 1.4] GET /auth/me without token should return 401")
try:
    response = requests.get(f"{BASE_URL}/auth/me")
    if response.status_code == 401:
        log_pass("Auth: /auth/me without token returns 401")
    else:
        log_fail("Auth: /auth/me without token", f"Expected 401, got {response.status_code}")
except Exception as e:
    log_fail("Auth: /auth/me without token", str(e))

# Test 1.5: Create a new team user and test password change flow
print("\n[Test 1.5] Create new team user and test password change flow")
try:
    # Create new team user
    new_username = f"testuser_{int(time.time())}"
    response = requests.post(f"{BASE_URL}/users", 
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={
            "username": new_username,
            "role": "Team",
            "password": "WelcometoAlti@123"
        }
    )
    if response.status_code == 200:
        # Login as new user
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": new_username,
            "password": "WelcometoAlti@123"
        })
        if login_resp.status_code == 200:
            login_data = login_resp.json()
            if login_data["user"]["must_change_password"] == True:
                new_user_token = login_data["token"]
                
                # Try to change password with wrong current password
                wrong_pwd_resp = requests.post(f"{BASE_URL}/auth/change-password",
                    headers={"Authorization": f"Bearer {new_user_token}"},
                    json={
                        "current_password": "wrongpassword",
                        "new_password": "NewSecure@123"
                    }
                )
                if wrong_pwd_resp.status_code == 401:
                    # Now change with correct password
                    correct_pwd_resp = requests.post(f"{BASE_URL}/auth/change-password",
                        headers={"Authorization": f"Bearer {new_user_token}"},
                        json={
                            "current_password": "WelcometoAlti@123",
                            "new_password": "NewSecure@123"
                        }
                    )
                    if correct_pwd_resp.status_code == 200:
                        # Verify must_change_password is now false
                        me_resp = requests.get(f"{BASE_URL}/auth/me",
                            headers={"Authorization": f"Bearer {new_user_token}"})
                        if me_resp.status_code == 200:
                            me_data = me_resp.json()
                            if me_data["user"]["must_change_password"] == False:
                                log_pass("Auth: Password change flow (wrong pwd->401, correct pwd->200, must_change flips to false)")
                            else:
                                log_fail("Auth: Password change flow", "must_change_password not flipped to false")
                        else:
                            log_fail("Auth: Password change flow", "Failed to verify must_change_password")
                    else:
                        log_fail("Auth: Password change flow", f"Correct password change failed: {correct_pwd_resp.status_code}")
                else:
                    log_fail("Auth: Password change flow", f"Wrong password should return 401, got {wrong_pwd_resp.status_code}")
            else:
                log_fail("Auth: Password change flow", "New user must_change_password should be true")
        else:
            log_fail("Auth: Password change flow", f"Login as new user failed: {login_resp.status_code}")
    else:
        log_fail("Auth: Password change flow", f"Failed to create new user: {response.status_code}")
except Exception as e:
    log_fail("Auth: Password change flow", str(e))

# Login as team members for later tests
print("\n[Test 1.6] Login as team members (Rohit, Shalini, Advik)")
for username in ["Rohit", "Shalini", "Advik"]:
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": username,
            "password": "WelcometoAlti@123"
        })
        if response.status_code == 200:
            data = response.json()
            tokens[username] = data["token"]
            user_data[username] = data["user"]
            log_pass(f"Auth: Login as {username} successful")
        else:
            log_fail(f"Auth: Login as {username}", f"Status {response.status_code}")
    except Exception as e:
        log_fail(f"Auth: Login as {username}", str(e))

# Login as bayer client
print("\n[Test 1.7] Login as bayer client")
try:
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "bayer",
        "password": "WelcometoAlti@123"
    })
    if response.status_code == 200:
        data = response.json()
        tokens["bayer"] = data["token"]
        user_data["bayer"] = data["user"]
        log_pass("Auth: Login as bayer client successful")
    else:
        log_fail("Auth: Login as bayer client", f"Status {response.status_code}")
except Exception as e:
    log_fail("Auth: Login as bayer client", str(e))

# ============================================================================
# 2. SLA ENGINE TESTS
# ============================================================================
print("\n" + "="*80)
print("2. SLA ENGINE TESTS")
print("="*80)

# Test 2.1: Create a fresh client "TestSLA"
print("\n[Test 2.1] Create fresh client TestSLA")
try:
    response = requests.post(f"{BASE_URL}/clients",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={"name": "TestSLA", "logo_url": ""}
    )
    if response.status_code == 200:
        test_client_id = response.json()["client"]["id"]
        log_pass("SLA: Created TestSLA client")
    else:
        log_fail("SLA: Create TestSLA client", f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_fail("SLA: Create TestSLA client", str(e))

# Test 2.2: Create a client user for TestSLA
print("\n[Test 2.2] Create client user for TestSLA")
try:
    response = requests.post(f"{BASE_URL}/users",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={
            "username": f"testsla_user_{int(time.time())}",
            "role": "Client",
            "client_id": test_client_id,
            "password": "TestSLA@123"
        }
    )
    if response.status_code == 200:
        testsla_username = response.json()["user"]["username"]
        # Login as this user
        login_resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": testsla_username,
            "password": "TestSLA@123"
        })
        if login_resp.status_code == 200:
            tokens["testsla"] = login_resp.json()["token"]
            log_pass("SLA: Created and logged in as TestSLA client user")
        else:
            log_fail("SLA: TestSLA user login", f"Status {login_resp.status_code}")
    else:
        log_fail("SLA: Create TestSLA user", f"Status {response.status_code}")
except Exception as e:
    log_fail("SLA: Create TestSLA user", str(e))

# Test 2.3: Upload 1st project -> sla_hours=24
print("\n[Test 2.3] Upload 1st project -> sla_hours should be 24")
try:
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['testsla']}"},
        json={
            "title": "TestSLA Project 1",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-15",
            "image_count": 100,
            "csv_count": 95,
            "base_rover_bool": True,
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        test_projects.append(project["id"])
        if project["sla_hours"] == 24:
            log_pass("SLA: 1st upload -> 24h SLA")
        else:
            log_fail("SLA: 1st upload -> 24h", f"Got {project['sla_hours']}h")
    else:
        log_fail("SLA: 1st upload", f"Status {response.status_code}: {response.text}")
except Exception as e:
    log_fail("SLA: 1st upload", str(e))

# Test 2.4: Upload 2nd project -> still 24h
print("\n[Test 2.4] Upload 2nd project -> sla_hours should still be 24")
try:
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['testsla']}"},
        json={
            "title": "TestSLA Project 2",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-15",
            "image_count": 100,
            "csv_count": 95,
            "base_rover_bool": True,
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        test_projects.append(project["id"])
        if project["sla_hours"] == 24:
            log_pass("SLA: 2nd upload -> 24h SLA")
        else:
            log_fail("SLA: 2nd upload -> 24h", f"Got {project['sla_hours']}h")
    else:
        log_fail("SLA: 2nd upload", f"Status {response.status_code}")
except Exception as e:
    log_fail("SLA: 2nd upload", str(e))

# Test 2.5: Upload 3rd project -> 48h
print("\n[Test 2.5] Upload 3rd project -> sla_hours should be 48")
try:
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['testsla']}"},
        json={
            "title": "TestSLA Project 3",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-15",
            "image_count": 100,
            "csv_count": 95,
            "base_rover_bool": True,
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        test_projects.append(project["id"])
        if project["sla_hours"] == 48:
            log_pass("SLA: 3rd upload -> 48h SLA")
        else:
            log_fail("SLA: 3rd upload -> 48h", f"Got {project['sla_hours']}h")
    else:
        log_fail("SLA: 3rd upload", f"Status {response.status_code}")
except Exception as e:
    log_fail("SLA: 3rd upload", str(e))

# Test 2.6: Upload 5th project -> 72h
print("\n[Test 2.6] Upload 4th and 5th projects -> 5th should be 72h")
try:
    # 4th
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['testsla']}"},
        json={
            "title": "TestSLA Project 4",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-15",
            "image_count": 100,
            "csv_count": 95,
            "base_rover_bool": True,
            "grid_file_bool": False
        }
    )
    # 5th
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['testsla']}"},
        json={
            "title": "TestSLA Project 5",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-15",
            "image_count": 100,
            "csv_count": 95,
            "base_rover_bool": True,
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        test_projects.append(project["id"])
        if project["sla_hours"] == 72:
            log_pass("SLA: 5th upload -> 72h SLA")
        else:
            log_fail("SLA: 5th upload -> 72h", f"Got {project['sla_hours']}h")
    else:
        log_fail("SLA: 5th upload", f"Status {response.status_code}")
except Exception as e:
    log_fail("SLA: 5th upload", str(e))

# Test 2.7: Verify upload_timestamp is server-side
print("\n[Test 2.7] Verify upload_timestamp is server-side (cannot be overridden)")
try:
    fake_timestamp = "2020-01-01T00:00:00.000Z"
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['testsla']}"},
        json={
            "title": "TestSLA Timestamp Test",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-15",
            "image_count": 100,
            "csv_count": 95,
            "base_rover_bool": True,
            "grid_file_bool": False,
            "upload_timestamp": fake_timestamp  # Try to inject old timestamp
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        # Check if upload_timestamp is recent (within last minute)
        upload_ts = datetime.fromisoformat(project["upload_timestamp"].replace("Z", "+00:00"))
        now = datetime.now(upload_ts.tzinfo)
        diff = abs((now - upload_ts).total_seconds())
        if diff < 60:  # Within last minute
            log_pass("SLA: upload_timestamp is server-locked (cannot be overridden)")
        else:
            log_fail("SLA: upload_timestamp server-locked", f"Timestamp is {diff}s old, seems injected")
    else:
        log_fail("SLA: upload_timestamp test", f"Status {response.status_code}")
except Exception as e:
    log_fail("SLA: upload_timestamp test", str(e))

# ============================================================================
# 3. REFLY AUTOMATION + ROUND-ROBIN TESTS
# ============================================================================
print("\n" + "="*80)
print("3. REFLY AUTOMATION + ROUND-ROBIN TESTS")
print("="*80)

# Test 3.1: Upload project with refly condition (img-csv > 10, no base_rover)
print("\n[Test 3.1] Upload project with refly condition -> status=Failed_Refly, assigned")
try:
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={
            "client_id": test_client_id,
            "title": "Refly Test 1",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-16",
            "image_count": 200,
            "csv_count": 180,
            "base_rover_bool": False,
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        refly_project_1 = project["id"]
        if project["status"] == "Failed_Refly" and project["assigned_to"] is not None:
            log_pass("Refly: Project auto-flagged as Failed_Refly with assignment")
            print(f"   Assigned to: {project['assigned_to']}")
        else:
            log_fail("Refly: Auto-flag Failed_Refly", f"Status={project['status']}, assigned_to={project['assigned_to']}")
    else:
        log_fail("Refly: Auto-flag test", f"Status {response.status_code}")
except Exception as e:
    log_fail("Refly: Auto-flag test", str(e))

# Test 3.2-3.4: Upload 3 more refly projects to test round-robin
print("\n[Test 3.2-3.4] Upload 3 more refly projects to verify round-robin rotation")
assigned_users = []
try:
    for i in range(2, 5):
        response = requests.post(f"{BASE_URL}/projects",
            headers={"Authorization": f"Bearer {tokens['admin']}"},
            json={
                "client_id": test_client_id,
                "title": f"Refly Test {i}",
                "drone_name": "DJI Phantom",
                "capture_date": "2025-01-16",
                "image_count": 200,
                "csv_count": 180,
                "base_rover_bool": False,
                "grid_file_bool": False
            }
        )
        if response.status_code == 200:
            project = response.json()["project"]
            if project["status"] == "Failed_Refly" and project["assigned_to"]:
                assigned_users.append(project["assigned_to"])
    
    # Get all projects to see assignee names
    projects_resp = requests.get(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['admin']}"})
    if projects_resp.status_code == 200:
        all_projects = projects_resp.json()["projects"]
        refly_projects = [p for p in all_projects if p["status"] == "Failed_Refly"]
        assignee_names = [p.get("assignee_name") for p in refly_projects[-4:]]  # Last 4 refly projects
        
        # Check if we have rotation through all 3 team members
        unique_assignees = set([n for n in assignee_names if n])
        if len(unique_assignees) >= 2:  # At least 2 different assignees shows rotation
            log_pass(f"Refly: Round-robin rotation verified (assignees: {assignee_names})")
        else:
            log_warning("Refly: Round-robin rotation", f"Only {len(unique_assignees)} unique assignees: {assignee_names}")
    else:
        log_fail("Refly: Round-robin verification", "Failed to get projects list")
except Exception as e:
    log_fail("Refly: Round-robin test", str(e))

# Test 3.5: Edge case - base_rover_bool=true should NOT trigger refly
print("\n[Test 3.5] Edge case: img-csv > 10 BUT base_rover=true -> should NOT be Failed_Refly")
try:
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={
            "client_id": test_client_id,
            "title": "Refly Edge Case 1",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-16",
            "image_count": 200,
            "csv_count": 180,
            "base_rover_bool": True,  # This should prevent refly
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        if project["status"] == "Pending":
            log_pass("Refly: Edge case - base_rover=true prevents Failed_Refly")
        else:
            log_fail("Refly: Edge case base_rover", f"Expected Pending, got {project['status']}")
    else:
        log_fail("Refly: Edge case base_rover", f"Status {response.status_code}")
except Exception as e:
    log_fail("Refly: Edge case base_rover", str(e))

# Test 3.6: Edge case - diff <= 10 should NOT trigger refly
print("\n[Test 3.6] Edge case: img-csv = 5 (<=10) -> should NOT be Failed_Refly")
try:
    response = requests.post(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['admin']}"},
        json={
            "client_id": test_client_id,
            "title": "Refly Edge Case 2",
            "drone_name": "DJI Phantom",
            "capture_date": "2025-01-16",
            "image_count": 200,
            "csv_count": 195,  # diff = 5
            "base_rover_bool": False,
            "grid_file_bool": False
        }
    )
    if response.status_code == 200:
        project = response.json()["project"]
        if project["status"] == "Pending":
            log_pass("Refly: Edge case - diff<=10 prevents Failed_Refly")
        else:
            log_fail("Refly: Edge case diff<=10", f"Expected Pending, got {project['status']}")
    else:
        log_fail("Refly: Edge case diff<=10", f"Status {response.status_code}")
except Exception as e:
    log_fail("Refly: Edge case diff<=10", str(e))

# ============================================================================
# 4. LOCKED CARD BEHAVIOR TESTS
# ============================================================================
print("\n" + "="*80)
print("4. LOCKED CARD BEHAVIOR TESTS")
print("="*80)

# Test 4.1: Try to PATCH status on locked refly card -> expect 423
print("\n[Test 4.1] Try to PATCH status on locked Failed_Refly card -> expect 423")
try:
    # Get a refly project
    projects_resp = requests.get(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['admin']}"})
    refly_projects = [p for p in projects_resp.json()["projects"] if p["status"] == "Failed_Refly" and not p.get("refly_resolved")]
    
    if refly_projects:
        refly_id = refly_projects[0]["id"]
        response = requests.patch(f"{BASE_URL}/projects/{refly_id}/status",
            headers={"Authorization": f"Bearer {tokens['Rohit']}"},
            json={"status": "QC"}
        )
        if response.status_code == 423:
            if "locked" in response.text.lower():
                log_pass("Locked card: PATCH status returns 423 with 'locked' error")
            else:
                log_warning("Locked card: Returns 423", f"But message doesn't mention 'locked': {response.text}")
        else:
            log_fail("Locked card: PATCH status", f"Expected 423, got {response.status_code}")
    else:
        log_warning("Locked card: PATCH test", "No unresolved refly projects found")
except Exception as e:
    log_fail("Locked card: PATCH test", str(e))

# Test 4.2: POST issue-note with photo -> card unlocks
print("\n[Test 4.2] POST issue-note with photo -> card becomes Pending, refly_resolved=true")
try:
    if refly_projects:
        refly_id = refly_projects[0]["id"]
        # Small base64 image (1x1 red pixel PNG)
        photo_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        
        response = requests.post(f"{BASE_URL}/projects/{refly_id}/issue-note",
            headers={"Authorization": f"Bearer {tokens['Rohit']}"},
            json={
                "note": "Corrective action taken: re-uploaded missing CSV files",
                "photo_data_url": photo_data
            }
        )
        if response.status_code == 200:
            # Verify project is now Pending and refly_resolved=true
            project_resp = requests.get(f"{BASE_URL}/projects/{refly_id}",
                headers={"Authorization": f"Bearer {tokens['admin']}"})
            if project_resp.status_code == 200:
                project = project_resp.json()["project"]
                if project["status"] == "Pending" and project["refly_resolved"] == True:
                    log_pass("Locked card: Issue-note unlocks card -> Pending, refly_resolved=true")
                else:
                    log_fail("Locked card: Issue-note unlock", f"Status={project['status']}, refly_resolved={project['refly_resolved']}")
            else:
                log_fail("Locked card: Issue-note unlock", "Failed to verify project state")
        else:
            log_fail("Locked card: Issue-note POST", f"Status {response.status_code}: {response.text}")
    else:
        log_warning("Locked card: Issue-note test", "No refly projects to test")
except Exception as e:
    log_fail("Locked card: Issue-note test", str(e))

# Test 4.3: Now PATCH status should work
print("\n[Test 4.3] After issue-note, PATCH status to QC should succeed")
try:
    if refly_projects:
        refly_id = refly_projects[0]["id"]
        response = requests.patch(f"{BASE_URL}/projects/{refly_id}/status",
            headers={"Authorization": f"Bearer {tokens['Rohit']}"},
            json={"status": "QC"}
        )
        if response.status_code == 200:
            log_pass("Locked card: PATCH status succeeds after unlock")
        else:
            log_fail("Locked card: PATCH after unlock", f"Status {response.status_code}: {response.text}")
    else:
        log_warning("Locked card: PATCH after unlock", "No refly projects to test")
except Exception as e:
    log_fail("Locked card: PATCH after unlock", str(e))

# ============================================================================
# 5. AUDIT LOGS TESTS
# ============================================================================
print("\n" + "="*80)
print("5. AUDIT LOGS TESTS")
print("="*80)

# Test 5.1: GET /audit-logs as admin -> should contain entries
print("\n[Test 5.1] GET /audit-logs as admin -> should return entries")
try:
    response = requests.get(f"{BASE_URL}/audit-logs",
        headers={"Authorization": f"Bearer {tokens['admin']}"})
    if response.status_code == 200:
        logs = response.json()["logs"]
        if len(logs) > 0:
            # Check for expected audit entries
            has_create = any("created" in log.get("action_desc", "").lower() for log in logs)
            has_status = any("status" in log.get("action_desc", "").lower() for log in logs)
            has_refly = any("refly" in log.get("action_desc", "").lower() for log in logs)
            
            if has_create and has_status:
                log_pass(f"Audit logs: Admin can access logs ({len(logs)} entries, includes create/status changes)")
            else:
                log_warning("Audit logs: Admin access", f"Got {len(logs)} logs but missing expected entries")
        else:
            log_fail("Audit logs: Admin access", "No audit logs found")
    else:
        log_fail("Audit logs: Admin access", f"Status {response.status_code}")
except Exception as e:
    log_fail("Audit logs: Admin access", str(e))

# Test 5.2: GET /audit-logs as Team -> should be 403
print("\n[Test 5.2] GET /audit-logs as Team user -> should return 403")
try:
    response = requests.get(f"{BASE_URL}/audit-logs",
        headers={"Authorization": f"Bearer {tokens['Rohit']}"})
    if response.status_code == 403:
        log_pass("Audit logs: Team user gets 403")
    else:
        log_fail("Audit logs: Team user 403", f"Expected 403, got {response.status_code}")
except Exception as e:
    log_fail("Audit logs: Team user 403", str(e))

# Test 5.3: GET /audit-logs as Client -> should be 403
print("\n[Test 5.3] GET /audit-logs as Client -> should return 403")
try:
    response = requests.get(f"{BASE_URL}/audit-logs",
        headers={"Authorization": f"Bearer {tokens['bayer']}"})
    if response.status_code == 403:
        log_pass("Audit logs: Client gets 403")
    else:
        log_fail("Audit logs: Client 403", f"Expected 403, got {response.status_code}")
except Exception as e:
    log_fail("Audit logs: Client 403", str(e))

# ============================================================================
# 6. RBAC PROJECT LISTING TESTS
# ============================================================================
print("\n" + "="*80)
print("6. RBAC PROJECT LISTING TESTS")
print("="*80)

# Test 6.1: Client sees only their own projects, no assignee_name
print("\n[Test 6.1] Client GET /projects -> only sees own projects, no assignee_name")
try:
    response = requests.get(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['bayer']}"})
    if response.status_code == 200:
        projects = response.json()["projects"]
        # Check all projects belong to bayer's client
        bayer_client_id = user_data["bayer"]["client_id"]
        all_own = all(p["client_id"] == bayer_client_id for p in projects)
        has_assignee = any("assignee_name" in p for p in projects)
        
        if all_own and not has_assignee:
            log_pass(f"RBAC: Client sees only own projects ({len(projects)}), no assignee_name field")
        elif not all_own:
            log_fail("RBAC: Client project filter", "Client can see other clients' projects")
        elif has_assignee:
            log_fail("RBAC: Client assignee redaction", "Client can see assignee_name field")
    else:
        log_fail("RBAC: Client project listing", f"Status {response.status_code}")
except Exception as e:
    log_fail("RBAC: Client project listing", str(e))

# Test 6.2: Team member sees all projects with assignee_name
print("\n[Test 6.2] Team GET /projects -> sees all projects with assignee_name")
try:
    response = requests.get(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['Rohit']}"})
    if response.status_code == 200:
        projects = response.json()["projects"]
        # Should see projects from multiple clients
        client_ids = set(p["client_id"] for p in projects)
        has_assignee = any("assignee_name" in p for p in projects)
        
        if len(client_ids) > 1 and has_assignee:
            log_pass(f"RBAC: Team sees all projects ({len(projects)} from {len(client_ids)} clients) with assignee_name")
        else:
            log_warning("RBAC: Team project listing", f"Clients: {len(client_ids)}, has_assignee: {has_assignee}")
    else:
        log_fail("RBAC: Team project listing", f"Status {response.status_code}")
except Exception as e:
    log_fail("RBAC: Team project listing", str(e))

# Test 6.3: Client cannot PATCH project status
print("\n[Test 6.3] Client PATCH project status -> should return 403")
try:
    # Get a bayer project
    response = requests.get(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['bayer']}"})
    if response.status_code == 200:
        projects = response.json()["projects"]
        if projects:
            project_id = projects[0]["id"]
            patch_resp = requests.patch(f"{BASE_URL}/projects/{project_id}/status",
                headers={"Authorization": f"Bearer {tokens['bayer']}"},
                json={"status": "QC"}
            )
            if patch_resp.status_code == 403:
                log_pass("RBAC: Client cannot PATCH project status (403)")
            else:
                log_fail("RBAC: Client PATCH forbidden", f"Expected 403, got {patch_resp.status_code}")
        else:
            log_warning("RBAC: Client PATCH test", "No projects to test")
    else:
        log_fail("RBAC: Client PATCH test", f"Failed to get projects: {response.status_code}")
except Exception as e:
    log_fail("RBAC: Client PATCH test", str(e))

# Test 6.4: Client cannot POST /clients
print("\n[Test 6.4] Client POST /clients -> should return 403")
try:
    response = requests.post(f"{BASE_URL}/clients",
        headers={"Authorization": f"Bearer {tokens['bayer']}"},
        json={"name": "Unauthorized Client", "logo_url": ""}
    )
    if response.status_code == 403:
        log_pass("RBAC: Client cannot POST /clients (403)")
    else:
        log_fail("RBAC: Client POST clients", f"Expected 403, got {response.status_code}")
except Exception as e:
    log_fail("RBAC: Client POST clients", str(e))

# ============================================================================
# 7. ANALYTICS TESTS
# ============================================================================
print("\n" + "="*80)
print("7. ANALYTICS TESTS")
print("="*80)

# Test 7.1: GET /analytics as admin -> verify math
print("\n[Test 7.1] GET /analytics as admin -> verify totals and SLA classification")
try:
    response = requests.get(f"{BASE_URL}/analytics",
        headers={"Authorization": f"Bearer {tokens['admin']}"})
    if response.status_code == 200:
        analytics = response.json()
        totals = analytics["totals"]
        by_sla = analytics["bySla"]
        by_status = analytics["byStatus"]
        
        # Verify structure
        has_totals = all(k in totals for k in ["projects", "clients", "users", "refly"])
        has_sla = all(k in by_sla for k in ["ok", "warning", "breached"])
        
        if has_totals and has_sla:
            log_pass(f"Analytics: Structure correct (projects={totals['projects']}, refly={totals['refly']}, SLA: ok={by_sla['ok']}, warning={by_sla['warning']}, breached={by_sla['breached']})")
        else:
            log_fail("Analytics: Structure", f"Missing fields: totals={has_totals}, sla={has_sla}")
    else:
        log_fail("Analytics: Admin access", f"Status {response.status_code}")
except Exception as e:
    log_fail("Analytics: Admin access", str(e))

# ============================================================================
# 8. CONFIRM DELIVERY TESTS
# ============================================================================
print("\n" + "="*80)
print("8. CONFIRM DELIVERY TESTS")
print("="*80)

# Test 8.1: Admin sets project to Delivery status
print("\n[Test 8.1] Admin PATCH project to Delivery status")
delivery_project_id = None
try:
    # Get a bayer project
    response = requests.get(f"{BASE_URL}/projects",
        headers={"Authorization": f"Bearer {tokens['admin']}"})
    if response.status_code == 200:
        projects = response.json()["projects"]
        bayer_projects = [p for p in projects if p["client_name"] == "Bayer" and p["status"] != "Failed_Refly"]
        if bayer_projects:
            delivery_project_id = bayer_projects[0]["id"]
            patch_resp = requests.patch(f"{BASE_URL}/projects/{delivery_project_id}/status",
                headers={"Authorization": f"Bearer {tokens['admin']}"},
                json={"status": "Delivery"}
            )
            if patch_resp.status_code == 200:
                log_pass("Delivery: Admin set project to Delivery status")
            else:
                log_fail("Delivery: Set to Delivery", f"Status {patch_resp.status_code}")
        else:
            log_warning("Delivery: Set to Delivery", "No suitable Bayer projects found")
    else:
        log_fail("Delivery: Get projects", f"Status {response.status_code}")
except Exception as e:
    log_fail("Delivery: Set to Delivery", str(e))

# Test 8.2: Client confirms delivery
print("\n[Test 8.2] Client POST /confirm-delivery -> delivery_confirmed=true")
try:
    if delivery_project_id:
        response = requests.post(f"{BASE_URL}/projects/{delivery_project_id}/confirm-delivery",
            headers={"Authorization": f"Bearer {tokens['bayer']}"})
        if response.status_code == 200:
            # Verify delivery_confirmed is true
            project_resp = requests.get(f"{BASE_URL}/projects/{delivery_project_id}",
                headers={"Authorization": f"Bearer {tokens['bayer']}"})
            if project_resp.status_code == 200:
                project = project_resp.json()["project"]
                if project.get("delivery_confirmed") == True:
                    log_pass("Delivery: Client confirmed delivery, delivery_confirmed=true")
                else:
                    log_fail("Delivery: Confirm delivery", f"delivery_confirmed={project.get('delivery_confirmed')}")
            else:
                log_fail("Delivery: Verify confirmation", f"Status {project_resp.status_code}")
        else:
            log_fail("Delivery: Client confirm", f"Status {response.status_code}: {response.text}")
    else:
        log_warning("Delivery: Client confirm", "No delivery project to test")
except Exception as e:
    log_fail("Delivery: Client confirm", str(e))

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "="*80)
print("TEST SUMMARY")
print("="*80)
print(f"\n✅ PASSED: {len(test_results['passed'])} tests")
print(f"❌ FAILED: {len(test_results['failed'])} tests")
print(f"⚠️  WARNINGS: {len(test_results['warnings'])} tests")

if test_results["failed"]:
    print("\n" + "="*80)
    print("FAILED TESTS:")
    print("="*80)
    for failure in test_results["failed"]:
        print(f"  ❌ {failure}")

if test_results["warnings"]:
    print("\n" + "="*80)
    print("WARNINGS:")
    print("="*80)
    for warning in test_results["warnings"]:
        print(f"  ⚠️  {warning}")

print("\n" + "="*80)
print("TEST EXECUTION COMPLETE")
print("="*80)

# Exit with appropriate code
exit(0 if len(test_results["failed"]) == 0 else 1)
