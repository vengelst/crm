const translations: Record<string, Record<string, string>> = {
  de: {
    'pdf.weeklyTimesheet': 'Wochen-Stundenzettel',
    'pdf.client': 'Auftraggeber',
    'pdf.customer': 'Kunde',
    'pdf.project': 'Projekt',
    'pdf.worker': 'Monteur',
    'pdf.date': 'Datum',
    'pdf.start': 'Beginn',
    'pdf.end': 'Ende',
    'pdf.break': 'Pause',
    'pdf.net': 'Netto',
    'pdf.total': 'Gesamt',
    'pdf.hours': 'Stunden',
    'pdf.workerSignature': 'Unterschrift Monteur',
    'pdf.customerSignature': 'Unterschrift Kunde',
    'pdf.generatedAt': 'Erstellt am',
    'pdf.comment': 'Kommentar',
    'pdf.page': 'Seite',
  },
  en: {
    'pdf.weeklyTimesheet': 'Weekly Timesheet',
    'pdf.client': 'Client',
    'pdf.customer': 'Customer',
    'pdf.project': 'Project',
    'pdf.worker': 'Technician',
    'pdf.date': 'Date',
    'pdf.start': 'Start',
    'pdf.end': 'End',
    'pdf.break': 'Break',
    'pdf.net': 'Net',
    'pdf.total': 'Total',
    'pdf.hours': 'Hours',
    'pdf.workerSignature': 'Technician Signature',
    'pdf.customerSignature': 'Customer Signature',
    'pdf.generatedAt': 'Generated on',
    'pdf.comment': 'Comment',
    'pdf.page': 'Page',
  },
};

export type SupportedLang = 'de' | 'en';

export function t(key: string, lang: SupportedLang = 'de'): string {
  return translations[lang]?.[key] ?? translations.de[key] ?? key;
}
