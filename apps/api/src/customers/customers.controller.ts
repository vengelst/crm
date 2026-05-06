import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SaveCustomerDto } from './dto/save-customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Permissions('customers.view')
  list() {
    return this.customersService.list();
  }

  @Get(':id')
  @Permissions('customers.view')
  getById(@Param('id') id: string) {
    return this.customersService.getById(id);
  }

  @Post()
  @Permissions('customers.create')
  create(@Body() dto: SaveCustomerDto) {
    return this.customersService.create(dto);
  }

  @Patch(':id')
  @Permissions('customers.edit')
  update(@Param('id') id: string, @Body() dto: SaveCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Get(':id/financials')
  @Permissions('customers.view')
  getFinancials(@Param('id') id: string) {
    return this.customersService.getFinancials(id);
  }

  @Delete('bulk')
  @Roles(RoleCode.SUPERADMIN)
  @Permissions('customers.delete')
  removeMany(@Body() body: { ids: string[] }) {
    return this.customersService.removeMany(body.ids ?? []);
  }

  @Delete(':id')
  @Permissions('customers.delete')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
