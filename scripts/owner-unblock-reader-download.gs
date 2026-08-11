/**
 * Owner-only one-off: clear copyRequiresWriterPermission on the 5 product
 * files that block reader download/print/copy.
 *
 * Why this is needed: the service account cannot do this. Google only lets the
 * file owner modify the "viewers can download/print/copy" restriction, and the
 * audit's PATCH fails with 403 "Only the owner or an organizer can modify the
 * viewersCanCopyContent restriction." (see _da2). This script runs AS the
 * owner (amitjha20250305@gmail.com), so it is allowed.
 *
 * REQUIRED ONE-TIME SETUP (this is what the "Drive is not defined" error means):
 *   1. Sign in to https://script.google.com as amitjha20250305@gmail.com.
 *   2. New project -> paste this file into Code.gs and save (Ctrl/Cmd+S).
 *   3. In the left sidebar, under SERVICES, click the "+" (or the gear
 *      icon). Search for "Drive API" -- NOT the plain "Drive" service, and
 *      NOT "Drive Picker" -- select it and click "Add".
 *      (Legacy editor: Resources -> Advanced Google services -> Drive API -> On.)
 *   4. Run unblockAll() and approve the authorization prompt when it appears.
 *
 * After it finishes, verify via the normal audit endpoint:
 *   GET /api/reminders.js?action=drive-audit&apply=true  (with CRON_SECRET)
 * and check that filesBlockingReaderDownload is 0.
 *
 * The equivalent manual UI step per file: Drive -> open file -> Share ->
 * gear icon (Settings) -> tick "Viewers and commenters can see the option to
 * download, print, and copy". (Ticking it enables download; today it is
 * unticked, which is why buyers can only view.)
 */

var FILE_IDS = [
  '13JzCKxxRXKSp7rC00gxdmkrr_ZiuOk_F', // Exotic Options Pricing Guide
  '1Rz_8G6TsV-6wzf58_JHThgM2Ataf37jK', // Trade Lifecycle for Quants
  '1QNoTQNauNT7a-uXfzmC2f6q4Kv2JWbES', // Quant Interview Problem Book (1000+)
  '1O9-GnC6GhKKkxu9J3VaDJ3quYy-UJ6Yq', // Model Validation Quant Case Study Pack
  '1I-ALHHi7k8VuYVrspEn-SSuuCmGfVYMY'  // Numerical Methods for Quants
];

function unblockAll() {
  // typeof is safe even when the advanced service is missing; gives a useful
  // message instead of "ReferenceError: Drive is not defined".
  if (typeof Drive === 'undefined') {
    Logger.log('Drive API advanced service is NOT enabled. In the script editor, left sidebar -> Services -> "+" -> add "Drive API" (not plain "Drive"), save, then re-run unblockAll().');
    return;
  }
  var results = [];
  for (var i = 0; i < FILE_IDS.length; i++) {
    var id = FILE_IDS[i];
    var row = { fileId: id };
    try {
      var meta = Drive.Files.get(id, { supportsAllDrives: true });
      row.name = meta.name;
      row.wasBlocked = !!meta.copyRequiresWriterPermission;
      Drive.Files.update(
        { copyRequiresWriterPermission: false },
        id,
        null,
        { supportsAllDrives: true }
      );
      row.ok = true;
      Logger.log('CLEARED ' + id + ' (' + meta.name + ')');
    } catch (e) {
      row.ok = false;
      row.error = String(e);
      Logger.log('FAILED ' + id + ': ' + e);
    }
    results.push(row);
  }
  Logger.log(JSON.stringify(results, null, 2));
}
