import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

export class UpdateSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(4)
  passwordMinLength!: number;

  @Type(() => Number)
  @IsInt()
  @Min(4)
  kioskCodeLength!: number;

  @IsIn(['light', 'dark'])
  defaultTheme!: 'light' | 'dark';
}
