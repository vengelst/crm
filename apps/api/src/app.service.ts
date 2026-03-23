import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      name: 'crm-monteur-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
