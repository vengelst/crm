const DOCUMENT_TYPE_OPTIONS = [
  { value: "ALLGEMEIN", labelKey: "doc.typeGeneral" },
  { value: "VERTRAG", labelKey: "doc.typeContract" },
  { value: "ANGEBOT", labelKey: "doc.typeOffer" },
  { value: "AUFTRAG", labelKey: "doc.typeOrder" },
  { value: "RECHNUNG", labelKey: "doc.typeInvoice" },
  { value: "GUTSCHRIFT", labelKey: "doc.typeCreditNote" },
  { value: "LIEFERSCHEIN", labelKey: "doc.typeDeliveryNote" },
  { value: "PROTOKOLL", labelKey: "doc.typeProtocol" },
  { value: "ABNAHME", labelKey: "doc.typeAcceptance" },
  { value: "BERICHT", labelKey: "doc.typeReport" },
  { value: "KORRESPONDENZ", labelKey: "doc.typeCorrespondence" },
  { value: "FOTO", labelKey: "doc.typePhoto" },
  { value: "PLAN_ZEICHNUNG", labelKey: "doc.typePlanDrawing" },
  { value: "CHECKLISTE", labelKey: "doc.typeChecklist" },
  { value: "SICHERHEITSDOKUMENT", labelKey: "doc.typeSafetyDocument" },
  { value: "ZERTIFIKAT_NACHWEIS", labelKey: "doc.typeCertificate" },
  { value: "BEDIENUNGSANLEITUNG", labelKey: "doc.typeManual" },
  { value: "WARTUNG_SERVICE", labelKey: "doc.typeService" },
  { value: "STUNDENZETTEL", labelKey: "doc.typeTimesheet" },
] as const;

const LEGACY_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PROJEKTDOKUMENT: "doc.typeProjectDocument",
};

type Translate = (key: string) => string;

export function getDocumentTypeOptions(t: Translate) {
  return DOCUMENT_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));
}

export function getDocumentTypeLabel(value: string, t: Translate) {
  const option = DOCUMENT_TYPE_OPTIONS.find((entry) => entry.value === value);
  if (option) {
    return t(option.labelKey);
  }
  const legacyLabelKey = LEGACY_DOCUMENT_TYPE_LABELS[value];
  if (legacyLabelKey) {
    return t(legacyLabelKey);
  }
  return value;
}
