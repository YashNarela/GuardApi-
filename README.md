# Guard Patrol - Final (Frontend-verifies QR using public key)

Summary:
- Roles: admin, employee, guard.
- Admin can create employees and QR checkpoints.
- Employee can create/update/delete guards.
- QR payloads are signed using RSA private key on server; frontend verifies using public key (safe).
- Frontend does basic verification (Option 1) before calling backend. Backend **also** re-verifies signature.
- Patrol logs stored in MongoDB.

Quick start:
1. npm install
2. node seedAdmin.js   (creates admin@company.com / admin123)
3. npm start

Auth Routes
1. Register User

POST /api/auth/register

{
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "123456",
  "role": "admin"   // "admin" | "employee" | "guard"
}



{ "msg": "User registered successfully" }


2. Login

POST /api/auth/login

{
  "email": "admin@example.com",
  "password": "123456"
}

{
  "token": "JWT_TOKEN",
  "user": {
    "_id": "68c857eb49131f6c5f84edbe",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "admin"
  }
}


Employee Routes (Admin Only)
3. Create Employee

POST /api/employees

{
  "name": "Employee One",
  "email": "emp1@example.com",
  "password": "123456"
}

{
  "msg": "Employee created successfully",
  "employee": {
    "_id": "68c8a1f8270891834e817a22",
    "name": "Employee One",
    "email": "emp1@example.com",
    "role": "employee"
  }
}


4. Get All Employees

GET /api/employees

Response

[
  {
    "_id": "68c8a1f8270891834e817a22",
    "name": "Employee One",
    "email": "emp1@example.com",
    "role": "employee",
    "createdBy": {
      "_id": "68c857eb49131f6c5f84edbe",
      "name": "Admin User",
      "email": "admin@example.com"
    }
  }
]

Guard Routes (Employee Only)
5. Create Guard

POST /api/guards

{
  "name": "Guard One",
  "email": "guard1@example.com",
  "password": "123456"
}

{
  "msg": "Guard created successfully",
  "guard": {
    "_id": "68c8a345270891834e817a28",
    "name": "Guard One",
    "email": "guard1@example.com",
    "role": "guard"
  }
}

6. Get All Guards

GET /api/guards

Response

[
  {
    "_id": "68c8a345270891834e817a28",
    "name": "Guard One",
    "email": "guard1@example.com",
    "role": "guard",
    "createdBy": {
      "_id": "68c8a1f8270891834e817a22",
      "name": "Employee One",
      "email": "emp1@example.com"
    }
  }
]

 QR Routes (Employee Only)
7. Generate QR

POST /api/qr

{
  "siteId": "gate-1",
  "lat": 22.7196,
  "lng": 75.8577,
  "radius": 50
}

{
  "qr": {
    "_id": "68c8b2fa270891834e817a34",
    "siteId": "gate-1",
    "lat": 22.7196,
    "lng": 75.8577,
    "radius": 50,
    "sig": "RSA_SIGNATURE",
    "createdBy": "68c857eb49131f6c5f84edbe",
    "createdAt": "2025-09-16T00:44:42.338Z"
  },
  "payload": {
    "siteId": "gate-1",
    "lat": 22.7196,
    "lng": 75.8577,
    "radius": 50,
    "sig": "RSA_SIGNATURE"
  }
}
8. Scan QR & Mark Patrol

POST /api/patrol/scan

{
  "qrId": "68c8b2fa270891834e817a34",
  "lat": 22.71962,
  "lng": 75.85775
}

{
  "msg": "Patrol logged",
  "patrol": {
    "_id": "68c8b9f8270891834e817a55",
    "guard": "68c8a345270891834e817a28",
    "qr": "68c8b2fa270891834e817a34",
    "location": { "lat": 22.71962, "lng": 75.85775 },
    "scannedAt": "2025-09-16T01:10:22.123Z"
  }
}
