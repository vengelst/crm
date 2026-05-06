import { NextResponse } from "next/server";

const IMPRESSUM_TEXT = `Impressum
Viva Home GmbH
An Ringbauer 16
51491 Overath
Deutschland

Telefon: +49-172-8848478
E-Mail: info@vivahome.de

Vertreten durch den Geschäftsführer:
Volkhard Engelstäder

Registergericht: Amtsgericht Köln
Handelsregisternummer: HRB 95035

Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG:
DE295199745

Verbraucherstreitbeilegung
Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.`;

export async function GET() {
  return NextResponse.json({
    content: IMPRESSUM_TEXT,
    source: "static",
  });
}
