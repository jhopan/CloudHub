# CloudHub — Complete Provider List (rclone v1.74)

> Total rclone backends: **72**
> Last updated: 2026-06-20

---

## 🟢 ONLINE — Cloud Storage dengan FREE Tier

Ini yang BISA langsung dipakai user tanpa bayar.

| # | Provider | Free Storage | rclone Backend | Website | Auth Method |
|---|----------|:---:|---|---|---|
| 1 | **MEGA** | 20 GB | `mega` | https://mega.io | email + password |
| 2 | **Google Drive** | 15 GB | `drive` | https://drive.google.com | OAuth |
| 3 | **pCloud** | 10 GB | `pcloud` | https://www.pcloud.com | OAuth |
| 4 | **Box** | 10 GB | `box` | https://www.box.com | OAuth |
| 5 | **Yandex Disk** | 10 GB | `yandex` | https://disk.yandex.com | OAuth |
| 6 | **Filen** | 10 GB | `filen` | https://filen.io | email + password |
| 7 | **Koofr** | 10 GB | `koofr` | https://koofr.eu | email + password |
| 8 | **Internxt** | 10 GB | `internxt` | https://internxt.com | email + password |
| 9 | **PikPak** | 10 GB | `pikpak` | https://mypikpak.com | email + password |
| 10 | **Cloudflare R2** | 10 GB | `s3` | https://www.cloudflare.com/r2 | access key + secret |
| 11 | **Backblaze B2** | 10 GB | `b2` | https://www.backblaze.com/b2 | account ID + key |
| 12 | **IDrive e2** | 10 GB | `s3` | https://www.idrive.com/e2 | access key + secret |
| 13 | **Oracle Cloud** | 10 GB | `s3` | https://www.oracle.com/cloud/free | access key + secret |
| 14 | **Mail.ru Cloud** | 8 GB | `mailru` | https://cloud.mail.ru | email + password |
| 15 | **OneDrive** | 5 GB | `onedrive` | https://onedrive.live.com | OAuth |
| 16 | **Jottacloud** | 5 GB | `jottacloud` | https://www.jottacloud.com | email + password |
| 17 | **HiDrive** | 5 GB | `hidrive` | https://www.strato.de/online-speicher | OAuth |
| 18 | **iCloud Drive** | 5 GB | `iclouddrive` | https://www.icloud.com | Apple ID |
| 19 | **OpenDrive** | 5 GB | `opendrive` | https://www.opendrive.com | email + password |
| 20 | **Proton Drive** | 1 GB | `protondrive` | https://drive.proton.me | email + password |
| 21 | **Dropbox** | 2 GB | `dropbox` | https://www.dropbox.com | OAuth |
| 22 | **Storj** | 25 GB | `storj` | https://www.storj.io | access grant |
| 23 | **Drime** | 20 GB | `drime` | https://drime.cloud | email + password |
| 24 | **Scaleway** | 75 GB* | `s3` | https://www.scaleway.com | access key + secret |
| 25 | **Google Photos** | 15 GB** | `gphotos` | https://photos.google.com | OAuth |
| 26 | **Zoho** | 5 GB | `zoho` | https://www.zoho.com/workdrive | OAuth |
| 27 | **ImageKit** | 20 GB | `imagekit` | https://imagekit.io | API key |
| 28 | **Cloudinary** | 25 GB*** | `cloudinary` | https://cloudinary.com | API key |
| 29 | **Gofile** | Unlimited† | `gofile` | https://gofile.io | API token |
| 30 | **Pixeldrain** | Unlimited† | `pixeldrain` | https://pixeldrain.com | API key |

> *Scaleway: 75 GB free for 90 days (trial), then paid
> **Google Photos: 15 GB shared with Google Drive
> ***Cloudinary: 25 GB credits/month (bandwidth + storage combined)
> †Gofile/Pixeldrain: Unlimited but temporary (files deleted if inactive)

---

## 🟡 ONLINE — S3-Compatible Providers (Free Tier)

Semua pakai rclone backend `s3`, tinggal beda endpoint + credentials.

| # | Provider | Free Storage | Website |
|---|----------|:---:|---|
| 31 | **Cloudflare R2** | 10 GB | https://developers.cloudflare.com/r2 |
| 32 | **Oracle Cloud** | 10 GB | https://www.oracle.com/cloud/free |
| 33 | **IDrive e2** | 10 GB | https://www.idrive.com/e2 |
| 34 | **Scaleway** | 75 GB* | https://www.scaleway.com/en/object-storage |
| 35 | **Cubbit** | 5 GB | https://www.cubbit.io |
| 36 | **Leviia** | 5 GB | https://www.leviia.com |
| 37 | **Tencent Cloud COS** | 50 GB* | https://cloud.tencent.com |
| 38 | **Alibaba Cloud OSS** | 20 GB* | https://www.alibabacloud.com/product/oss |
| 39 | **DigitalOcean Spaces** | $200 trial* | https://www.digitalocean.com/products/spaces |
| 40 | **Linode (Akamai)** | $100 trial* | https://www.linode.com/products/object-storage |
| 41 | **Hetzner** | 1 TB trial* | https://www.hetzner.com/storage/object-storage |
| 42 | **IONOS** | 2 TB trial* | https://cloud.ionos.com/storage/object-storage |

> *Trial-based: free for limited time, then paid

---

## 🔵 ONLINE — Self-Hosted (Unlimited, butuh server)

| # | Provider | Free | rclone Backend | Website |
|---|----------|:---:|---|---|
| 43 | **Nextcloud** | Unlimited | `webdav` | https://nextcloud.com |
| 44 | **Seafile** | Unlimited | `seafile` | https://www.seafile.com |
| 45 | **MinIO** | Unlimited | `s3` | https://min.io |
| 46 | **SeaweedFS** | Unlimited | `s3` | https://github.com/seaweedfs/seaweedfs |
| 47 | **Synology C2** | Unlimited | `s3` | https://c2.synology.com |
| 48 | **Ceph** | Unlimited | `s3` | https://ceph.io |

---

## 🔴 ONLINE — Paid Only (TIDAK ada free tier)

| # | Provider | rclone Backend | Website |
|---|----------|---|---|
| 49 | **1Fichier** | `fichier` | https://1fichier.com |
| 50 | **Files.com** | `filescom` | https://files.com |
| 51 | **FileFabric** | `filefabric` | https://storagemadeeasy.com |
| 52 | **FileLu** | `filelu` | https://filelu.com |
| 53 | **Shade FS** | `shade` | https://shade.cloud |
| 54 | **Sugarsync** | `sugarsync` | https://www.sugarsync.com |
| 55 | **Sharefile** | `sharefile` | https://www.sharefile.com |
| 56 | **Premiumize.me** | `premiumizeme` | https://www.premiumize.me |
| 57 | **Put.io** | `putio` | https://put.io |
| 58 | **Quatrix** | `quatrix` | https://www.maytech.net |
| 59 | **Uloz.to** | `ulozto` | https://uloz.to |
| 60 | **Linkbox** | `linkbox` | https://linkbox.to |
| 61 | **Wasabi** | `s3` | https://wasabi.com |
| 62 | **AWS S3** | `s3` | https://aws.amazon.com/s3 |
| 63 | **Azure Blob** | `azureblob` | https://azure.microsoft.com/products/storage/blobs |
| 64 | **Azure Files** | `azurefiles` | https://azure.microsoft.com/products/storage/files |
| 65 | **Google Cloud Storage** | `gcs` | https://cloud.google.com/storage |
| 66 | **QingCloud** | `qingstor` | https://www.qingcloud.com |
| 67 | **Oracle OOS** | `oos` | https://www.oracle.com/cloud/storage |
| 68 | **NetStorage** | `netstorage` | https://www.akamai.com |
| 69 | **Swift (OpenStack)** | `swift` | https://www.openstack.org |
| 70 | **Internet Archive** | `internetarchive` | https://archive.org |
| 71 | **Sia** | `sia` | https://sia.tech |

---

## ⚫ OFFLINE — Protocols (BUKAN cloud storage)

Ini bukan penyedia storage, cuma jalur koneksi.

| # | Type | rclone Backend | Description |
|---|------|---|---|
| 72 | **FTP** | `ftp` | File Transfer Protocol |
| 73 | **SFTP** | `sftp` | SSH File Transfer |
| 74 | **HTTP** | `http` | Read-only HTTP directory |
| 75 | **WebDAV** | `webdav` | Web Distributed Authoring |
| 76 | **SMB/CIFS** | `smb` | Windows network share |
| 77 | **HDFS** | `hdfs` | Hadoop Distributed FS |
| 78 | **Local Disk** | `local` | Local filesystem |

---

## ⚪ UTILITY — Helpers (BUKAN storage)

Backend ini memodifikasi backend lain, bukan storage sendiri.

| # | Type | rclone Backend | Description |
|---|------|---|---|
| 79 | **Alias** | `alias` | Rename existing remote |
| 80 | **Crypt** | `crypt` | Encrypt any remote |
| 81 | **Cache** | `cache` | Cache any remote |
| 82 | **Chunker** | `chunker` | Split large files |
| 83 | **Combine** | `combine` | Merge remotes |
| 84 | **Compress** | `compress` | Compress any remote |
| 85 | **Hasher** | `hasher` | Add checksums |
| 86 | **Union** | `union` | Merge multiple remotes |
| 87 | **Memory** | `memory` | In-memory only |
| 88 | **DOI** | `doi` | Read-only datasets |
| 89 | **Archive** | `archive` | Read archive files |

---

## 📊 Summary

```
Category                     Count    Free Storage
──────────────────────────────────────────────────
Online + FREE tier           30       ~350+ GB total
  └─ Native providers        22       ~195 GB
  └─ S3-compatible (free)    8        ~155 GB
Online + Self-hosted         6        Unlimited
Online + Paid only           23       0
Offline (Protocols)          7        N/A
Utility (Helpers)            11       N/A
──────────────────────────────────────────────────
TOTAL rclone backends        77       
```

## ✅ Rekomendasi untuk CloudHub

**Priority 1 — Implementasi DULU (free tier besar, populer):**
1. MEGA (20 GB) — email + password
2. Google Drive (15 GB) — OAuth
3. Filen (10 GB) — email + password
4. Koofr (10 GB) — email + password
5. Cloudflare R2 (10 GB) — access key + secret
6. Box (10 GB) — OAuth
7. pCloud (10 GB) — OAuth
8. Yandex Disk (10 GB) — OAuth
9. Proton Drive (1 GB) — email + password

**Priority 2 — Implementasi KEDUA:**
10. Backblaze B2 (10 GB)
11. IDrive e2 (10 GB)
12. Internxt (10 GB)
13. PikPak (10 GB)
14. Storj (25 GB)
15. Drime (20 GB)
16. Jottacloud (5 GB)
17. Mail.ru (8 GB)
18. OneDrive (5 GB)
19. Dropbox (2 GB)

**Priority 3 — Self-hosted & niche:**
20. Nextcloud (via WebDAV)
21. Seafile
22. MinIO (S3-compatible)
