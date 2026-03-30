import assert from "node:assert/strict";
import { appendSpeechTranscript } from "./speech-format";

function run() {
  assert.equal(
    appendSpeechTranscript("Erste Zeile", "neue Zeile Zweite Zeile", "de"),
    "Erste Zeile\nZweite Zeile",
  );

  assert.equal(
    appendSpeechTranscript("Einleitung", "neuer Absatz Zusammenfassung", "de"),
    "Einleitung\n\nZusammenfassung",
  );

  assert.equal(
    appendSpeechTranscript("Notiz", "Überschrift Baustellenbericht", "de"),
    "Notiz\n## Baustellenbericht",
  );

  assert.equal(
    appendSpeechTranscript("Liste", "nummerierte Liste Erster Punkt", "de"),
    "Liste\n1. Erster Punkt",
  );

  assert.equal(
    appendSpeechTranscript("Liste\n1. Alter Punkt", "nächster nummerierter Punkt Neuer Punkt", "de"),
    "Liste\n1. Alter Punkt\n2. Neuer Punkt",
  );

  assert.equal(
    appendSpeechTranscript("Hinweis", "fett Das ist wichtig fett", "de"),
    "Hinweis **Das ist wichtig**",
  );

  assert.equal(
    appendSpeechTranscript("Aufgaben", "Checkbox Material bestellt", "de"),
    "Aufgaben\n- [ ] Material bestellt",
  );

  assert.equal(
    appendSpeechTranscript("Das ist ein Satz", "Punkt setzen", "de"),
    "Das ist ein Satz.",
  );

  console.log("speech-format tests passed");
}

run();
