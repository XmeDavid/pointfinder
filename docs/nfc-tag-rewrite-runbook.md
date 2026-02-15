# NFC Tag Rewrite Runbook

Use this runbook when migrating physical tags from legacy URLs to PointFinder domains.

## Goal

Rewrite all active NFC base tags so they encode:

- `https://pointfinder.pt/tag/{baseId}` (primary write target)

The mobile readers accept both `pointfinder.pt` and `pointfinder.ch` tag URLs.

## Preconditions

- Production API is reachable on `pointfinder.pt` and `pointfinder.ch`.
- Operator app build includes the new domain migration.
- Each base has the correct `baseId` in PointFinder admin.
- A tested NFC-capable device is available for each operator writing tags.

## Rewrite Procedure

1. Open operator mode and select the target game/base.
2. Trigger **Write NFC** for the base.
3. Hold the device to the physical tag and wait for success confirmation.
4. Immediately read the same tag in player check-in flow.
5. Confirm the app resolves the expected base and check-in works.
6. Mark the base as migrated in your field checklist.

## Validation Checklist

- [ ] All bases in the live game were rewritten.
- [ ] Spot-check at least 10% of tags with a second device.
- [ ] Spot-check one rewritten tag through the public `/tag/` fallback page.
- [ ] No remaining tags resolve to `pointfinder.pt`.

## Rollback / Recovery

If a tag write fails:

1. Retry write once on the same device.
2. Retry on a second NFC-capable device.
3. Replace the physical tag if repeated writes fail.
4. Keep a spare printed base map so play can continue while replacing tags.
