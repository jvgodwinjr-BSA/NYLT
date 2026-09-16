<?php
// Shared schedule storage for the Program Scheduler.
//
//   GET  /api/placements.php?pack=nylt-27-1   -> the current schedule
//   PUT  /api/placements.php?pack=nylt-27-1   -> replace it
//
// Both require the shared password — the same one that unlocks the roster — sent as the
// X-Schedule-Password header. The password itself is never stored; api/config.php holds a
// PBKDF2-SHA256 hash, and is a .php file so the server executes it rather than serving it.
//
// Optimistic locking: every write bumps `version`, and a PUT carrying a stale version is
// rejected with 409 and the current document, so two people editing at once cannot silently
// clobber each other. flock() serialises concurrent writes.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

function out(int $code, array $body) {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') out(204, []);

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    out(503, ['error' => 'not_configured', 'message' => 'api/config.php is missing. Run: npm run api-password']);
}
$cfg = require $configPath;

// --- auth ---------------------------------------------------------------
$given = (string)($_SERVER['HTTP_X_SCHEDULE_PASSWORD'] ?? '');
$ok = false;
if ($given !== '' && isset($cfg['salt'], $cfg['hash'], $cfg['iterations'])) {
    $calc = hash_pbkdf2('sha256', $given, (string)base64_decode((string)$cfg['salt']), (int)$cfg['iterations'], 32, true);
    $ok = hash_equals((string)base64_decode((string)$cfg['hash']), $calc);
}
if (!$ok) {
    usleep(250000); // blunt the rate of online guessing
    out(401, ['error' => 'unauthorized']);
}

// --- storage ------------------------------------------------------------
$pack = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($_GET['pack'] ?? ''));
if ($pack === '' || strpos($pack, '..') !== false) out(400, ['error' => 'bad_pack']);

$dir = __DIR__ . '/data';
if (!is_dir($dir) && !@mkdir($dir, 0775, true)) out(500, ['error' => 'no_data_dir', 'message' => 'api/data is missing and could not be created']);
$file = $dir . '/' . $pack . '.json';

$empty = [
    'format' => 'program-scheduler/schedule', 'version' => 0, 'pack' => $pack,
    'placements' => [], 'customActivities' => [], 'savedAt' => null, 'savedBy' => null,
];

if ($method === 'GET') {
    if (!is_file($file)) out(200, $empty);
    $data = json_decode((string)file_get_contents($file), true);
    out(200, is_array($data) ? $data : $empty);
}

if ($method !== 'PUT' && $method !== 'POST') out(405, ['error' => 'method_not_allowed']);

$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body) || !isset($body['placements']) || !is_array($body['placements'])) {
    out(400, ['error' => 'bad_body', 'message' => 'expected {version, placements[], customActivities[]}']);
}

$fh = @fopen($file, 'c+');
if ($fh === false) out(500, ['error' => 'cannot_open', 'message' => 'api/data is not writable']);
if (!flock($fh, LOCK_EX)) { fclose($fh); out(500, ['error' => 'cannot_lock']); }

$cur = json_decode((string)stream_get_contents($fh), true);
$curVersion = (is_array($cur) && isset($cur['version'])) ? (int)$cur['version'] : 0;
$sent = isset($body['version']) ? (int)$body['version'] : -1;
$force = (($_GET['force'] ?? '') === '1');

if (!$force && $sent !== $curVersion) {
    flock($fh, LOCK_UN); fclose($fh);
    out(409, [
        'error' => 'conflict', 'yourVersion' => $sent, 'currentVersion' => $curVersion,
        'current' => is_array($cur) ? $cur : $empty,
    ]);
}

$next = [
    'format' => 'program-scheduler/schedule',
    'version' => $curVersion + 1,
    'pack' => $pack,
    'placements' => $body['placements'],
    'customActivities' => isset($body['customActivities']) && is_array($body['customActivities']) ? $body['customActivities'] : [],
    'savedAt' => gmdate('c'),
    'savedBy' => substr((string)($body['savedBy'] ?? ''), 0, 40),
];
$json = json_encode($next, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
ftruncate($fh, 0);
rewind($fh);
fwrite($fh, (string)$json);
fflush($fh);
flock($fh, LOCK_UN);
fclose($fh);

out(200, ['ok' => true, 'version' => $next['version'], 'savedAt' => $next['savedAt']]);
