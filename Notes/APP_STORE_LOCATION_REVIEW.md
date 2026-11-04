# App Store review: background location (USA warehouse check-in)

What Apple looks at for an app that uses location in the background, and where this app stands. Keep in step with `src/app/privacy/page.tsx` and `ios/App/App/PrivacyInfo.xcprivacy`.

## What the app does with location
USA employees only. The phone's position is compared with the warehouses HR assigned to that person; arriving starts the shift, leaving ends it. The position is not saved or sent anywhere else. Pakistan employees never use location.

## Checklist (guidelines 2.5.4, 5.1.1, 5.1.2)

| Requirement | Where it is met |
|---|---|
| Background location only for a feature that needs it (2.5.4) | `UIBackgroundModes: location` in `Info.plist`. The shift must end when the employee leaves, even with the phone locked. |
| Specific purpose strings (5.1.1) | `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` in `Info.plist` name the warehouse check-in. |
| Explain before the system prompt (5.1.1) | `useGeofenceShift` shows "Turn on automatic check-in?" first. The system prompt only appears after Continue. |
| A "no" must be possible and respected (5.1.1(iv)) | "Not now" is remembered (not asked again on every launch). The shift card shows "Turn on" any time. |
| No nagging, easy way to fix it later | When the phone says no, the card shows an Open Settings button that opens this app's settings. |
| Privacy manifest (5.1.2) | `PrivacyInfo.xcprivacy` declares Precise Location, linked to the user, for App Functionality, not for tracking. It is in the Xcode project. |
| App Privacy answers in App Store Connect | Precise Location: collected, linked to the user, used for App Functionality, not used for tracking. Match the manifest. |
| Privacy policy says it plainly | `/privacy` explains "Always" location, why, and that history is not kept. |
| Reviewer can test the feature (2.1) | See "Review account" below. |

## Review account
A reviewer is not standing in one of our warehouses. Before submitting, create a review employee (region USA) whose assigned warehouse is Apple Park, so the feature can be seen working:

- Warehouse: latitude 37.3349, longitude -122.0090, radius 300 m.
- Put the sign-in details and this paragraph in the App Review Information notes:

> Delcargo Internal is a private employee app. USA employees clock in and out automatically when their phone enters or leaves an assigned warehouse. The sign-in below is assigned a warehouse at Apple Park (37.3349, -122.0090). Sign in, tap Continue on "Turn on automatic check-in?", allow location, and the shift starts when the device is at that location (Simulator: Features > Location > Custom Location). Background location is needed so the shift also ends when the employee leaves with the phone locked. Location is compared on the device and is not stored.

## Android (Google Play)
The same "Turn on automatic check-in?" dialog is the required in-app prominent disclosure. `ACCESS_BACKGROUND_LOCATION` also needs the Play Console background-location declaration (see `AndroidManifest.xml`).
