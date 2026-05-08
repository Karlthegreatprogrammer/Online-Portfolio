# Changelog

## v2.0.9 - 2026-04-20

- CEU and Lingkod Bayan database openings now use clearer stage-based loading messages before the tables appear.
- Full-screen loading now appears only for first-time major page/database loads instead of every Add Record or Report navigation.
- Import Tools now includes a downloadable Lingkod Bayan Excel template and warns before saving workbooks with missing template columns.

## v2.0.8 - 2026-04-15

- Lingkod Bayan history-entry attachments now upload into a private Supabase Storage bucket and open through signed preview/download links.
- Client Records now include richer search and filter controls for `barangay`, `program`, `status`, `office`, and requested date range.
- Duplicate request detection now warns before saving the same client with the same request date and program combination.
- Client detail pages now show recent Supabase audit activity so admins can review who changed a record and when.

## v2.0.7 - 2026-04-15

- The `System Updates` card in the main menu now sits at the bottom of the drawer for a cleaner menu flow.
- The menu update card now presents the current version in a more polished layout with a clearer badge and changelog call-to-action.
- In Lingkod Bayan's `New History Entry` form, the section titles were removed while keeping all field contents and helper text in place.

## v2.0.6 - 2026-04-09

- CEU category switching now keeps the current records visible until the next category is fully ready, instead of briefly showing an empty panel first.
- Added a softer handoff effect for the outgoing CEU panel so first-load category clicks feel smoother and less abrupt.
- CEU category switching now safely honors the latest click during rapid category changes, preventing stale category flashes.

## v2.0.5 - 2026-04-09

- Added an in-app changelog viewer so the version card in the menu now opens the latest updates directly inside the system.
- Version cards across the CEU Database, Client Records, and Import Tools pages now sync their visible version and patch date from one shared changelog viewer script.
- The menu changelog card now clearly invites admins to view updates instead of acting like a static info block.

## v2.0.4 - 2026-04-09

- CEU Database category switching now uses a subtle fade-and-rise panel transition so menu changes feel smoother without making the page feel slower.
- CEU Database and Import Tools now use the same header menu button placement and drawer styling as [`client-records.html`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/client-records.html) for a more consistent admin navigation experience.
- Added a shared version/patch card to the main menu of the CEU Database, Client Records, and Import Tools pages so recent updates have a visible home inside the UI.

## v2.0.3 - 2026-04-09

- CEU Database no longer shows the temporary loading spinner, skeleton cards, or loading summary text while category data initializes.
- CEU Database now keeps the load/error handler only for real category load failures, so successful category switches feel immediate.

## v2.0.2 - 2026-04-09

- CEU Database now lazy-renders barangay accordion tables only when a panel is opened, which cuts down initial DOM work for each category.
- CEU Database search inputs now debounce typing before filtering, so large categories no longer rerender on every single keystroke.
- CEU Database records now use compact `searchIndex` values instead of keeping the older verbose `searchText` payloads in memory.
- Added [`scripts/optimize-ceu-search-index.ps1`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/scripts/optimize-ceu-search-index.ps1) to regenerate compact CEU search indexes for the split dataset files.

## v2.0.1 - 2026-04-09

- CEU Database now lazy-loads category datasets instead of loading every CEU data file on first page open.
- CEU Database now initializes and renders only the active category when it is opened, which reduces initial startup work and improves first-load responsiveness.
- CEU Database now shows a lightweight loading/error state in the result bar while a category dataset is loading.
- Client records import and migration tools were moved out of the main records page into a dedicated [`import-tools.html`](C:/Users/roiro/OneDrive/Desktop/LBU%20-%200323/LBU/LBU.V2/import-tools.html) admin page.
- Client Assistance history was aligned around request-specific fields such as GL Code, requested/completed/released dates, type, status, and leader/barangay official.
- The Client Assistance menu button was redesigned into a cleaner government-style header utility control.
