# Delcargo HR Tracker — Chrome Extension (Manifest V3)

Official activity tracker, screen logger, and attendance manager extension for Chromebooks (ChromeOS) and Google Chrome browsers.

---

## 🌟 Key Features

1. **Native ChromeOS Idle Detection (`chrome.idle`)**:
   - Detects active work vs idle time.
   - Logs idle intervals ($\ge 3$ minutes) directly to PocketBase (`hr_inactivity_logs`).
   - Automatically clocks out and marks absent if continuous idle reaches **37+ minutes** (`inactivity_absence`).

2. **PocketBase Live Integration**:
   - Sends heartbeats every 15 seconds to keep employee presence active (`hr_tracker_heartbeats_prod_v1`).
   - Syncs shift stop signals (`shift_stop_signal_<email>`) in real-time with the Delcargo Web Portal.

3. **Screen Capture**:
   - Periodically logs tab screenshots to PocketBase (`hr_screenshots`).

4. **Sleek Brand UI**:
   - Navy & Brand Orange interface with live digital shift timer (`00:00:00`).

---

## 🚀 How to Install & Test Manually (Developer Mode)

1. Open **Google Chrome** or **Chromebook Browser**.
2. Navigate to:
   ```
   chrome://extensions
   ```
3. Enable **Developer mode** (toggle switch at the top-right).
4. Click **Load unpacked**.
5. Select the `chrome-extension` directory inside this project repository.
6. The **Delcargo HR Tracker** icon (DC logo) will appear in your Chrome extensions toolbar!

---

## 🏢 Enterprise Deployment (Google Admin Console for Chromebooks)

To deploy the extension to all employee Chromebooks so that **employees cannot uninstall or disable it**:

1. Log in to the **Google Workspace Admin Console** (`admin.google.com`).
2. Go to **Devices** $\rightarrow$ **Chrome** $\rightarrow$ **Apps & extensions** $\rightarrow$ **Users & browsers**.
3. Select your target **Organizational Unit (OU)** (e.g., `Employees` / `Pakistan Staff`).
4. Click the **+** button and select **Add Chrome app or extension by ID** (or upload the packed ZIP).
5. Set the Installation Policy to **Force install + pin to Chrome OS taskbar**.
6. Save policy.

> **Result**: The Delcargo Tracker will automatically install on all managed employee Chromebooks. Employees cannot remove, disable, or turn off the extension.
