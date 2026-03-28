import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateNoteDto {
  @IsIn(['CUSTOMER', 'CONTACT'])
  entityType!: 'CUSTOMER' | 'CONTACT';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsBoolean()
  isPhoneNote?: boolean;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isPhoneNote?: boolean;
}
