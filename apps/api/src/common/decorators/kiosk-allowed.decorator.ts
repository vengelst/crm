import { SetMetadata } from '@nestjs/common';

export const KIOSK_ALLOWED_KEY = 'kioskAllowed';

export const KioskAllowed = () => SetMetadata(KIOSK_ALLOWED_KEY, true);
