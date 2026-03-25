<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

require '/var/www/vivahome/public/phpmailer/src/Exception.php';
require '/var/www/vivahome/public/phpmailer/src/PHPMailer.php';
require '/var/www/vivahome/public/phpmailer/src/SMTP.php';
require '/var/www/vivahome/public/config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function clean($s) {
    return htmlspecialchars(strip_tags(trim($s)), ENT_QUOTES, 'UTF-8');
}

$vorname   = clean($_POST['vorname']   ?? '');
$nachname  = clean($_POST['nachname']  ?? '');
$email     = filter_var(trim($_POST['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$betreff   = clean($_POST['betreff']   ?? 'Allgemeine Anfrage');
$nachricht = clean($_POST['nachricht'] ?? '');

if (!$vorname || !$nachname || !$email || !$nachricht) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Bitte alle Pflichtfelder ausfuellen.']);
    exit;
}

$name  = $vorname . ' ' . $nachname;
$datum = date('d.m.Y') . ' um ' . date('H:i') . ' Uhr';

function mailer() {
    $m = new PHPMailer(true);
    $m->isSMTP();
    $m->Host       = SMTP_HOST;
    $m->SMTPAuth   = true;
    $m->Username   = SMTP_USER;
    $m->Password   = SMTP_PASS;
    $m->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $m->Port       = SMTP_PORT;
    $m->CharSet    = 'UTF-8';
    $m->setFrom(SMTP_USER, 'Viva Home GmbH');
    return $m;
}

$ok1 = false;
$ok2 = false;

// Mail 1 -- Anfrage an Viva Home GmbH
try {
    $m = mailer();
    $m->addAddress('ve@vivahome.de', 'Viva Home GmbH');
    $m->addReplyTo($_POST['email'], $name);
    $m->Subject = '[Anfrage Website] ' . $betreff . ' - ' . $name;
    $m->isHTML(false);
    $m->Body =
        "Neue Kontaktanfrage ueber vivahome.de\n" .
        "=====================================\n" .
        "Datum:    {$datum}\n" .
        "Name:     {$name}\n" .
        "E-Mail:   {$_POST['email']}\n" .
        "Betreff:  {$betreff}\n\n" .
        "Nachricht:\n" .
        "----------\n" .
        "{$nachricht}\n\n" .
        "=====================================\n" .
        "Automatisch generiert von vivahome.de\n" .
        "Antworten Sie direkt auf diese Mail um den Kunden zu erreichen.";
    $m->send();
    $ok1 = true;
} catch (Exception $e) {
    error_log('VHG intern: ' . $e->getMessage());
}

// Mail 2 -- Bestaetigung an Kunden
try {
    $m = mailer();
    $m->addAddress($_POST['email'], $name);
    $m->addReplyTo('ve@vivahome.de', 'Viva Home GmbH');
    $m->Subject = 'Ihre Anfrage bei Viva Home GmbH - Wir melden uns!';
    $m->isHTML(false);
    $m->Body =
        "Guten Tag {$name},\n\n" .
        "vielen Dank fuer Ihre Anfrage! Wir melden uns in der Regel innerhalb von 24 Stunden.\n\n" .
        "Ihre Anfrage:\n" .
        "  Betreff:     {$betreff}\n" .
        "  Nachricht:   {$nachricht}\n" .
        "  Eingegangen: {$datum}\n\n" .
        "==============================================\n" .
        "UNSERE LEISTUNGEN FUER SIE\n" .
        "==============================================\n\n" .
        "- IP-VIDEOUEBERWACHUNG (CCTV)\n" .
        "  Planung, Montage und Inbetriebnahme professioneller\n" .
        "  Kamerasysteme. Innen/Aussen, hochaufloesend, Fernzugriff.\n\n" .
        "- EINBRUCHMELDEANLAGEN (EMA)\n" .
        "  Montage nach DIN VDE 0833. Kabelgebunden und Funk.\n" .
        "  VdS-zertifizierte Systeme inkl. Aufschaltung.\n\n" .
        "- BRANDMELDEANLAGEN (BMA)\n" .
        "  Installation und Wartung nach DIN 14675.\n" .
        "  Von Rauchmeldern bis zur Feuerwehraufschaltung.\n\n" .
        "- NETZWERKTECHNIK & LAN\n" .
        "  Strukturierte Verkabelung Cat6/Cat7, Glasfaser LWL,\n" .
        "  Serverinstallation, Teilnetze und WLAN.\n\n" .
        "- IT-SUPPORT & SERVICE\n" .
        "  Vor-Ort-Service fuer EDV und Netzwerkkomponenten.\n\n" .
        "- SUBUNTERNEHMER-LEISTUNGEN\n" .
        "  Elektriker-Zweierteams mit eigenem Fahrzeug und Werkzeug.\n" .
        "  NRW, bundesweit und europaweit verfuegbar.\n\n" .
        "==============================================\n" .
        "Viva Home GmbH - Volkhard Engelstaedter\n" .
        "An der Ringmauer 16 - 51492 Overath\n" .
        "Tel: +49 172 88 48 478\n" .
        "Email: ve@vivahome.de\n" .
        "Web: www.vivahome.de\n" .
        "HRB 95035 - Amtsgericht Koeln\n" .
        "==============================================\n";
    $m->send();
    $ok2 = true;
} catch (Exception $e) {
    error_log('VHG kunde: ' . $e->getMessage());
}

if ($ok1 && $ok2) {
    echo json_encode(['success' => true,
        'message' => 'Vielen Dank, ' . $vorname . '! Anfrage gesendet. Sie erhalten gleich eine Bestaetigung per E-Mail.']);
} elseif ($ok1) {
    echo json_encode(['success' => true,
        'message' => 'Anfrage erhalten! Bestaetigung konnte leider nicht zugestellt werden.']);
} else {
    http_response_code(500);
    echo json_encode(['success' => false,
        'message' => 'Fehler beim Senden. Bitte direkt an ve@vivahome.de schreiben.']);
}
?>
