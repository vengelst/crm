import { IsString, MinLength } from 'class-validator';

/**
 * Notfall-Anmeldung (Break-Glass-Admin). Wird ausschliesslich gegen
 * Umgebungsvariablen geprueft – keine Datenbank notwendig.
 */
export class EmergencyLoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
