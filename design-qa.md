# Work order timeline design QA

- Source: `/Users/hakimo/.codex/generated_images/01a07a5e-0984-7bf1-8682-c56ec787f1a9/exec-018d1d24-8e2a-497c-afb8-08279bd4e53b.png` (1488 × 1058)
- Implementation: `/Users/hakimo/Developer/production-line/modules/production/pages/WorkOrderDetailsPage.tsx`
- Local route: `http://localhost:3010/t/lab/work-orders/lab-hourly-order`
- Captured implementation: `/Users/hakimo/Developer/production-line/.tmp-ui-audit/02-work-order-timeline-browser.png`
- Verified viewports: 1440 × 1024 desktop and 390 × 844 mobile

## Comparison

The implementation preserves the selected concept's operational hierarchy: work-order context and progress first, a compact hourly timeline on the left, and a larger selected-hour workspace on the right with production, quality, packaging, and completion stages. It uses the existing ForgeOps shell, typography, spacing tokens, permission model, and RTL patterns rather than reproducing the concept's illustrative navigation rail.

The source and implementation were reviewed together at the desktop viewport. The first pass exposed reversed effective column widths under RTL. The grid was corrected so the hour list remains the narrow column on the physical left and the selected-hour workspace is the wide column on the physical right. The summary was also changed to responsive two-column grouping before expanding to four columns.

## Functional and state coverage

- Loading, missing-order, empty hourly-plan, permission-hidden, disabled submission, validation error, and successful completion states are represented.
- The full local flow was exercised: open hour → record production → approve quality → start packaging → close packaging.
- The stop path was exercised separately: open hour → record a stop reason → verify paused state → resume the same hour. A paused hour cannot submit production or allow a later hour to open.
- Completed hours now receive the completion check only after packaging is closed; quality approval alone does not present a false completed state.
- Packaging rejects contribute to the total rejected count.
- Mobile places the selected-hour workspace before the hour list, keeps RTL reading order, and avoids horizontal overflow at 390 px.
- Desktop preserves the global application navigation while matching the concept's content layout at 1440 px.

## Verification history

1. Desktop visual comparison found and fixed the RTL column-width inversion.
2. Mobile visual comparison found and fixed an overly tall four-cell summary by using a two-column intermediate layout.
3. Firestore transition verification found the rules expression ceiling during packaging completion; status guards were reordered ahead of permission resolution.
4. Type checks, manufacturing tests, Firestore rules assertions, and the production build completed successfully. The Firebase test wrapper printed an upstream CLI shutdown error after its test script had already exited successfully with code 0.
5. Browser verification confirmed the stop reason, paused status, and resume action against the local Firestore emulator. The only captured console errors came from pre-existing admin-dashboard aggregate permissions and were unrelated to this page or lifecycle.

final result: passed
