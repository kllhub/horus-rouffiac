import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator'
import { QUARTIERS, SUITES } from '../domaine/regles'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class NouveauSignalementDto {
  @Transform(trim) @IsString() @Length(2, 200) rue!: string
  @Transform(trim) @IsOptional() @IsString() @MaxLength(10) numero?: string
  @IsIn(QUARTIERS) quartier!: string
  @Transform(trim) @IsString() @Length(2, 60) type!: string
  @Transform(trim) @IsString() @Length(5, 2000) description!: string
  @Transform(trim) @IsOptional() @IsString() @MaxLength(80) nom?: string
  @Transform(trim) @IsOptional() @IsString() @MaxLength(120) contact?: string
}

export class ActionDto {
  @IsIn(['take', 'validate', 'reject', 'resolve']) action!: 'take' | 'validate' | 'reject' | 'resolve'
}

export class CorrectionDto {
  @Transform(trim) @IsString() @Length(2, 200) rue!: string
  @IsIn(QUARTIERS) quartier!: string
  @Transform(trim) @IsString() @Length(2, 60) type!: string
  @Transform(trim) @IsString() @Length(5, 2000) description!: string
}

export class FicheDto {
  @Transform(trim) @IsOptional() @IsString() @MaxLength(20) plaque?: string
  @IsOptional() @IsInt() @Min(0) @Max(999) nbTemoins?: number
  @Transform(trim) @IsOptional() @IsString() @MaxLength(200) suites?: string
}

export class SuiteDto {
  @IsIn(SUITES) suiteDonnee!: string
}
