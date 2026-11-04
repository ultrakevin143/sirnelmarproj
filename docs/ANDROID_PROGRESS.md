# LiftUp Android progress

Updated November 4, 2026.

## Implemented and checked

- Quasar Capacitor mode and the Android project are initialized with pinned dependencies.
- Application ID: com.liftup.gymtracker. Name: LiftUp.
- Verified portable JDK 21, SDK platform 36 and build tools are installed under the ignored .tools directory. Gradle uses a checksum-pinned distribution.
- The first native build succeeded and its 56 MB debug APK was installed through authorized USB debugging on Samsung SM-A736B, Android 16 / API 36.
- The app runs from bundled assets and calls the hosted HTTPS API through native networking.
- Device sign-in with the reserved test identity succeeded. Weekly plans, the exercise catalogue, existing private history, account settings and the camera page loaded on the phone.
- No existing workout was started or edited during the layout inspection. Samsung Pass setup was dismissed; the test did not complete password-manager setup.
- Frontend verification after the mobile changes: 126 tests passed across 17 files, including Android camera-permission recovery, persisted weight-unit choices, failed-save recovery and kg/lb plate calculations. SPA and Capacitor production compilation passed before the pounds extension; final extension builds are recorded below. The initial layout detector reported no findings; device inspection still found issues, which were fixed and checked on the phone.

## Phone layout inspection

The user asked to prioritize layout before further feature testing. Inspected the actual installed app's landing, login, tracker, plan, exercise library, history, settings, menus, keyboard and camera-off screen.

Observed issues and implemented corrections:

- Landing navigation overlapped the Android status bar: navigation and initial content now account for native safe-area insets.
- Scrolling content showed through the fixed app header and bottom dock: native surfaces are opaque in both themes.
- The bottom dock covered the form's save area when the keyboard opened: native keyboard events hide the dock during text entry.
- Feedback notices could sit over navigation: mobile notices reserve space above the dock and system bar.
- The mobile rest timer's fixed sticky offset could collide with the native header: the timer stays in normal flow on phones.
- The quick-start guide header was crowded: its title and badge stack with a separate touch-sized close control.
- Android's default video poster appeared behind camera-off instructions: the idle video is hidden and the instructional placeholder has an opaque background.

The corrected APK has been installed repeatedly with session and server data preserved. Keyboard show/hide, status-bar spacing, opaque navigation, camera-off preview and the guide were confirmed on the phone. Screenshots with names ending in -before are diagnostic evidence and must not be submitted as final screenshots.

Further functional inspection found and corrected:

- Android file export selected the browser download path because an unavailable build variable was used. Runtime Capacitor detection now selects native cache files and Android sharing. Both JSON and CSV opened the real share sheet, without sending either file to a recipient.
- Templates emitted an event that the page did not handle. The existing saved-program dialog is now connected to loading, saving, preview, confirmed application and deletion. Loading failures show a recoverable error. Saving, previewing and applying were verified on the phone.
- Create Custom prepared hidden form state. It now opens the editor, with one column on phones and native safe-area spacing. A test image was selected from Downloads, uploaded and displayed through authenticated native networking.
- Experience and other settings selectors had a dim, crowded duplicated input header. Settings now use readable menu choices, with title-cased experience labels. The Experience selector was checked in both themes.
- Import preview used light rows with inherited light text in dark mode. Preview rows now use the active theme's surface and text colors.
- The library had 24 large cards before its only pager. Phones now use six cards per page with range/page information and controls above and below the results. Desktop retains 24. Filtering and resizing reset pagination; page changes return to the result heading.
- The phone library now uses two columns: six exercises form three rows. Names and badges can wrap, and each favorite button has its own space below the card content. Desktop keeps its existing grid.

The two-column update was built and installed on the Samsung test phone. Both light and dark themes were inspected with real exercise names, badges, favorite controls and pagination visible. Evidence: artifacts/android/two-column-grid-dark.png, two-column-grid-light.png and two-column-final-layout.png.

## Verified phone workflows

Writes used a newly registered, isolated phone-test account. Existing users' workouts and plans were not edited.

- Registration, login, logout, and session persistence across APK updates/reopening.
- Training preferences saved, starter plan previewed and applied; profile experience updated and a plan day title edited.
- A planned bench set logged at 20 kg × 8, workout finished and retrieved in history. History edit to 22.5 kg × 8 persisted. A separate HTTPS session verified the exact saved record and the two remaining planned bench sets.
- History search returned the saved workout for Bench and showed the empty state for an unmatched query.
- Exercise guides and frame selection, favorites, custom movement creation and authenticated custom image display.
- Plan JSON export parsed as a valid seven-day document. The same file was selected from the Android file picker, previewed and imported. CSV export opened Android sharing.
- Plate calculator showed two 20 kg plates per side for a 100 kg total with a 20 kg bar. Its numeric keyboard and dialog remained usable.
- Tracking model loaded and inference check passed without camera access. Camera startup, pause, resume and stop worked. Actual backgrounding released the camera; returning left it off in review. A stationary scene without a visible full body remained at zero.
- A manually entered two-rep fixture was reviewed, saved once to a camera workout, and finished through the installed app. This verifies correction/save integration only and is not evidence of physical rep accuracy.
- A 10-second rest timer was started, the app was backgrounded, and returning showed 00:00 and Rest complete. Test chime reported ready; physical speaker volume/audibility was not measured.
- Wi-Fi was deliberately disconnected with mobile data already off. A failed 25 kg × 6 bench-set save kept both inputs and left all three planned sets incomplete. Wi-Fi was restored to its original state; an explicit retry completed one set. The test workout was finished normally.
- Camera permission denial and repeated denial (Android USER_FIXED) both left the preview off with a recoverable error. Native-specific Android Settings instructions replace the incorrect browser-only copy.
- Rotating the saved-workout dialog into landscape kept its text and actions visible. Original portrait rotation settings were restored.
- The first signed release (1.0.1/code 2) was installed after a private local backup of the debug app. The isolated account signed in successfully and retrieved its existing plan. Native settings dialogs were readable, and Android Back closed the choice list while remaining on Settings.

## Kilograms and pounds

The account already supported a saved massUnit setting. A visible KG/LB choice now appears in workout setup, set logging, weekly plans, history and the plate calculator. It saves only after the server succeeds and retains the selected unit with a retryable error on failure. The shortcut reads the latest account settings before changing massUnit, preserving training preferences.

Workout loads remain canonical kilograms in the API/database; the interface converts input and display without changing existing records. Converted decimal values use unrestricted decimal input steps so a unit change cannot make an otherwise valid form fail validation. Progression increments and starter-plan copy also follow the chosen unit. The plate tool supports a 20 kg bar with kg plates or a 45 lb bar with 45/25/10/5/2.5 lb plates; it rejects unattainable totals.

Release 1.0.2/code 3 includes this extension and reuses the same private release key, allowing an in-place update from 1.0.1.

Evidence is stored locally under artifacts/android. Camera frames, file-picker screenshots, credentials and test-account data are excluded from source control and submission screenshots.

## Remaining checks

- Compare counted reps with observed physical push-ups. The user explicitly deferred this test in favor of other checks.
- Complete enlarged-text and final camera landscape checks in the signed release.
- Test the free backend's natural idle wake-up. Automated safe health-retry and failed-save/draft tests pass, but they do not replace this real-network check.
- Password change/account deletion were not exercised through the phone UI during this run. Do not present them as device-tested.
- Build/sign a release APK and collect final submission evidence. The current APK is a development build.

See [Android setup](ANDROID_SETUP.md) for reproducible build instructions.
