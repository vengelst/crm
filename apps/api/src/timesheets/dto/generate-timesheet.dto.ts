import { IsInt, IsString, Max, Min } from 'class-validator';

export class GenerateTimesheetDto {
  @IsString()
  workerId!: string;

  @IsString()
  projectId!: string;

  @IsInt()
  weekYear!: number;

  @IsInt()
  @Min(1)
  @Max(53)
  weekNumber!: number;
}
