import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export type PrintEntityType = 'customer' | 'project' | 'reports' | 'tasks';

export const PRINT_ENTITY_TYPES: PrintEntityType[] = [
  'customer',
  'project',
  'reports',
  'tasks',
];

export class PrintBundleDto {
  @IsIn(PRINT_ENTITY_TYPES)
  entityType!: PrintEntityType;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  sections!: string[];

  @IsBoolean()
  includeDocuments!: boolean;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  documentIds!: string[];
}
