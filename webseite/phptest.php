<?php
echo '<h2>PHP läuft ✓</h2>';
echo '<p>PHP Version: ' . phpversion() . '</p>';
echo '<p>Server: ' . $_SERVER['SERVER_SOFTWARE'] . '</p>';

// Test ob mail() Funktion verfügbar ist
if (function_exists('mail')) {
    echo '<p style="color:green">✓ mail() Funktion verfügbar</p>';
} else {
    echo '<p style="color:red">✗ mail() Funktion NICHT verfügbar</p>';
}

// Test ob PHPMailer vorhanden ist
if (file_exists('phpmailer/PHPMailer.php')) {
    echo '<p style="color:green">✓ PHPMailer gefunden</p>';
} else {
    echo '<p style="color:red">✗ PHPMailer NICHT gefunden – Ordner phpmailer/ fehlt</p>';
}

// Test ob config.php vorhanden ist
if (file_exists('config.php')) {
    echo '<p style="color:green">✓ config.php gefunden</p>';
} else {
    echo '<p style="color:red">✗ config.php NICHT gefunden</p>';
}

// Test ob mail.php vorhanden ist
if (file_exists('mail.php')) {
    echo '<p style="color:green">✓ mail.php gefunden</p>';
} else {
    echo '<p style="color:red">✗ mail.php NICHT gefunden</p>';
}
?>
