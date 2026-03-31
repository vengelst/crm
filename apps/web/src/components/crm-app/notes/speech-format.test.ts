import assert from "node:assert/strict";
import { appendSpeechTranscript } from "./speech-format";

function run() {
  assert.equal(
    appendSpeechTranscript("Erste Zeile", "Zeilenumbruch Zweite Zeile", "de"),
    "Erste Zeile\nZweite Zeile",
  );

  assert.equal(
    appendSpeechTranscript("Einleitung", "Absatzumbruch Zusammenfassung", "de"),
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

  let splitBold = appendSpeechTranscript("", "fett Das ist", "de");
  splitBold = appendSpeechTranscript(splitBold, "wichtig fett", "de");
  assert.equal(splitBold, "**Das ist wichtig**");

  let splitHeading = appendSpeechTranscript("", "Ueberschrift", "de");
  splitHeading = appendSpeechTranscript(splitHeading, "Baustellenbericht", "de");
  assert.equal(splitHeading, "## Baustellenbericht");

  assert.equal(
    appendSpeechTranscript("", "ich rede nur ueber eine ueberschrift und nicht ueber einen echten befehl", "de"),
    "ich rede nur ueber eine ueberschrift und nicht ueber einen echten befehl",
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
