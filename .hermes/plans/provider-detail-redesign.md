# Provider Detail Page Redesign Plan

## Goal
Ubah provider detail dari slide panel jadi full-page route dengan file explorer

## Target Layout
```
← Back to Providers | Storage Providers > Google Drive

[Header]
  🔵 Google Drive
  Account: [Dropdown ▼] [+ Add]
  Storage: 5.2 GB / 15 GB (35%) ██████░░░░
  [Test] [Edit] [Delete]

[File Browser]
  / > Documents > Photos
  [Upload] [New Folder] [Refresh]
  
  📁 Folder A    1.2 GB    Jan 15
  📄 file.pdf    2.5 MB    Mar 10
```

## Implementation Sprints

### Sprint 1: Routing (1 day)
- Create `app/(dashboard)/providers/[providerType]/page.tsx`
- Fetch accounts by provider type
- Basic layout + breadcrumb

### Sprint 2: Account UI (1 day)
- Account selector dropdown
- Storage capacity card
- Test connection button
- Edit/delete actions

### Sprint 3: File Backend (2 days)
- `file_handler.go` + `file_service.go`
- GET `/storage-accounts/:id/files?path=/`
- POST `/storage-accounts/:id/files/upload`
- POST `/storage-accounts/:id/files/mkdir`
- DELETE `/storage-accounts/:id/files?path=/file`
- GET `/storage-accounts/:id/files/download?path=/file`
- rclone: `lsjson`, `copyto`, `deletefile`, `cat`

### Sprint 4: File Frontend (2 days)
- FileBrowser component
- Breadcrumb navigation
- File/folder table
- Upload + progress
- New folder dialog
- Delete confirmation

### Sprint 5: Polish (1 day)
- Mobile responsive
- Error handling
- Empty states
- Keyboard shortcuts

## API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /storage-accounts/:id/files | List files |
| POST | /storage-accounts/:id/files/upload | Upload |
| POST | /storage-accounts/:id/files/mkdir | Create folder |
| DELETE | /storage-accounts/:id/files | Delete |
| GET | /storage-accounts/:id/files/download | Download |
| POST | /storage-accounts/:id/test | Test (exists) |

## Success Criteria
✅ Klik provider → navigate to `/providers/google-drive`
✅ Account dropdown works
✅ Storage visualization
✅ Test connection shows result
✅ File browser lists files/folders
✅ Navigate into folders
✅ Upload file
✅ Create folder
✅ Delete file/folder
✅ Download file
✅ Add/edit/delete account
